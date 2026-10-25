import { spawn } from 'node:child_process';
import type { MouthBox } from '../shared/types';

// Pixel measurement of a character's painted mouth. A vision model's mouth box is only a rough guess (often off by
// tens of pixels), so it is used as a seed: near it, the painted mouth is the stroke that stands out from the skin and
// is wider than it is tall. Its exact bounding box is what the talking mouth and the skin patch over it are fitted to.

/** Decodes a square PNG into raw RGBA bytes. */
export function decodeRgba(png: Buffer, size: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', ['-loglevel', 'error', '-i', 'pipe:0', '-vf', `scale=${size}:${size}`, '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1']);
    const out: Buffer[] = [];
    ff.stdout.on('data', (d) => out.push(d));
    ff.stderr.resume();
    ff.on('error', reject);
    ff.on('close', (code) => {
      const buf = Buffer.concat(out);
      code === 0 && buf.length === size * size * 4 ? resolve(buf) : reject(new Error('could not decode image'));
    });
    ff.stdin.on('error', () => {}); // EPIPE when ffmpeg rejects the input; reported by close
    ff.stdin.end(png);
  });
}

const hex = (v: number) => Math.round(v).toString(16).padStart(2, '0');

/**
 * The painted mouth near the seed in a size×size RGBA image, as a box on 0-1 with its height and the skin colour
 * around it; null when no mouth-like stroke is found there (e.g. a soft 3D face with no outlined mouth).
 */
export function findMouthStroke(rgba: Uint8Array, size: number, seed: MouthBox): MouthBox | null {
  const half = Math.max(1.5 * seed.w, 0.06);
  const x0 = Math.max(0, Math.round((seed.x - half) * size)), x1 = Math.min(size - 1, Math.round((seed.x + half) * size));
  const y0 = Math.max(0, Math.round((seed.y - 0.06) * size)), y1 = Math.min(size - 1, Math.round((seed.y + 0.09) * size));
  const W = x1 - x0 + 1, H = y1 - y0 + 1;
  if (W < 3 || H < 3) return null;
  const at = (x: number, y: number) => (y * size + x) * 4;
  const opaque = (i: number) => rgba[i + 3] >= 250;

  // Skin: the most common colour in the window (bucketed), averaged over its pixels.
  const buckets = new Map<number, number[]>();
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = at(x, y);
    if (!opaque(i)) continue;
    const k = ((rgba[i] >> 4) << 8) | ((rgba[i + 1] >> 4) << 4) | (rgba[i + 2] >> 4);
    const b = buckets.get(k) ?? [0, 0, 0, 0];
    b[0] += rgba[i]; b[1] += rgba[i + 1]; b[2] += rgba[i + 2]; b[3]++;
    buckets.set(k, b);
  }
  if (!buckets.size) return null;
  const [r, g, b, count] = [...buckets.values()].reduce((m, v) => (v[3] > m[3] ? v : m));
  const skin = [r / count, g / count, b / count];

  // Strokes: opaque pixels far from the skin colour, grouped into 4-connected components.
  const mask = new Uint8Array(W * H);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = at(x, y);
    if (opaque(i) && Math.abs(rgba[i] - skin[0]) + Math.abs(rgba[i + 1] - skin[1]) + Math.abs(rgba[i + 2] - skin[2]) > 120) mask[(y - y0) * W + (x - x0)] = 1;
  }
  let best: { d: number; bx0: number; bx1: number; by0: number; by1: number } | null = null;
  const seen = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) {
    if (!mask[p] || seen[p]) continue;
    const stack = [p];
    seen[p] = 1;
    let bx0 = W, bx1 = 0, by0 = H, by1 = 0;
    while (stack.length) {
      const q = stack.pop()!;
      const qx = q % W, qy = (q - qx) / W;
      bx0 = Math.min(bx0, qx); bx1 = Math.max(bx1, qx); by0 = Math.min(by0, qy); by1 = Math.max(by1, qy);
      if (qx > 0 && mask[q - 1] && !seen[q - 1]) { seen[q - 1] = 1; stack.push(q - 1); }
      if (qx < W - 1 && mask[q + 1] && !seen[q + 1]) { seen[q + 1] = 1; stack.push(q + 1); }
      if (qy > 0 && mask[q - W] && !seen[q - W]) { seen[q - W] = 1; stack.push(q - W); }
      if (qy < H - 1 && mask[q + W] && !seen[q + W]) { seen[q + W] = 1; stack.push(q + W); }
    }
    if (bx0 === 0 || bx1 === W - 1 || by0 === 0 || by1 === H - 1) continue; // face outline, hair: they run off the window
    const w = bx1 - bx0 + 1, h = by1 - by0 + 1;
    if (w < size * 0.015 || w < h * 1.2) continue; // mouths are wider than tall; noses, eyes and specks aren't
    const d = Math.hypot((x0 + (bx0 + bx1) / 2) / size - seed.x, (y0 + (by0 + by1) / 2) / size - seed.y);
    if (!best || d < best.d) best = { d, bx0, bx1, by0, by1 };
  }
  if (!best) return null;
  const round = (v: number) => Math.round(v * 1000) / 1000;
  return {
    x: round((x0 + (best.bx0 + best.bx1 + 1) / 2) / size),
    y: round((y0 + (best.by0 + best.by1 + 1) / 2) / size),
    w: round((best.bx1 - best.bx0 + 1) / size),
    h: round((best.by1 - best.by0 + 1) / size),
    skin: `#${skin.map(hex).join('')}`,
  };
}

/** Measures the painted mouth in a PNG near the seed; null when it can't. */
export async function measureMouth(png: Buffer, seed: MouthBox, size = 1024): Promise<MouthBox | null> {
  try {
    return findMouthStroke(await decodeRgba(png, size), size, seed);
  } catch {
    return null;
  }
}
