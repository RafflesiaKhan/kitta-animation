import { appendFile, mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';

// Token telemetry: every successful Gemini/OpenAI call is recorded with the token counts the provider reports,
// logged to the terminal and appended to data/usage.jsonl, so totals survive restarts. Calls whose provider
// reports no tokens (OpenAI speech returns only audio, VoiceStudio is local) are counted as calls.

import type { UsageEntry, UsageKind, UsageProvider, UsageReport, UsageRow, UsageTotals } from '../shared/usage';
export type { UsageKind } from '../shared/usage';

/** KITTA_USAGE_FILE=off keeps the ledger in memory only (tests use it). */
const usageFile = () => process.env.KITTA_USAGE_FILE || join('data', 'usage.jsonl');
const persist = () => usageFile() !== 'off';
const since = new Date().toISOString();
let session: UsageEntry[] = [];
let writes: Promise<unknown> = Promise.resolve();

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);

export function recordUsage(e: Omit<UsageEntry, 'at' | 'total'> & { total?: number | null }): UsageEntry {
  const input = num(e.input), output = num(e.output);
  const total = num(e.total) ?? (input !== null || output !== null ? (input ?? 0) + (output ?? 0) : null);
  const entry: UsageEntry = { at: new Date().toISOString(), provider: e.provider, model: e.model, kind: e.kind, input, output, total };
  session.push(entry);
  if (session.length > 5000) session = session.slice(-5000);
  console.log(`[usage] ${entry.provider} ${entry.model} ${entry.kind}: ` +
    (total === null ? 'no token count reported' : `${input ?? '?'} in + ${output ?? '?'} out = ${total} tokens`));
  if (persist()) {
    const file = usageFile();
    writes = writes.then(() => mkdir(dirname(file), { recursive: true })).then(() => appendFile(file, `${JSON.stringify(entry)}\n`)).catch(() => {});
  }
  return entry;
}

/** Gemini's usageMetadata (thinking tokens are billed as output). */
export function recordGemini(kind: UsageKind, model: string, meta: unknown) {
  const m = (meta ?? {}) as { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; totalTokenCount?: number };
  const out = num(m.candidatesTokenCount) === null && num(m.thoughtsTokenCount) === null ? null : (num(m.candidatesTokenCount) ?? 0) + (num(m.thoughtsTokenCount) ?? 0);
  recordUsage({ provider: 'gemini', model, kind, input: num(m.promptTokenCount), output: out, total: num(m.totalTokenCount) });
}

/** OpenAI's usage block: input/output_tokens (images) or prompt/completion_tokens (chat). */
export function recordOpenAI(kind: UsageKind, model: string, usage: unknown, provider: UsageProvider = 'openai') {
  const u = (usage ?? {}) as Record<string, unknown>;
  recordUsage({ provider, model, kind, input: num(u.input_tokens ?? u.prompt_tokens), output: num(u.output_tokens ?? u.completion_tokens), total: num(u.total_tokens) });
}

function totals(entries: UsageEntry[]): { all: UsageTotals; rows: UsageRow[] } {
  const zero = (): UsageTotals => ({ calls: 0, input: 0, output: 0, total: 0, unreported: 0 });
  const add = (t: UsageTotals, e: UsageEntry) => {
    t.calls++;
    if (e.total === null) t.unreported++;
    t.input += e.input ?? 0; t.output += e.output ?? 0; t.total += e.total ?? 0;
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
