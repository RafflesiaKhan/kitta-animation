import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { Resvg } from '@resvg/resvg-js';
import { prepareSet } from '../../server/sets';

vi.mock('@resvg/resvg-js', { spy: true });

const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="24">${body}</svg>`;

it('rasterizes a simple imported SVG and normalizes verified raster assets', () => {
  const uri = prepareSet('image/svg+xml', Buffer.from('<?xml version="1.0"?><!-- set -->' + svg('<rect width="32" height="24" fill="#aabbcc"/>')));
  expect(uri).toMatch(/^data:image\/png;base64,iVBORw0KGgo/);
  const png = readFileSync('tests/fixtures/magenta-robot.png');
  const rendered = Buffer.from(prepareSet('image/png', png).split(',')[1], 'base64');
  expect(rendered.subarray(0, 8)).toEqual(png.subarray(0, 8));
  expect(rendered.readUInt32BE(16)).toBeLessThanOrEqual(1920);
  expect(rendered.readUInt32BE(20)).toBeLessThanOrEqual(1080);
  expect(() => prepareSet('image/png', png.subarray(0, 24))).toThrow();
  expect(() => prepareSet('image/png', Buffer.alloc(16 * 1024 * 1024 + 1))).toThrow('16 MB');
  expect(() => prepareSet('image/png', Buffer.from(svg('')))).toThrow();
});

it.each([
  svg('<script>fetch("https://example.invalid/")</script>'),
  svg('<rect onload="alert(1)"/>'),
  svg('<image href="https://example.invalid/pixel.png"/>'),
  svg('<image href="file:///tmp/private.png"/>'),
  svg('<use href="./local.svg#shape"/>'),
  svg('<style>@import "https://example.invalid/evil.css";</style>'),
  svg('<rect style="fill:url(file:///tmp/private.svg#paint)"/>'),
  svg('<rect fill="&#117;rl(https://example.invalid/paint.svg#id)"/>'),
  svg('<rect fill="u\\72l(file:///tmp/private.svg#id)"/>'),
  '<!DOCTYPE svg [<!ENTITY steal SYSTEM "file:///tmp/private.svg">]>' + svg('&steal;'),
  '<?xml-stylesheet href="https://example.invalid/a.css"?>' + svg(''),
])('rejects unsafe markup before it reaches resvg: %s', (source) => {
  vi.mocked(Resvg).mockClear();
  expect(() => prepareSet('image/svg+xml', Buffer.from(source))).toThrow();
  expect(Resvg).not.toHaveBeenCalled();
});

it('normalizes WebP to a format the export renderer draws', () => {
  const webp = execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=red:s=32x24', '-frames:v', '1',
    '-c:v', 'libwebp', '-f', 'image2pipe', '-']);
  expect(prepareSet('image/webp', webp)).toMatch(/^data:image\/png;base64,iVBORw0KGgo/);
});
