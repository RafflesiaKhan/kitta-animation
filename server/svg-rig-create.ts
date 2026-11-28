import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Resvg } from '@resvg/resvg-js';
import { KNOWN_MODELS } from '../shared/prices';
import { SVG_RIG_VIEWS, validateSvgRigPack, validateSvgRigView, type SvgRigViewId } from '../shared/svg-rig';
import { assemblePack, bindView, mirrorView, type ViewArt } from '../shared/svg-rig-motion';
import { RIG_RUNNING_STAGES, type RigJob, type RigModel, type RigProvider } from '../shared/svg-rig-job';
import { SvgRigCharacterView } from '../shared/character/SvgRigCharacter';
import type { FrameState } from '../shared/types';
import { anthropicModel, claudeToolChat } from './anthropic';
import { CHARACTERS_DIR } from './characters';
import { drawModel, openaiToolChat } from './openai';
import { setting } from './settings';
import type { ChatBlock, ToolChat, ToolSpec } from './tool-chat';
import { trackUsage } from './usage';
import { jobMessage } from './vector-create';
import { publishRig } from './svg-rig-storage';

// Creating a reference-made SVG character in the background (version 2 planning/reference-svg-character-plan.md §6):
// design → front (validated, rendered and reviewed against the reference) → other views → bind the shared motion →
// validate the whole pack → publish. Every accepted result is saved in data/characters/<id>/work/, so Resume skips
// what is already paid for; meta.json is written last, so the library only lists finished characters.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const RIG_WORK_FILES = ['reference.png', 'check.png', 'sheet.png'] as const;
/** Bounds per run: structural repairs per view, and model calls in all (a resumed run gets a fresh budget). */
const MAX_REPAIRS = 2;
const MAX_CALLS = 16;
const SKILL = join(import.meta.dirname, '../skills/kitta-svg-character');
const skill = (...files: string[]) => files.map((f) => readFileSync(join(SKILL, f), 'utf8')).join('\n\n');

const dirOf = (id: string) => join(CHARACTERS_DIR, id);
const workOf = (id: string) => join(dirOf(id), 'work');
const running = new Map<string, { ac: AbortController; done: Promise<void> }>();

export class RigJobError extends Error { constructor(public code: 'not_found' | 'busy' | 'bad_model') { super(code); } }
class StopError extends Error {}

// ---------- models ----------

const hasKey = (p: RigProvider) => Boolean(setting(p === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'));
/** Models that can draw from a reference, for providers with a key; the configured drawing model comes first. */
export function rigModels(): RigModel[] {
  const out: RigModel[] = [];
  const add = (provider: RigProvider, model: string | undefined) => {
    if (model && hasKey(provider) && !out.some((m) => m.provider === provider && m.model === model)) out.push({ provider, model, label: `${provider === 'anthropic' ? 'Claude' : 'OpenAI'} · ${model}` });
  };
  add('anthropic', anthropicModel());
  add('openai', drawModel());
  for (const m of KNOWN_MODELS) if (m.jobs.includes('vector') && (m.provider === 'anthropic' || m.provider === 'openai')) add(m.provider, m.id);
  return out;
}

/** The conversation for one stage; tests replace it. */
export let chatFor = (provider: RigProvider, system: string, tool: ToolSpec, model: string): ToolChat =>
  provider === 'anthropic' ? claudeToolChat(system, tool, model) : openaiToolChat(system, tool, model);
export function setRigChatForTests(f: typeof chatFor) { chatFor = f; }

// ---------- tools ----------

const DESIGN_TOOL: ToolSpec = {
  name: 'describe_character',
  description: 'Describe the character in the reference so every view can be drawn consistently.',
  parameters: {
    properties: {
      name: { type: 'string', description: 'A short name for the character.' },
      bodyFamily: { type: 'string', enum: ['human', 'upright-animal', 'quadruped', 'bird', 'other'] },
      symmetric: { type: 'boolean', description: 'true when mirroring the left-facing views gives correct right-facing views.' },
      design: { type: 'string', description: 'Silhouette, proportions with canvas numbers, palette (hex), face, costume, asymmetric items.' },
      inferred: { type: 'string', description: 'What the reference does not show and what you assumed.' },
    },
    required: ['bodyFamily', 'symmetric', 'design'],
  },
};
const VIEW_TOOL: ToolSpec = {
  name: 'draw_view',
  description: 'Submit the complete artwork of one view (every part, not a diff).',
  parameters: {
    properties: {
      parts: { type: 'array', items: { type: 'object' }, description: 'Parts in draw order: {id, parent, x, y, shapes, variants?}.' },
      mouthPart: { type: ['string', 'null'], description: '"mouth", or null for the back view.' },
      waistY: { type: 'number' },
      groundY: { type: 'number' },
      notes: { type: 'string', description: 'One or two lines: what you drew or changed.' },
    },
    required: ['parts', 'mouthPart', 'waistY', 'groundY'],
  },
};

interface Design { name?: string; bodyFamily: string; symmetric: boolean; design: string; inferred?: string }

/** Problems with one submitted view, in words the model can act on. */
export function viewProblems(value: unknown, view: SvgRigViewId): string[] {
  const v = value as Partial<ViewArt> | null;
  if (!v || typeof v !== 'object' || !Array.isArray(v.parts)) return ['parts: expected an array of parts'];
  const art: ViewArt = { parts: v.parts, mouthPart: v.mouthPart ?? null, waistY: Number(v.waistY), groundY: Number(v.groundY) };
  const out = validateSvgRigView(bindView(art));
  if (view !== 'back' && art.mouthPart === null) out.push('mouthPart: this view speaks, so it needs "mouth"');
  return out;
}
const artOf = (v: Record<string, unknown>): ViewArt => ({ parts: v.parts as ViewArt['parts'], mouthPart: (v.mouthPart as string | null) ?? null, waistY: Number(v.waistY), groundY: Number(v.groundY) });

// ---------- check pictures ----------

const REST: FrameState = { expression: 'neutral', mouth: 'X', gesture: 'none', gestureProgress: 0, blink: false, bob: 0, timeMs: 0 };
/** A sheet of the art rendered by Kitta's own renderer, as PNG (missing views fall back to the front, for previews). */
export function renderSheet(art: Partial<Record<SvgRigViewId, ViewArt>>, cells: { view?: SvgRigViewId; framing?: 'waist' | 'full'; frame?: Partial<FrameState> }[]): Buffer {
  const front = art.front!;
  const pack = assemblePack(Object.fromEntries(SVG_RIG_VIEWS.map((v) => [v, art[v] ?? front])) as Record<SvgRigViewId, ViewArt>, 'human');
  const S = 320, cols = Math.min(cells.length, 6), rows = Math.ceil(cells.length / cols);
  const inner = cells.map((c, i) => `<g transform="translate(${(i % cols) * S} ${Math.floor(i / cols) * S})">${renderToStaticMarkup(createElement(SvgRigCharacterView, {
    character: { kind: 'svg-rig', id: 'preview', name: '', packVersion: 1, pack, view: c.view, framing: c.framing }, frame: { ...REST, ...c.frame }, width: S, height: S,
  }))}</g>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * S}" height="${rows * S}"><rect width="100%" height="100%" fill="#f4f1ea"/>${inner}</svg>`;
  return Buffer.from(new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng());
}
const FRONT_CHECK: Parameters<typeof renderSheet>[1] = [
  { framing: 'full' }, { frame: { expression: 'happy' } }, { frame: { expression: 'angry', mouth: 'C' } },
  { frame: { expression: 'surprised', mouth: 'D' } }, { framing: 'full', frame: { gesture: 'wave', gestureProgress: 0.5 } }, { framing: 'full', frame: { gesture: 'explain', gestureProgress: 0.5 } },
];
const FINAL_SHEET: Parameters<typeof renderSheet>[1] = [
  ...SVG_RIG_VIEWS.map((view) => ({ view, framing: 'full' as const })),
  { frame: { expression: 'happy' } }, { frame: { expression: 'sad' } }, { frame: { expression: 'angry', mouth: 'C' } },
  { frame: { expression: 'surprised', mouth: 'D' } }, { framing: 'full', frame: { gesture: 'wave', gestureProgress: 0.5 } }, { view: 'profile-left', framing: 'full', frame: { gesture: 'walk', gestureProgress: 0.125, gestureDurationMs: 2000 } },
];

// ---------- jobs ----------

export async function getRigJob(id: string): Promise<RigJob> {
  if (!UUID_RE.test(id)) throw new RigJobError('not_found');
  let job: RigJob;
  try { job = JSON.parse(await readFile(join(workOf(id), 'rig-job.json'), 'utf8')) as RigJob; } catch { throw new RigJobError('not_found'); }
  return RIG_RUNNING_STAGES.includes(job.stage) && !running.has(id) ? { ...job, stage: 'interrupted', message: 'Stopped when Kitta closed. Resume to carry on.' } : job;
}

/** Unfinished jobs (running, failed, cancelled or interrupted), newest first. */
export async function listRigJobs(): Promise<RigJob[]> {
  if (!existsSync(CHARACTERS_DIR)) return [];
  const ids = (await readdir(CHARACTERS_DIR)).filter((d) => UUID_RE.test(d) && existsSync(join(workOf(d), 'rig-job.json')));
  const jobs = await Promise.all(ids.map((id) => getRigJob(id).catch(() => null)));
  return jobs.filter((j): j is RigJob => j !== null && j.stage !== 'done').sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function rigJobFile(id: string, file: string): string | null {
  if (!UUID_RE.test(id) || !(RIG_WORK_FILES as readonly string[]).includes(file)) return null;
  const p = join(workOf(id), file);
  return existsSync(p) ? p : null;
}

export interface StartRigInput { name: string; description: string; provider: RigProvider; model: string; reference: Buffer }

/** `reference` is a PNG (the route converts uploads). The model must be one rigModels() offers. */
export async function startRigJob(inp: StartRigInput): Promise<RigJob> {
  if (!rigModels().some((m) => m.provider === inp.provider && m.model === inp.model)) throw new RigJobError('bad_model');
  const id = randomUUID();
  await mkdir(workOf(id), { recursive: true });
  await writeFile(join(workOf(id), 'reference.png'), inp.reference);
  const now = new Date().toISOString();
  const job: RigJob = {
    id, name: inp.name || 'New character', description: inp.description, provider: inp.provider, model: inp.model, stage: 'design',
    viewsDone: [], viewsPlanned: ['front', 'three-quarter-left', 'profile-left', 'back'], calls: 0, repairs: 0, input: 0, output: 0, cost: 0,
    hasCheck: false, hasSheet: false, startedAt: now, updatedAt: now,
  };
  await saveJob(job);
  launch(id);
  return job;
}

async function saveJob(job: RigJob): Promise<void> {
  const tmp = join(workOf(job.id), `rig-job-${randomUUID()}.tmp`);
  await writeFile(tmp, JSON.stringify(job, null, 2));
  await rename(tmp, join(workOf(job.id), 'rig-job.json'));
}

export async function resumeRigJob(id: string): Promise<RigJob> {
  const job = await getRigJob(id);
  if (running.has(id)) return job;
  if (job.stage === 'done') throw new RigJobError('busy');
  const { message: _m, ...rest } = job;
  await saveJob({ ...rest, stage: existsSync(join(workOf(id), 'design.json')) ? (job.viewsDone.includes('front') ? 'views' : 'front') : 'design', updatedAt: new Date().toISOString() });
  launch(id);
  return getRigJob(id);
}

export async function cancelRigJob(id: string): Promise<RigJob> {
  const job = await getRigJob(id);
  const r = running.get(id);
  if (r) { r.ac.abort(); await r.done; }
  else if (job.stage !== 'done' && job.stage !== 'cancelled') await saveJob({ ...job, stage: 'cancelled', message: 'Cancelled.', updatedAt: new Date().toISOString() });
  return getRigJob(id);
}

export async function discardRigJob(id: string): Promise<void> {
  const job = await getRigJob(id);
  if (job.stage === 'done') throw new RigJobError('busy');
  if (running.has(id)) await cancelRigJob(id);
  await rm(dirOf(id), { recursive: true, force: true });
}

function launch(id: string) {
  const ac = new AbortController();
  const done = run(id, ac.signal).finally(() => running.delete(id));
  running.set(id, { ac, done });
}

async function run(id: string, signal: AbortSignal): Promise<void> {
  const work = workOf(id);
  let job = JSON.parse(await readFile(join(work, 'rig-job.json'), 'utf8')) as RigJob;
  const save = (patch: Partial<RigJob>) => { job = { ...job, ...patch, message: patch.message, updatedAt: new Date().toISOString() }; return saveJob(job); };
  const stop = () => { if (signal.aborted) throw new DOMException('Cancelled', 'AbortError'); };
  let callsThisRun = 0;
  const send = async (chat: ToolChat, blocks: ChatBlock[], repair = false) => {
    if (++callsThisRun > MAX_CALLS) throw new StopError(`Stopped at the limit of ${MAX_CALLS} model calls for one run. Resume to continue; finished views are kept.`);
    stop();
    const r = await chat.send(blocks, signal);
    await save({ calls: job.calls + 1, repairs: job.repairs + (repair ? 1 : 0) });
    return r.input as Record<string, unknown>;
  };
  try {
    await trackUsage((e) => { job.cost += e.cost ?? 0; job.input += e.input ?? 0; job.output += e.output ?? 0; }, async () => {
      const reference = await readFile(join(work, 'reference.png'));
      const refBlock: ChatBlock = { type: 'image', png: reference };
      const notes = job.description ? `\n\nThe person's notes about the character: ${job.description}` : '';

      // 1. design
      let design: Design;
      const designPath = join(work, 'design.json');
      if (existsSync(designPath)) design = JSON.parse(await readFile(designPath, 'utf8')) as Design;
      else {
        await save({ stage: 'design' });
        const chat = chatFor(job.provider, `${skill('SKILL.md', 'reference-to-design.md')}\n\nAnswer by calling describe_character exactly once.`, DESIGN_TOOL, job.model);
        design = await send(chat, [refBlock, { type: 'text', text: `Describe the character in this reference picture.${notes}` }]) as unknown as Design;
        if (typeof design?.design !== 'string') throw new StopError('The model did not describe the character. Resume to try again.');
        await writeFile(designPath, JSON.stringify(design, null, 2));
        const planned = design.symmetric === false ? ['front', 'three-quarter-left', 'three-quarter-right', 'profile-left', 'profile-right', 'back'] : job.viewsPlanned;
        await save({ viewsPlanned: planned, inferred: design.inferred, name: job.name === 'New character' && design.name ? String(design.name).slice(0, 40) : job.name });
      }
      if (design.bodyFamily !== 'human' && design.bodyFamily !== 'upright-animal') {
        throw new StopError(`This looks like a ${design.bodyFamily} character. Only people and two-legged animals are supported for now.`);
      }
      const designText = `Character design (follow it):\n${design.design}${design.inferred ? `\nInferred: ${design.inferred}` : ''}${notes}`;

      // 2 + 3. views, each validated and repaired; the front is also rendered and reviewed against the reference
      const art: Partial<Record<SvgRigViewId, ViewArt>> = {};
      for (const v of job.viewsPlanned as SvgRigViewId[]) {
        const p = join(work, `view-${v}.json`);
        if (existsSync(p)) art[v] = JSON.parse(await readFile(p, 'utf8')) as ViewArt;
      }
      const drawView = async (view: SvgRigViewId): Promise<ViewArt> => {
        const front = view !== 'front' ? art.front : undefined;
        const system = `${skill('SKILL.md', 'rig-contract.md', ...(front ? ['views.md'] : []))}\n\nAnswer every turn by calling draw_view exactly once with the complete view.`;
        const chat = chatFor(job.provider, system, VIEW_TOOL, job.model);
        const blocks: ChatBlock[] = [refBlock, { type: 'text', text: `${designText}\n\nDraw the ${view} view.` }];
        if (front) blocks.push({ type: 'text', text: `The accepted front view (same ids, joints, colours and line weight):\n${JSON.stringify(front)}` }, { type: 'image', png: renderSheet({ front }, [{ framing: 'full' }]) });
        const attempt = async (first: ChatBlock[]) => {
          let out = await send(chat, first);
          for (let i = 0; ; i++) {
            const problems = viewProblems(out, view);
            if (!problems.length) return artOf(out);
            if (i >= MAX_REPAIRS) throw new StopError(`The ${view} view still had problems after ${MAX_REPAIRS} repairs (${problems.slice(0, 2).join('; ')}). Resume to try again.`);
            out = await send(chat, [{ type: 'text', text: `Kitta's check found these problems:\n- ${problems.slice(0, 25).join('\n- ')}\n\nCall draw_view again with the complete corrected view.` }], true);
          }
        };
        let accepted = await attempt(blocks);
        if (view === 'front') {
          // visual review: the model sees its drawing as Kitta renders it, next to the reference
          const check = renderSheet({ front: accepted }, FRONT_CHECK);
          await writeFile(join(work, 'check.png'), check);
          await save({ hasCheck: true });
          const reviewed = await send(chat, [
            { type: 'text', text: 'Your view as Kitta renders it: full body, happy, angry talking, surprised talking, waving, explaining. Compare it with the reference: likeness, proportions, detached or misplaced joints, wrong layering, mouths and hands. Call draw_view with the complete improved view (or the same one if it is right).' },
            { type: 'image', png: check },
          ], true);
          if (!viewProblems(reviewed, view).length) accepted = artOf(reviewed);
          await writeFile(join(work, 'check.png'), renderSheet({ front: accepted }, FRONT_CHECK));
        }
        return accepted;
      };
      for (const v of job.viewsPlanned as SvgRigViewId[]) {
        if (art[v]) continue;
        await save({ stage: v === 'front' ? 'front' : 'views' });
        art[v] = await drawView(v);
        await writeFile(join(work, `view-${v}.json`), JSON.stringify(art[v]));
        await save({ viewsDone: [...new Set([...job.viewsDone, v])] });
        stop();
      }

      // 4. bind the shared motion, check the whole pack, publish
      await save({ stage: 'assemble' });
      art['three-quarter-right'] ??= mirrorView(art['three-quarter-left']!);
      art['profile-right'] ??= mirrorView(art['profile-left']!);
      const pack = assemblePack(art as Record<SvgRigViewId, ViewArt>, design.bodyFamily);
      const errors = validateSvgRigPack(pack);
      if (errors.length) throw new StopError(`The finished character did not pass the check (${errors.slice(0, 2).join('; ')}).`);
      await writeFile(join(work, 'sheet.png'), renderSheet(art, FINAL_SHEET));
      await save({ hasSheet: true });
      stop();
      await publishRig(id, job.name, pack);
      await save({ stage: 'done' });
    });
  } catch (e) {
    if (signal.aborted || (e as { name?: string })?.name === 'AbortError') await save({ stage: 'cancelled', message: 'Cancelled. Resume to carry on; finished views are kept.' });
    else if (e instanceof StopError) await save({ stage: 'failed', message: e.message });
    else {
      console.error(`svg character job ${id} failed`, e);
      await save({ stage: 'failed', message: jobMessage(e).replace('pictures are kept', 'views are kept') });
    }
  }
}
