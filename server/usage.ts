import { AsyncLocalStorage } from 'node:async_hooks';
import { appendFile, mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';

// Token telemetry: every successful Gemini/OpenAI/Claude call is recorded with the token counts the provider reports
// and its cost (shared/prices.ts), logged to the terminal and appended to data/usage.jsonl, so totals survive restarts.
// Calls whose provider reports no tokens (OpenAI speech returns only audio, VoiceStudio is local) are counted as calls.

import { costOf, type TokenBreakdown } from '../shared/prices';
import type { UsageEntry, UsageKind, UsageProvider, UsageReport, UsageRow, UsageTotals } from '../shared/usage';
export type { UsageKind } from '../shared/usage';

/** KITTA_USAGE_FILE=off keeps the ledger in memory only (tests use it). */
const usageFile = () => process.env.KITTA_USAGE_FILE || join('data', 'usage.jsonl');
const persist = () => usageFile() !== 'off';
const since = new Date().toISOString();
let session: UsageEntry[] = [];
let writes: Promise<unknown> = Promise.resolve();

const scope = new AsyncLocalStorage<(e: UsageEntry) => void>();

/** Runs fn, passing every call recorded inside it (however deep, across awaits) to onEntry: a job's own tally. */
export function trackUsage<T>(onEntry: (e: UsageEntry) => void, fn: () => Promise<T>): Promise<T> {
  return scope.run(onEntry, fn);
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);

/** `tokens` splits the call the way prices are (cache, images); without it the call is priced from input/output. */
export function recordUsage(e: Omit<UsageEntry, 'at' | 'total' | 'cost'> & { total?: number | null; tokens?: TokenBreakdown }): UsageEntry {
  const input = num(e.input), output = num(e.output);
  const total = num(e.total) ?? (input !== null || output !== null ? (input ?? 0) + (output ?? 0) : null);
  const now = new Date();
  const cost = total === null ? null : costOf(e.provider, e.model, e.tokens ?? { input: input ?? 0, output: output ?? 0 }, now);
  const entry: UsageEntry = { at: now.toISOString(), provider: e.provider, model: e.model, kind: e.kind, input, output, total, cost };
  session.push(entry);
  if (session.length > 5000) session = session.slice(-5000);
  scope.getStore()?.(entry);
  console.log(`[usage] ${entry.provider} ${entry.model} ${entry.kind}: ` +
    (total === null ? 'no token count reported' : `${input ?? '?'} in + ${output ?? '?'} out = ${total} tokens`) +
    (cost === null ? '' : `, $${cost.toFixed(4)}`));
  if (persist()) {
    const file = usageFile();
    writes = writes.then(() => mkdir(dirname(file), { recursive: true })).then(() => appendFile(file, `${JSON.stringify(entry)}\n`)).catch(() => {});
  }
  return entry;
}

/** Gemini's usageMetadata (thinking tokens are billed as output; image output tokens cost more). */
export function recordGemini(kind: UsageKind, model: string, meta: unknown): UsageEntry {
  type Detail = { modality?: string; tokenCount?: number };
  const m = (meta ?? {}) as { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; totalTokenCount?: number; cachedContentTokenCount?: number; candidatesTokensDetails?: Detail[] };
  const out = num(m.candidatesTokenCount) === null && num(m.thoughtsTokenCount) === null ? null : (num(m.candidatesTokenCount) ?? 0) + (num(m.thoughtsTokenCount) ?? 0);
  const cached = num(m.cachedContentTokenCount) ?? 0;
  const image = (m.candidatesTokensDetails ?? []).filter((d) => d.modality === 'IMAGE').reduce((s, d) => s + (num(d.tokenCount) ?? 0), 0);
  const tokens = { input: Math.max(0, (num(m.promptTokenCount) ?? 0) - cached), cachedInput: cached, output: Math.max(0, (out ?? 0) - image), imageOutput: image };
  return recordUsage({ provider: 'gemini', model, kind, input: num(m.promptTokenCount), output: out, total: num(m.totalTokenCount), tokens });
}

/** OpenAI's usage block: input/output_tokens (images) or prompt/completion_tokens (chat), with cached and image details. */
export function recordOpenAI(kind: UsageKind, model: string, usage: unknown, provider: UsageProvider = 'openai'): UsageEntry {
  type Details = { cached_tokens?: number; image_tokens?: number };
  const u = (usage ?? {}) as Record<string, unknown> & { input_tokens_details?: Details; prompt_tokens_details?: Details; output_tokens_details?: Details };
  const input = num(u.input_tokens ?? u.prompt_tokens), output = num(u.output_tokens ?? u.completion_tokens);
  const inD = u.input_tokens_details ?? u.prompt_tokens_details ?? {}, outD = u.output_tokens_details ?? {};
  const cached = num(inD.cached_tokens) ?? 0, imageIn = num(inD.image_tokens) ?? 0, imageOut = num(outD.image_tokens) ?? 0;
  const tokens = { input: Math.max(0, (input ?? 0) - cached - imageIn), cachedInput: cached, imageInput: imageIn, output: Math.max(0, (output ?? 0) - imageOut), imageOutput: imageOut };
  return recordUsage({ provider, model, kind, input, output, total: num(u.total_tokens), tokens });
}

/** Anthropic's usage block: cache writes and reads are input too (thinking is billed as output). */
export function recordAnthropic(kind: UsageKind, model: string, usage: unknown): UsageEntry {
  const u = (usage ?? {}) as Record<string, unknown> & { cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number } };
  const write = num(u.cache_creation_input_tokens) ?? 0, read = num(u.cache_read_input_tokens) ?? 0;
  const write1h = Math.min(write, num(u.cache_creation?.ephemeral_1h_input_tokens) ?? 0);
  const input = num(u.input_tokens) === null ? null : num(u.input_tokens)! + write + read;
  const tokens = { input: num(u.input_tokens) ?? 0, cachedInput: read, cacheWrite: write - write1h, cacheWrite1h: write1h, output: num(u.output_tokens) ?? 0 };
  return recordUsage({ provider: 'anthropic', model, kind, input, output: num(u.output_tokens), tokens });
}

function totals(entries: UsageEntry[]): { all: UsageTotals; rows: UsageRow[] } {
  const zero = (): UsageTotals => ({ calls: 0, input: 0, output: 0, total: 0, unreported: 0, cost: 0, unpriced: 0, estimated: 0 });
  const add = (t: UsageTotals, e: UsageEntry) => {
    t.calls++;
    if (e.total === null) t.unreported++;
    t.input += e.input ?? 0; t.output += e.output ?? 0; t.total += e.total ?? 0;
    // lines written before costs were tracked: priced from input/output at the time (cache and image rates unknown)
    const old = !('cost' in e) && e.total !== null;
    const cost = old ? costOf(e.provider, e.model, { input: e.input ?? 0, output: e.output ?? 0 }, new Date(e.at)) : e.cost ?? null;
    if (cost === null) t.unpriced++;
    else { t.cost += cost; if (old) t.estimated++; }
  };
  const all = zero();
  const rows = new Map<string, UsageRow>();
  for (const e of entries) {
    add(all, e);
    const key = `${e.provider}\u0000${e.model}`;
    if (!rows.has(key)) rows.set(key, { provider: e.provider, model: e.model, ...zero() });
    add(rows.get(key)!, e);
  }
  return { all, rows: [...rows.values()].sort((a, b) => b.total - a.total || b.calls - a.calls) };
}

async function readLedger(): Promise<UsageEntry[]> {
  if (!persist()) return session;
  await writes;
  const text = await readFile(usageFile(), 'utf8').catch(() => '');
  return text.split('\n').flatMap((l) => { try { return l ? [JSON.parse(l) as UsageEntry] : []; } catch { return []; } });
}

/** Totals for this server run and for all time, per provider and model, plus the latest calls. */
export async function usageReport(): Promise<UsageReport> {
  const s = totals(session), a = totals(await readLedger());
  return { since, session: s.all, sessionRows: s.rows, allTime: a.all, allTimeRows: a.rows, recent: session.slice(-15).reverse() };
}

export async function resetUsage(): Promise<void> {
  session = [];
  await writes;
  if (persist()) await rm(usageFile(), { force: true });
}
