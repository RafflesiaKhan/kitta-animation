import { describe, it, expect } from 'vitest';
import { findMouthStroke } from '../../server/mouth';

const SIZE = 200;
const SKIN = [240, 200, 160];
/** A skin-coloured face with a dark outline, a vertical nose line and, optionally, a horizontal mouth line. */
function face(mouth: { x0: number; x1: number; y: number; h: number } | null): Uint8Array {
  const px = new Uint8Array(SIZE * SIZE * 4);
  const set = (x: number, y: number, c: number[]) => { const i = (y * SIZE + x) * 4; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255; };
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) set(x, y, x < 3 || x > SIZE - 4 ? [20, 20, 20] : SKIN);
  for (let y = 90; y < 102; y++) for (let x = 99; x < 102; x++) set(x, y, [30, 20, 20]); // nose, just above the mouth
  if (mouth) for (let y = mouth.y; y < mouth.y + mouth.h; y++) for (let x = mouth.x0; x < mouth.x1; x++) set(x, y, [40, 10, 10]);
  return px;
}

describe('findMouthStroke', () => {
  it('finds the painted mouth exactly, even when the seed is off', () => {
    const seed = { x: 0.5, y: 0.49, w: 0.15, skin: '#000000' }; // guessed 12 px too high, on the nose
    expect(findMouthStroke(face({ x0: 85, x1: 115, y: 108, h: 4 }), SIZE, seed)).toEqual({ x: 0.5, y: 0.55, w: 0.15, h: 0.02, skin: '#f0c8a0' });
  });
  it('returns null when there is no mouth-like stroke near the seed', () => {
    expect(findMouthStroke(face(null), SIZE, { x: 0.5, y: 0.5, w: 0.1, skin: '#000000' })).toBeNull();
  });
});
