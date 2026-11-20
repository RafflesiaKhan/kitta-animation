import { describe, it, expect } from 'vitest';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { faceSheetPrompt, fitTo, frontPrompt } from '../../server/vector-art';

describe('vector character pictures', () => {
  it('builds the front prompt from the English style, the description and the A-pose layout', () => {
    const p = frontPrompt({ description: 'A cheerful round robot with a teal scarf.' });
    expect(p).toContain('2 to 2.5 heads tall');
    expect(p).toContain('A cheerful round robot with a teal scarf.');
    expect(p).toContain('a person stays a person');
    expect(p).toContain('A-pose');
    expect(p).not.toMatch(/[぀-ヿ一-鿿]/); // no Japanese left
    expect(p).not.toContain('<!--');
  });
  it('uses the restyle layout when there is a reference picture, and the face sheet asks for English labels', () => {
    expect(frontPrompt({ description: 'x', reference: { data: Buffer.from(''), mimeType: 'image/png' } })).toContain('Redraw the character of the attached source picture');
    expect(faceSheetPrompt({ description: 'x' })).toContain('small English label');
  });
  it('fits a picture to the exact canvas size, filling the margin with the corner colour', async () => {
    const src = createCanvas(832, 1248); // Gemini 2:3
    const g = src.getContext('2d');
    g.fillStyle = '#e6eef8'; g.fillRect(0, 0, 832, 1248);
    const out = await loadImage(await fitTo(src.toBuffer('image/png'), 1024, 1536));
    expect([out.width, out.height]).toEqual([1024, 1536]);
    const wide = await loadImage(await fitTo(createCanvas(1000, 1000).toBuffer('image/png'), 1024, 1536));
    expect([wide.width, wide.height]).toEqual([1024, 1536]);
  });
});
