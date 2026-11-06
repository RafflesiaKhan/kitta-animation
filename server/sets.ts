import { spawnSync } from 'node:child_process';
import { Resvg } from '@resvg/resvg-js';

const elements = new Set('svg g defs path rect circle ellipse line polyline polygon linearGradient radialGradient stop'.split(' '));
const attributes = new Set(('viewBox width height x y x1 x2 y1 y2 cx cy r rx ry fx fy fr d points transform opacity ' +
  'fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-miterlimit ' +
  'stroke-dasharray stroke-dashoffset id preserveAspectRatio gradientUnits gradientTransform spreadMethod offset stop-color stop-opacity').split(' '));
const svgNamespace = 'http://www.w3.org/2000/svg';
const pngMagic = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export class SetError extends Error {}

// shortcut: only static shapes and local gradients, expand the allowlist when more SVG features are needed.
function staticSvg(bytes: Buffer): string {
  const fail = () => new SetError('Use a static SVG set with shapes and gradients. Scripts, styles, declarations and linked files are unsupported.');
  if (bytes.length > 1024 * 1024) throw new SetError('SVG sets must be 1 MB or smaller.');
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const tag = /<(\/?)([A-Za-z][A-Za-z0-9]*)/y;
  const attribute = /[\t\n\r ]+([A-Za-z][A-Za-z0-9-]*)[\t\n\r ]*=[\t\n\r ]*(?:"([^"<&]*)"|'([^'<&]*)')/y;
  const endTag = /[\t\n\r ]*(\/?)>/y;
  const stack: string[] = [];
  const markup: string[] = [];
  let offset = 0;
  let rootSeen = false;
  if (/^<\?xml[\t\n\r ]/.test(source)) {
    const end = source.indexOf('?>');
    if (end === -1) throw fail();
    offset = end + 2;
  }
  while (offset < source.length) {
    if (/[\t\n\r ]/.test(source[offset])) { offset++; continue; }
    if (source.startsWith('<!--', offset)) {
      const end = source.indexOf('-->', offset + 4);
      if (end === -1) throw fail();
      offset = end + 3;
      continue;
    }
    tag.lastIndex = offset;
    const token = tag.exec(source);
    if (!token) throw fail();
    const [, closing, name] = token;
    offset = tag.lastIndex;
    if (!elements.has(name)) throw fail();
    markup.push(token[0]);
    if (closing) {
      if (stack.pop() !== name) throw fail();
    } else {
      const root = stack.length === 0;
      if (root && (rootSeen || name !== 'svg')) throw fail();
      if (root) rootSeen = true;
      const seen = new Set<string>();
      for (;;) {
        attribute.lastIndex = offset;
        const attr = attribute.exec(source);
        if (!attr) break;
        const [, key, double, single] = attr;
        const value = double ?? single;
        if (seen.has(key)) throw fail();
        seen.add(key);
        if (key === 'xmlns') {
          if (!root || value !== svgNamespace) throw fail();
        } else {
          if (!attributes.has(key)) throw fail();
          const plain = /^[A-Za-z0-9#.,%+\-\t\n\r ]*$/.test(value);
          const transform = (key === 'transform' || key === 'gradientTransform') && /^[A-Za-z0-9.,()+\-\t\n\r ]+$/.test(value);
          const paint = key === 'fill' || key === 'stroke' || key === 'stop-color';
          const color = paint && /^(?:rgba?|hsla?)\([0-9.,%+\-\t\n\r ]+\)$/.test(value);
          const fragment = (key === 'fill' || key === 'stroke') && /^url\(#[A-Za-z_][A-Za-z0-9_.-]*\)$/.test(value);
          if (!plain && !transform && !color && !fragment) throw fail();
        }
        markup.push(attr[0]);
        offset = attribute.lastIndex;
      }
      if (root && !seen.has('xmlns')) markup.push(' xmlns="' + svgNamespace + '"');
    }
    endTag.lastIndex = offset;
    const end = endTag.exec(source);
    if (!end || (closing && end[1])) throw fail();
    markup.push(end[0]);
    offset = endTag.lastIndex;
    if (!closing && !end[1]) {
      if (stack.length >= 64) throw fail();
      stack.push(name);
    }
  }
  if (!rootSeen || stack.length) throw fail();
  return markup.join('');
}

export function prepareSet(mime: string, bytes: Buffer): string {
  if (bytes.length > 16 * 1024 * 1024) throw new SetError('Set images must be 16 MB or smaller.');
  if (mime === 'image/svg+xml') {
    try {
      const svg = new Resvg(staticSvg(bytes), { font: { loadSystemFonts: false } });
      if (!(svg.width > 0 && svg.height > 0 && svg.width <= 2048 && svg.height <= 2048)) {
        throw new SetError('SVG sets must fit within 2048 × 2048 pixels.');
      }
      return 'data:image/png;base64,' + svg.render().asPng().toString('base64');
    } catch (error) {
      if (error instanceof SetError) throw error;
      throw new SetError('The SVG set could not be rendered.');
    }
  }
  const png = mime === 'image/png' && bytes.subarray(0, 8).equals(pngMagic);
  const jpeg = mime === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = mime === 'image/webp' && bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP';
  if (!png && !jpeg && !webp) throw new SetError('Choose a valid PNG, JPEG, WebP or static SVG set.');
  const demuxer = png ? 'png_pipe' : jpeg ? 'jpeg_pipe' : 'webp_pipe';
  // Both drawing paths receive the same bounded single frame.
  const converted = spawnSync('ffmpeg', ['-v', 'error', '-protocol_whitelist', 'pipe', '-f', demuxer, '-max_pixels', '16777216',
    '-i', 'pipe:0', '-frames:v', '1', '-vf', "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease",
    '-c:v', 'png', '-f', 'image2pipe', 'pipe:1'], { input: bytes, timeout: 5_000, maxBuffer: 16 * 1024 * 1024 });
  if (converted.status !== 0 || !converted.stdout.subarray(0, 8).equals(pngMagic)) throw new SetError('The image set could not be rendered.');
  return 'data:image/png;base64,' + converted.stdout.toString('base64');
}
