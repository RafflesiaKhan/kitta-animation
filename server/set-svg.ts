import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const { JSDOM } = createRequire(import.meta.url)('jsdom') as {
  JSDOM: new (source: string, options: { contentType: string }) => { window: { document: Document; close(): void } };
};
const ns = 'http://www.w3.org/2000/svg';
const list = (s: string) => new Set(s.split(/\s+/));
const elements = list('svg g defs path rect circle ellipse line polyline polygon linearGradient radialGradient stop clipPath mask pattern use filter feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feMerge feMergeNode feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence');
const paint = list('fill stroke color stop-color flood-color lighting-color');
const refs = list('clip-path mask filter');
const properties = list('color fill fill-opacity fill-rule clip-rule stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset opacity stop-color stop-opacity flood-color flood-opacity lighting-color color-interpolation-filters clip-path mask filter mask-type display visibility paint-order vector-effect shape-rendering enable-background transform overflow');
const attributes = list('viewBox width height x y x1 x2 y1 y2 cx cy r rx ry fx fy fr d points transform id preserveAspectRatio gradientUnits gradientTransform spreadMethod offset clipPathUnits maskUnits maskContentUnits patternUnits patternContentUnits patternTransform filterUnits primitiveUnits in in2 result stdDeviation dx dy operator k1 k2 k3 k4 type values mode edgeMode order kernelMatrix divisor bias targetX targetY preserveAlpha surfaceScale diffuseConstant specularConstant specularExponent azimuth elevation pointsAtX pointsAtY pointsAtZ limitingConeAngle baseFrequency numOctaves seed stitchTiles scale xChannelSelector yChannelSelector amplitude exponent intercept slope tableValues radius');
const fragment = /^#[A-Za-z0-9_][A-Za-z0-9_.-]*$/;
const localUrl = /^url\(\s*#[A-Za-z0-9_][A-Za-z0-9_.-]*\s*\)$/;
const editor = (name: string) => /^(?:sodipodi|inkscape):/.test(name);
const drop = list('title desc metadata');

class SvgError extends Error {}

function refused(feature: string): never {
  throw new SvgError('This SVG uses ' + feature + ", which sets don't support yet. Convert unsupported artwork to outlines, or use a PNG.");
}

function allowedValue(key: string, value: string) {
  if (refs.has(key)) return value === 'none' || fragment.test(value) || localUrl.test(value);
  if (paint.has(key) && (localUrl.test(value) || /^(?:rgba?|hsla?)\([0-9.,%+\-\t\n\r ]+\)$/.test(value))) return true;
  if (/^(?:transform|gradientTransform|patternTransform)$/.test(key) && !/url\s*\(/i.test(value)) return /^[A-Za-z0-9.,()+\-\t\n\r ]+$/.test(value);
  return /^[A-Za-z0-9#.,%+\-\t\n\r ]*$/.test(value);
}

function referenceValue(key: string, value: string): string {
  return refs.has(key) && fragment.test(value) ? 'url(' + value + ')' : value;
}

function declarations(css: string): string {
  if (/[@\\]/.test(css)) refused('unsafe CSS');
  return css.split(';').filter(rule => rule.trim()).map(rule => {
    const colon = rule.indexOf(':');
    if (colon === -1) refused('malformed CSS');
    const key = rule.slice(0, colon).trim();
    const value = rule.slice(colon + 1).trim();
    if (!properties.has(key) || !allowedValue(key, value)) refused('CSS property ' + (key || '(empty)'));
    return key + ':' + referenceValue(key, value);
  }).join(';');
}

function stylesheet(source: string): string {
  const css = source.trim();
  const rule = /\s*([^{}]+)\{([^{}]*)\}/y;
  const result: string[] = [];
  while (rule.lastIndex < css.length) {
    const parsed = rule.exec(css);
    if (!parsed) refused('malformed CSS');
    const selectors = parsed[1].split(',').map(selector => selector.trim());
    if (selectors.some(selector => !/^(?:[A-Za-z][A-Za-z0-9]*|(?:[A-Za-z][A-Za-z0-9]*)?[.#][A-Za-z_][A-Za-z0-9_-]*)$/.test(selector))) refused('a complex CSS selector');
    result.push(selectors.join(',') + '{' + declarations(parsed[2]) + '}');
  }
  return result.join('');
}

function staticSvg(bytes: Buffer): string {
  if (bytes.length > 1024 * 1024) throw new SvgError('SVG sets must be 1 MB or smaller.');
  // Discard external DTD identifiers before passing the document to the XML parser.
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(
    /<!DOCTYPE\s+svg(?:\s+(?:SYSTEM\s+(?:"[^"<>\[\]&]*"|'[^'<>\[\]&]*')|PUBLIC\s+(?:"[^"<>\[\]&]*"|'[^'<>\[\]&]*')\s+(?:"[^"<>\[\]&]*"|'[^'<>\[\]&]*')))?\s*>/, '');
  if (/<!DOCTYPE|<!ENTITY/.test(source)) refused('a DOCTYPE internal subset or entity declaration');
  // XML parsing only. Script execution and subresource fetching are disabled by default.
  const { window } = new JSDOM(source, { contentType: 'image/svg+xml' });
  try {
    const { document } = window;
    if (Array.from(document.childNodes).some(node => node.nodeType === 7 || node.nodeType === 10)) refused('an XML processing instruction or declaration');
    const root = document.documentElement;
    if (root.localName !== 'svg') refused('a non-SVG root');
    function rebuild(element: Element, depth: number): string {
      if (depth > 64) refused('deeply nested markup');
      const name = element.localName;
      if (drop.has(name) || editor(element.tagName)) return '';
      if (element.namespaceURI !== ns && element.namespaceURI !== null) refused('<' + element.tagName + '>');
      if (name !== 'style' && !elements.has(name)) refused('<' + name + '>');
      const approved = new Map<string, string>();
      if (depth === 0) approved.set('xmlns', ns);
      for (const { name: raw, value: original } of Array.from(element.attributes)) {
        if (raw === 'xmlns' || raw.startsWith('xmlns:') || raw === 'version' || raw === 'xml:space' || editor(raw)) continue;
        if (name === 'style' && raw === 'type' && original === 'text/css') continue;
        const key = raw === 'xlink:href' ? 'href' : raw;
        let value = original.trim();
        if (key === 'href') {
          if (!fragment.test(value) || approved.has(key)) refused('an external or invalid ' + raw + ' reference');
        } else if (key === 'class') {
          if (!/^[A-Za-z0-9_\-\t\n\r ]+$/.test(value)) refused('an invalid class name');
        } else if (key === 'style') value = declarations(value);
        else if ((!attributes.has(key) && !properties.has(key)) || !allowedValue(key, value)) refused('attribute ' + raw);
        approved.set(key, referenceValue(key, value));
      }
      const attrs = Array.from(approved, ([key, value]) => ' ' + key + '="' + value + '"').join('');
      if (name === 'style') {
        if (element.children.length) refused('markup in CSS');
        return '<style' + attrs + '>' + stylesheet(element.textContent ?? '') + '</style>';
      }
      if (Array.from(element.childNodes).some(node => node.nodeType === 7 || (node.nodeType !== 1 && node.nodeType !== 8 && node.textContent?.trim()))) refused('unexpected text or XML instructions');
      return '<' + name + attrs + '>' + Array.from(element.children, child => rebuild(child, depth + 1)).join('') + '</' + name + '>';
    }
    return rebuild(root, 0);
  } finally { window.close(); }
}

export function rasterizeSvg(bytes: Buffer): Buffer {
  const markup = staticSvg(bytes);
  const font = { loadSystemFonts: false };
  const size = new Resvg(markup, { font });
  if (!(size.width > 0 && size.height > 0 && size.width <= 100_000 && size.height <= 100_000)) {
    throw new SvgError('The SVG set declares an unsupported size.');
  }
  const fitTo = size.width / 1920 >= size.height / 1080
    ? { mode: 'width' as const, value: 1920 } : { mode: 'height' as const, value: 1080 };
  return new Resvg(markup, { font, fitTo }).render().asPng();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(rasterizeSvg(readFileSync(0))); }
  catch (error) {
    process.stderr.write(error instanceof SvgError ? error.message : 'The SVG set could not be rendered.');
    process.exitCode = 1;
  }
}
