import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { checkVector } from '../shared/vector-avator/check';
import type { VectorDoc } from '../shared/vector-avator/renderers/vector/vdata';
import type { UsageEntry } from '../shared/usage';
import { claudeToolChat } from './anthropic';
import { openaiToolChat } from './openai';
import type { ChatBlock, ToolChat, ToolSpec } from './tool-chat';
import { checkSheet } from './vector-check';

// The drawing loop of version 2 planning/vector-create-plan.md: the drawing model draws the parts as one vector.json
// from the front picture and the face sheet, the server checks it and draws check pictures, and the model fixes it,
// for up to maxRounds rounds. The best version (fewest check errors, latest on a tie) is kept.

const SKILL = join(import.meta.dirname, '../shared/vector-avator/skill');
const SAMPLE = join(import.meta.dirname, '../shared/vector-avator/sample/usagi.vector.json');
const GRID = 64;

/** Which model draws by default: gpt-6.2-astra was faster, cheaper and clearer than Claude Opus 5.5 on the first test (Pearl). */
export const drawProvider = (): 'anthropic' | 'openai' => (process.env.VECTOR_DRAW_PROVIDER === 'anthropic' ? 'anthropic' : 'openai');

const TOOL: ToolSpec = {
  name: 'submit_vector',
  description: 'Submit the complete vector.json for the character, or (done: true, no doc) accept the last submitted one.',
  parameters: {
    properties: {
      doc: { type: 'object', description: 'The complete vector.json (every field of the spec). Omit only with done: true.' },
      done: { type: 'boolean', description: 'true: the last submitted doc had no check errors and its check pictures match the references; finish with it.' },
      notes: { type: 'string', description: 'A few lines: what changed since the last round, and anything still wrong.' },
    },
  },
};

function systemPrompt(): string {
  const read = (f: string) => readFileSync(join(SKILL, f), 'utf8');
  const sample = JSON.parse(readFileSync(SAMPLE, 'utf8')) as Record<string, unknown>;
  delete sample.qa; // Kitta does not use the qa cases
  return `You draw a 2D character as vector parts for an animation renderer (vector-avator). The renderer moves the parts on a 3D skeleton, generates the arms itself and draws the outlines itself. You draw the fill shapes of every other part, completing the parts that other parts hide.

You cannot run code or measure pixels. Write the path coordinates directly, reading positions from the pictures: the canvas is the front picture, 1024 × 1536, and a copy of it has grid lines every ${GRID} px with their coordinates. After each submission the server checks the doc and sends back the list of problems and a check picture drawn by the real renderer (neutral, the drawing at half opacity over the front picture with red skeleton points, head turned ±30°, the explain and point gestures, the eye states, the expressions and the mouths). Use it to fix positions and shapes.

Rules:
- Every turn, call submit_vector exactly once. Submit the complete doc each time (not a diff).
- Draw each part from scratch as a meaningful unit, with few smooth Bézier curves (absolute M/C/Q/L/Z). No tracing, no images.
- Fill only (stroke null, width 0). Thin lines (brows, closed eyes, mouth lines, stripes) are thin closed filled shapes.
- Complete hidden areas: the head under hair and ears, the torso under the arms, the neck, the roots of the tail and ears.
- Do not draw the arms. Instead set skeleton shoulder, elbow and wrist, and arms widths, colour bands and shade, measured on the front picture. Draw the 4 hands × 2 sides as the spec says, hanging straight down from the wrist.
- _L and _R are the character's own left and right: in the front view _L is on the screen right.
- Keep it simple: about 40 to 60 parts, each shape under about 80 segments. Merge small markings into a few large shapes.
- The face variants (eyes, brows, mouths, expressions) follow the face sheet.
- The spec mentions repository files and commands (check_parts.py, the viewer, public/, var/, qa). Ignore those: the server's check and check picture replace them, and qa may be left out.
- When the last doc had no errors and the check picture matches the references, call submit_vector with done: true and no doc.

The spec (it wins over the notes):

<parts-spec>
${read('parts-spec.md')}
</parts-spec>

How to decide what to draw and complete:

<drawing-notes>
${read('drawing-workflow.md')}
</drawing-notes>

How to judge the result by eye:

<visual-qa>
${read('visual-qa.md')}
</visual-qa>

A finished character, as a worked example of the level of completion, the parent/pivot choices, the skeleton, arms, chains and expressions. Do not reuse its coordinates or shapes:

<example-vector-json>
${JSON.stringify(sample)}
</example-vector-json>`;
}

/** The front picture with a labelled grid, so the model can read coordinates. */
async function gridded(front: Buffer): Promise<Buffer> {
  const img = await loadImage(front);
  const c = createCanvas(img.width, img.height);
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  g.strokeStyle = 'rgba(232,48,90,0.45)';
  g.fillStyle = '#B0123F';
  g.font = '14px sans-serif';
  g.lineWidth = 1;
  for (let x = GRID; x < img.width; x += GRID) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, img.height); g.stroke(); g.fillText(String(x), x + 2, 14); }
  for (let y = GRID; y < img.height; y += GRID) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(img.width, y + 0.5); g.stroke(); g.fillText(String(y), 2, y - 2); }
  return c.toBuffer('image/png');
}

export interface DrawInput {
  name: string;
  /** Front standing picture, 1024 × 1536 (the canvas of the doc). */
  front: Buffer;
  faceSheet: Buffer;
  notes?: string;
  maxRounds?: number;
  /** The drawing model: OpenAI (default, VECTOR_DRAW_PROVIDER overrides) or Claude, or a ready chat (tests). */
  provider?: 'anthropic' | 'openai';
  model?: string;
  chat?: (system: string, tool: ToolSpec) => ToolChat;
  /** Cancels the drawing: the request in flight stops and no new round starts. */
  signal?: AbortSignal;
  onRound?: (r: Round) => void | Promise<void>;
}

export interface Round {
  round: number;
  seconds: number;
  /** Tokens and cost of the round's request. */
  usage: UsageEntry;
  /** What the model sent: a doc, or done (accepting the previous one). */
  doc?: unknown;
  done: boolean;
  notes?: string;
  errors: string[];
  warnings: string[];
  sheet?: Buffer;
}

export interface DrawResult { doc: VectorDoc | null; errors: string[]; rounds: Round[]; provider: string; model: string }

function parseDoc(input: Record<string, unknown>): unknown {
  const d = input.doc;
  if (typeof d === 'string') { try { return JSON.parse(d); } catch { return d; } }
  return d;
}

export async function drawVector(inp: DrawInput): Promise<DrawResult> {
  const maxRounds = inp.maxRounds ?? 4;
  const system = systemPrompt();
  const make = inp.chat ?? ((s: string, t: ToolSpec) => ((inp.provider ?? drawProvider()) === 'anthropic' ? claudeToolChat(s, t, inp.model) : openaiToolChat(s, t, inp.model)));
  const chat = make(system, TOOL);
  let send: ChatBlock[] = [
    { type: 'text', text: `Character: ${inp.name}.${inp.notes ? `\n\nNotes on the character (they win over the general style):\n${inp.notes}` : ''}\n\nThe front picture (the canvas):` },
    { type: 'image', png: inp.front },
    { type: 'text', text: `The same picture with a grid every ${GRID} px:` },
    { type: 'image', png: await gridded(inp.front) },
    { type: 'text', text: 'The face sheet (row 1: front, 3/4 view, eyes open, half, closed; row 2: mouths closed, a, i, u, e, o; row 3: normal, smile, surprised, troubled):' },
    { type: 'image', png: inp.faceSheet },
    { type: 'text', text: 'Draw the character as vector.json and submit it.' },
  ];
  const rounds: Round[] = [];
  let best: { doc: VectorDoc; errors: string[] } | null = null;
  let last: Round | null = null;

  for (let n = 1; n <= maxRounds; n++) {
    const t = Date.now();
    if (inp.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    const call = await chat.send(send, inp.signal);
    const input = (call.input ?? {}) as Record<string, unknown>;
    const doc = parseDoc(input);
    const round: Round = { round: n, seconds: 0, usage: call.usage, done: input.done === true && doc === undefined, notes: typeof input.notes === 'string' ? input.notes : undefined, errors: [], warnings: [] };

    let reply: ChatBlock[];
    if (round.done) {
      round.seconds = (Date.now() - t) / 1000;
      rounds.push(round);
      await inp.onRound?.(round);
      if (last && !last.done && last.errors.length === 0) break;
      reply = [{ type: 'text', text: last ? `Cannot finish: the last doc had ${last.errors.length} errors. Fix them and submit the complete doc.` : 'Nothing was submitted yet. Submit the complete doc.' }];
    } else if (doc === undefined) {
      round.errors = ['the call had no doc'];
      round.seconds = (Date.now() - t) / 1000;
      rounds.push(round);
      await inp.onRound?.(round);
      reply = [{ type: 'text', text: 'Your call had no doc (and done was not set). Submit the complete vector.json in doc.' }];
    } else {
      round.doc = doc;
      ({ errors: round.errors, warnings: round.warnings } = checkVector(doc));
      try {
        round.sheet = await checkSheet(doc as VectorDoc, inp.front);
      } catch (e) {
        round.errors.push(`the renderer could not draw it: ${e instanceof Error ? e.message : e}`);
      }
      if (round.sheet && (!best || round.errors.length <= best.errors.length)) best = { doc: doc as VectorDoc, errors: round.errors };
      round.seconds = (Date.now() - t) / 1000;
      rounds.push(round);
      last = round;
      await inp.onRound?.(round);
      const list = (k: string, xs: string[]) => (xs.length ? `${k} (${xs.length}):\n${xs.map((x) => `- ${x}`).join('\n')}` : `${k}: none`);
      reply = [{ type: 'text', text: `Round ${n} of ${maxRounds}.\n${list('Errors', round.errors)}\n${list('Warnings', round.warnings)}${round.sheet ? '\n\nCheck picture:' : ''}` }];
      if (round.sheet) reply.push({ type: 'image', png: round.sheet });
      reply.push({ type: 'text', text: n === maxRounds - 1 ? 'Next is the last round.' : 'Fix what is wrong and submit the complete doc, or call with done: true if it is right.' });
    }
    if (n === maxRounds) break;
    send = reply;
  }
  return { doc: best?.doc ?? null, errors: best?.errors ?? ['no doc was drawn'], rounds, provider: chat.provider, model: chat.model };
}
