import { describe, it, expect } from 'vitest';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { checkSheet } from '../../server/vector-check';
import sample from '../../shared/vector-avator/sample/usagi.vector.json';
import type { VectorDoc } from '../../shared/vector-avator/renderers/vector/vdata';

const doc = sample as unknown as VectorDoc;
const TILE = 256, GAP = 8, ROW = 256 + 22 + 8;

/** How many pixels of one tile differ from the tile background (i.e. how much of the character shows). */
const drawn = (px: Uint8ClampedArray, width: number, col: number, row: number) => {
  let n = 0;
  for (let y = 0; y < TILE; y += 2) for (let x = 0; x < TILE; x += 2) {
    const i = ((GAP + row * ROW + y) * width + GAP + col * (TILE + GAP) + x) * 4;
    if (Math.abs(px[i] - 0xee) + Math.abs(px[i + 1] - 0xf1) + Math.abs(px[i + 2] - 0xf6) > 12) n++;
  }
  return n;
};
const pixels = async (png: Buffer) => {
  const img = await loadImage(png);
  const c = createCanvas(img.width, img.height);
  c.getContext('2d').drawImage(img, 0, 0);
  return { width: img.width, height: img.height, px: c.getContext('2d').getImageData(0, 0, img.width, img.height).data };
};

describe('check sheet', () => {
  it('draws the sample: a body row of 5, eyes and expressions (7), mouths (6)', async () => {
    const { width, height, px } = await pixels(await checkSheet(doc));
    expect([width, height]).toEqual([7 * (TILE + GAP) + GAP, 3 * ROW + GAP]);
    const tiles = [[0, 5], [1, 7], [2, 6]] as const;
    for (const [row, count] of tiles) for (let col = 0; col < count; col++) expect(drawn(px, width, col, row), `row ${row} col ${col}`).toBeGreaterThan(500);
  });

  it('adds the overlay tile when given the front picture', async () => {
    const front = createCanvas(doc.width, doc.height);
    front.getContext('2d').fillStyle = '#ff0000';
    front.getContext('2d').fillRect(0, 0, doc.width, doc.height);
    const { width, px } = await pixels(await checkSheet(doc, front.toBuffer('image/png')));
    const i = ((GAP + 2) * width + GAP + (TILE + GAP) + TILE / 2) * 4; // top middle of the second tile
    expect([px[i], px[i + 1], px[i + 2]]).toEqual([255, 0, 0]);
  });

  it('keeps the expression tiles distinct (the variants really switch)', async () => {
    const { width, px } = await pixels(await checkSheet(doc));
    const tile = (col: number) => {
      const out: number[] = [];
      for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) out.push(px[((GAP + ROW + y) * width + GAP + col * (TILE + GAP) + x) * 4]);
      return out.join();
    };
    const faces = [3, 4, 5, 6].map(tile); // neutral, smile, surprised, troubled
    expect(new Set(faces).size).toBe(4);
  });
});
