import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import type { ImageProvider } from '../shared/types';
import type { ImageInput } from './gemini';
import { paint } from './images';

// The pictures a vector character is drawn from (version 2 planning/vector-create-plan.md, step 3): a front standing
// picture in A-pose (the 1024 × 1536 canvas of vector.json) and a face sheet, painted with the image provider from
// the skill's prompts (shared/vector-avator/skill/sheets, translated to English).

const SHEETS = join(import.meta.dirname, '../shared/vector-avator/skill/sheets');
const read = (f: string) => readFileSync(join(SHEETS, f), 'utf8').replace(/^<!--[\s\S]*?-->\s*/, '');

export const FRONT_SIZE = [1024, 1536] as const;
export const SHEET_SIZE = [1536, 1024] as const;

export interface VectorArtInput {
  /** What the person typed: who the character is. */
  description: string;
  /** A picture of the person's own character or logo to redraw (restyle) instead of inventing one. */
  reference?: ImageInput;
}

function characterSection(inp: VectorArtInput): string {
  return `[The character (top priority, wins over everything above)]

${inp.description.trim()}

Draw exactly the kind of character described: a person stays a person, a robot stays a robot, an animal stays that animal. Do not apply the common style's rule that reinterprets people as animals or creatures. Keep the common style's proportions (2 to 2.5 heads tall), flat colours, eyes without highlights and thin same-hue boundary lines.`;
}

export function frontPrompt(inp: VectorArtInput): string {
  return [read('style_base.md'), characterSection(inp), read(inp.reference ? 'restyle.md' : 'front.md')].join('\n\n');
}

export function faceSheetPrompt(inp: VectorArtInput): string {
  return [read('style_base.md'), characterSection(inp), read('sheet_face.md'),
    'The attached picture is this character\'s front standing picture (the final design). Match its face, colours, shapes and line widths exactly.'].join('\n\n');
}

/** Scales a picture to exactly w × h, keeping its proportions; any margin is filled with the picture's corner colour. */
export async function fitTo(png: Buffer, w: number, h: number): Promise<Buffer> {
  const img = await loadImage(png);
  if (img.width === w && img.height === h) return png;
  const c = createCanvas(w, h);
  const g = c.getContext('2d');
  const probe = createCanvas(1, 1);
  probe.getContext('2d').drawImage(img, 0, 0, 1, 1, 0, 0, 1, 1);
  const [r, gr, b] = probe.getContext('2d').getImageData(0, 0, 1, 1).data;
  g.fillStyle = `rgb(${r},${gr},${b})`;
  g.fillRect(0, 0, w, h);
  const s = Math.min(w / img.width, h / img.height);
  g.drawImage(img, (w - img.width * s) / 2, (h - img.height * s) / 2, img.width * s, img.height * s);
  return c.toBuffer('image/png');
}

/** The front picture: from the description, or redrawn from the person's reference picture. */
export async function paintFront(provider: ImageProvider, inp: VectorArtInput): Promise<Buffer> {
  return fitTo(await paint(provider, frontPrompt(inp), inp.reference ? [inp.reference] : [], 'portrait'), ...FRONT_SIZE);
}

/** The face sheet, as an edit of the front picture so it stays the same character. */
export async function paintFaceSheet(provider: ImageProvider, inp: VectorArtInput, front: Buffer): Promise<Buffer> {
  return fitTo(await paint(provider, faceSheetPrompt(inp), [{ data: front, mimeType: 'image/png' }], 'landscape'), ...SHEET_SIZE);
}
