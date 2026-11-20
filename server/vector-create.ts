import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ImageProvider } from '../shared/types';
import { RUNNING_STAGES, type VectorJob } from '../shared/vector-job';
import { AnthropicError } from './anthropic';
import { CHARACTERS_DIR } from './characters';
import { GeminiError } from './gemini';
import { OpenAIError } from './openai';
import { trackUsage } from './usage';
import { paintFaceSheet, paintFront, type VectorArtInput } from './vector-art';
import { drawProvider, drawVector } from './vector-draw';

// Creating a vector character in the background (version 2 planning/vector-create-plan.md, step 4): front picture,
// face sheet, drawing rounds, save. Everything lives in data/characters/<id>/work/ (job.json plus every finished
// picture and round), so a job survives the app being closed: a restarted server shows it as interrupted, and Resume
// skips the pictures that are already paid for. Cancel stops the request in flight. The character's meta.json is
// written last, so the library only lists a finished character.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const WORK_FILES = ['front.png', 'sheet_face.png', 'check.png'] as const;
const MAX_ROUNDS = 4;

const dirOf = (id: string) => join(CHARACTERS_DIR, id);
const workOf = (id: string) => join(dirOf(id), 'work');
/** Jobs running in this server: their cancel switch and a promise that settles when the run has saved its end state. */
const running = new Map<string, { ac: AbortController; done: Promise<void> }>();

export class VectorJobError extends Error {
  constructor(public code: 'not_found' | 'busy') { super(code); }
}

async function writeJob(job: VectorJob): Promise<void> {
  const tmp = join(workOf(job.id), `job-${randomUUID()}.tmp`);
  await writeFile(tmp, JSON.stringify(job, null, 2));
  await rename(tmp, join(workOf(job.id), 'job.json'));
}

/** A job as stored, except that a running stage with nothing running here (the server restarted) reads as interrupted. */
export async function getVectorJob(id: string): Promise<VectorJob> {
  if (!UUID_RE.test(id)) throw new VectorJobError('not_found');
  let job: VectorJob;
  try {
    job = JSON.parse(await readFile(join(workOf(id), 'job.json'), 'utf8')) as VectorJob;
  } catch {
    throw new VectorJobError('not_found');
  }
  return RUNNING_STAGES.includes(job.stage) && !running.has(id) ? { ...job, stage: 'interrupted', message: 'Stopped when Kitta closed. Resume to carry on.' } : job;
}

/** Jobs that have not finished: running, failed, cancelled or interrupted. Newest first. */
export async function listVectorJobs(): Promise<VectorJob[]> {
  if (!existsSync(CHARACTERS_DIR)) return [];
  const ids = (await readdir(CHARACTERS_DIR)).filter((d) => UUID_RE.test(d) && existsSync(join(workOf(d), 'job.json')));
  const jobs = await Promise.all(ids.map((id) => getVectorJob(id).catch(() => null)));
  return jobs.filter((j): j is VectorJob => j !== null && j.stage !== 'done').sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/** A finished picture of the job (front, face sheet, latest check picture), or null. */
export function vectorJobFile(id: string, file: string): string | null {
  if (!UUID_RE.test(id) || !(WORK_FILES as readonly string[]).includes(file)) return null;
  const p = join(workOf(id), file);
  return existsSync(p) ? p : null;
}

export interface StartInput { name: string; description: string; imageProvider: ImageProvider; reference?: { data: Buffer; mimeType: string } }

export async function startVectorJob(inp: StartInput): Promise<VectorJob> {
  const id = randomUUID();
  await mkdir(workOf(id), { recursive: true });
  if (inp.reference) await writeFile(join(workOf(id), 'reference.json'), JSON.stringify({ mimeType: inp.reference.mimeType, data: inp.reference.data.toString('base64') }));
  const now = new Date().toISOString();
  const job: VectorJob = {
    id, name: inp.name, description: inp.description, imageProvider: inp.imageProvider, drawProvider: drawProvider(),
    stage: 'front', round: 0, maxRounds: MAX_ROUNDS, errors: null, cost: 0, hasFront: false, hasFace: false, hasCheck: false, startedAt: now, updatedAt: now,
  };
  await writeJob(job);
  launch(id);
  return job;
}

export async function resumeVectorJob(id: string): Promise<VectorJob> {
  const job = await getVectorJob(id);
  if (running.has(id)) return job;
  if (job.stage === 'done') throw new VectorJobError('busy');
  // show it as running at once (the next unfinished step), so the form follows it straight away
  const { message: _m, ...rest } = job;
  await writeJob({ ...rest, stage: !job.hasFront ? 'front' : !job.hasFace ? 'face' : 'drawing', updatedAt: new Date().toISOString() });
  launch(id);
  return getVectorJob(id);
}

export async function cancelVectorJob(id: string): Promise<VectorJob> {
  const job = await getVectorJob(id);
  const r = running.get(id);
  if (r) {
    r.ac.abort();
    await r.done; // the run saves 'cancelled' itself
  } else if (job.stage !== 'done' && job.stage !== 'cancelled') {
    await writeJob({ ...job, stage: 'cancelled', message: 'Cancelled.', updatedAt: new Date().toISOString() });
  }
  return getVectorJob(id);
}

/** Deletes an unfinished job and its pictures. */
export async function discardVectorJob(id: string): Promise<void> {
  const job = await getVectorJob(id);
  if (job.stage === 'done') throw new VectorJobError('busy');
  if (running.has(id)) await cancelVectorJob(id);
  await rm(dirOf(id), { recursive: true, force: true });
}

function launch(id: string) {
  const ac = new AbortController();
  const done = run(id, ac.signal).finally(() => running.delete(id));
  running.set(id, { ac, done });
}

/** Words for the person: what went wrong and what to do. */
export function jobMessage(e: unknown): string {
  const code = e instanceof OpenAIError || e instanceof AnthropicError || e instanceof GeminiError ? e.code : '';
  const who = e instanceof AnthropicError ? 'Claude' : e instanceof GeminiError ? 'Gemini' : 'OpenAI';
  switch (code) {
    case 'no_key': return `${who} has no API key. Add it to .env, restart Kitta, then Resume.`;
    case 'bad_key': return `${who} refused the API key. Check it in .env, then Resume.`;
    case 'no_credit': return `Your ${who} account is out of credit. Add credit, then Resume.`;
    case 'rate_limited': case 'busy': case 'timed_out': case 'unreachable': return `${who} is busy or over its limit. Resume in a few minutes; finished pictures are kept.`;
    case 'refused': case 'no_image': return `${who} declined to draw this character. Try a different description.`;
    default: return `Something went wrong${code ? ` (${who}: ${code})` : ''}. Resume to try again; finished pictures are kept.`;
  }
}

async function run(id: string, signal: AbortSignal): Promise<void> {
  const work = workOf(id);
  let job = JSON.parse(await readFile(join(work, 'job.json'), 'utf8')) as VectorJob;
  const save = (patch: Partial<VectorJob>) => { job = { ...job, ...patch, message: patch.message, updatedAt: new Date().toISOString() }; return writeJob(job); };
  const stop = () => { if (signal.aborted) throw new DOMException('Cancelled', 'AbortError'); };
  try {
    await trackUsage((e) => { job.cost += e.cost ?? 0; }, async () => {
      const refPath = join(work, 'reference.json');
      const ref = existsSync(refPath) ? JSON.parse(await readFile(refPath, 'utf8')) as { mimeType: string; data: string } : null;
      const art: VectorArtInput = { description: job.description || `${job.name}, as in the reference picture`, reference: ref ? { mimeType: ref.mimeType, data: Buffer.from(ref.data, 'base64') } : undefined };

      let front: Buffer;
      if (job.hasFront) front = await readFile(join(work, 'front.png'));
      else {
        await save({ stage: 'front' });
        front = await paintFront(job.imageProvider, art);
        await writeFile(join(work, 'front.png'), front);
        await save({ hasFront: true });
      }
      stop();
      let face: Buffer;
      if (job.hasFace) face = await readFile(join(work, 'sheet_face.png'));
      else {
        await save({ stage: 'face' });
        face = await paintFaceSheet(job.imageProvider, art, front);
        await writeFile(join(work, 'sheet_face.png'), face);
        await save({ hasFace: true });
      }
      stop();

      await save({ stage: 'drawing', round: 0, errors: null });
      const result = await drawVector({
        name: job.name, front, faceSheet: face, notes: job.description || undefined, maxRounds: job.maxRounds, provider: job.drawProvider, signal,
        onRound: async (r) => {
          if (r.doc !== undefined) await writeFile(join(work, `round-${r.round}.vector.json`), JSON.stringify(r.doc));
          if (r.sheet) await writeFile(join(work, 'check.png'), r.sheet);
          await save({ round: r.round, ...(r.doc !== undefined ? { errors: r.errors.length } : {}), hasCheck: job.hasCheck || Boolean(r.sheet) });
        },
      });
      stop();
      if (!result.doc) throw new Error('no doc was drawn');
      const dir = dirOf(id);
      await writeFile(join(dir, 'vector.json'), JSON.stringify(result.doc));
      const tmp = join(dir, `meta-${randomUUID()}.tmp`);
      await writeFile(tmp, JSON.stringify({ kind: 'vector', id, name: job.name }, null, 2));
      await rename(tmp, join(dir, 'meta.json'));
      await save({ stage: 'done', errors: result.errors.length });
    });
  } catch (e) {
    if (signal.aborted || (e as { name?: string })?.name === 'AbortError') await save({ stage: 'cancelled', message: 'Cancelled. Resume to carry on; finished pictures are kept.' });
    else {
      console.error(`vector job ${id} failed`, e);
      await save({ stage: 'failed', message: jobMessage(e) });
    }
  }
}
