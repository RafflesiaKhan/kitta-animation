import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { Resvg } from '@resvg/resvg-js';
import { prepareSet } from '../../server/sets';
import { rasterizeSvg } from '../../server/set-svg';

vi.mock('@resvg/resvg-js', { spy: true });

const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="24">${body}</svg>`;

it('rasterizes a simple imported SVG and normalizes verified raster assets', async () => {
  const renderedSvg = await prepareSet('image/svg+xml', Buffer.from('<?xml version="1.0"?><!-- set -->' + svg('<rect width="32" height="24" fill="#aabbcc"/>')));
  expect(renderedSvg.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const png = readFileSync('tests/fixtures/magenta-robot.png');
  const rendered = await prepareSet('image/png', png);
  expect(rendered.subarray(0, 8)).toEqual(png.subarray(0, 8));
  expect(rendered.readUInt32BE(16)).toBeLessThanOrEqual(1920);
  expect(rendered.readUInt32BE(20)).toBeLessThanOrEqual(1080);
  await expect(prepareSet('image/png', png.subarray(0, 24))).rejects.toThrow();
  await expect(prepareSet('image/png', Buffer.alloc(16 * 1024 * 1024 + 1))).rejects.toThrow('16 MB');
  await expect(prepareSet('image/png', Buffer.from(svg('')))).rejects.toThrow();
});

it.each([
  svg('<script>fetch("https://example.invalid/")</script>'),
  svg('<rect onload="alert(1)"/>'),
  svg('<image href="https://example.invalid/pixel.png"/>'),
  svg('<image href="file:///tmp/private.png"/>'),
  svg('<use href="https://example.invalid/set.svg#shape"/>'),
  svg('<style>.x{fill:url(https://example.invalid/p.svg#x)}</style>'),
  svg('<filter id="f"><feImage href="file:///tmp/private.png"/></filter>'),
  svg('<use href="./local.svg#shape"/>'),
  svg('<style>@import "https://example.invalid/evil.css";</style>'),
  svg('<rect style="fill:url(file:///tmp/private.svg#paint)"/>'),
  svg('<rect fill="&#117;rl(https://example.invalid/paint.svg#id)"/>'),
  svg('<rect fill="u\\72l(file:///tmp/private.svg#id)"/>'),
  '<!DOCTYPE svg [<!ENTITY steal SYSTEM "file:///tmp/private.svg">]>' + svg('&steal;'),
  '<?xml-stylesheet href="https://example.invalid/a.css"?>' + svg(''),
])('rejects unsafe markup before it reaches resvg: %s', (source) => {
  vi.mocked(Resvg).mockClear();
  expect(() => rasterizeSvg(Buffer.from(source))).toThrow();
  expect(Resvg).not.toHaveBeenCalled();
});

it('normalizes WebP to a format the export renderer draws', async () => {
  const webp = execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=red:s=32x24', '-frames:v', '1',
    '-c:v', 'libwebp', '-f', 'image2pipe', '-']);
  expect((await prepareSet('image/webp', webp)).subarray(1, 4).toString()).toBe('PNG');
});

const picture = '<rect width="160" height="90" fill="#123456"/>';
it.each([
  ['Figma', '<defs><clipPath id="clip"><rect width="160" height="90"/></clipPath></defs><g clip-path="#clip">' + picture + '</g>'],
  ['Illustrator', '<style>.paint{fill:#123456}</style><rect class="paint" width="160" height="90"/>'],
  ['Inkscape', '<metadata><rdf:RDF xmlns:rdf="urn:rdf"/></metadata><sodipodi:namedview/><rect style="fill:#123456" width="160" height="90"/>'],
  ['local use', '<defs><rect id="panel" width="160" height="90" fill="#123456"/></defs><use xlink:href="#panel"/>'],
  ['title', '<title>Test set</title>' + picture],
])('draws %s-style SVG shapes', (label, body) => {
  const prolog = label === 'Illustrator' ? '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">' : '';
  const source = prolog + '<svg xmlns="http://www.w3.org/2000/svg" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" version="1.1" viewBox="0 0 160 90">' + body + '</svg>';
  const uri = 'data:image/png;base64,' + rasterizeSvg(Buffer.from(source)).toString('base64');
  const image = new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><image width="1920" height="1080" href="' + uri + '"/></svg>').render();
  const center = (540 * 1920 + 960) * 4;
  expect([...image.pixels.subarray(center, center + 4)]).toEqual([18, 52, 86, 255]);
});

it.each(['viewBox="0 0 160 90"', 'width="3840" height="2160" viewBox="0 0 160 90"'])('renders %s at stage size', size => {
  const png = rasterizeSvg(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" ' + size + '>' + picture + '</svg>'));
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1920, 1080]);
});

it('names unsupported text before rendering', () => {
  vi.mocked(Resvg).mockClear();
  expect(() => rasterizeSvg(Buffer.from(svg('<text x="1">Hello</text>')))).toThrow('This SVG uses <text>');
  expect(Resvg).not.toHaveBeenCalled();
});
