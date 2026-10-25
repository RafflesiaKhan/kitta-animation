import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { mouthPath } from '../../shared/character/mouth';
import { STARTERS, OPTIONS } from '../../shared/character/starters';
import { Character } from '../../shared/character/Character';
import { FACES, TONES, mixFaces } from '../../shared/character/expressions';
import { EXPRESSIONS, GESTURES, type FrameState, type MouthShape } from '../../shared/types';

const SHAPES: MouthShape[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'X'];
const frame = (over: Partial<FrameState> = {}): FrameState => ({
  expression: 'neutral', mouth: 'C', gesture: 'none', gestureProgress: 0, blink: false, bob: 0, ...over,
});
const render = (config = STARTERS.kit, f = frame()) =>
  renderToStaticMarkup(<Character config={config} frame={f} width={500} height={500} />);

describe('mouthPath', () => {
  it('bends the shape by expression', () => {
    expect(mouthPath('A', 'happy')).not.toBe(mouthPath('A', 'sad'));
  });
  it('returns a non-empty path starting with M for every shape x expression', () => {
    for (const s of SHAPES) for (const e of EXPRESSIONS) {
      const p = mouthPath(s, e);
      expect(p.length).toBeGreaterThan(0);
      expect(p.startsWith('M')).toBe(true);
      expect(p).not.toMatch(/NaN|undefined/);
    }
  });
});

describe('STARTERS / OPTIONS', () => {
  it('has 3 starters', () => {
    expect(Object.keys(STARTERS).length).toBe(3);
  });
  it('offers at least 3 of each option', () => {
    expect(OPTIONS.hairStyles.length).toBeGreaterThanOrEqual(3);
    expect(OPTIONS.eyeStyles.length).toBeGreaterThanOrEqual(3);
    expect(OPTIONS.outfits.length).toBeGreaterThanOrEqual(3);
  });
});

describe('Character', () => {
  it('renders every starter with every expression', () => {
    for (const s of Object.values(STARTERS)) for (const e of EXPRESSIONS) {
      const html = render(s, frame({ expression: e }));
      expect(html).toContain('<svg');
      expect(html).toContain('viewBox="0 0 1000 1000"');
      for (const part of ['head', 'hair', 'eye-left', 'eye-right', 'pupil', 'brow-left', 'brow-right', 'mouth', 'arm-left', 'arm-right', 'body'])
        expect(html).toContain(`data-part="${part}"`);
    }
  });
  it('renders every option combination without throwing', () => {
    for (const s of Object.values(STARTERS))
      for (const hairStyle of OPTIONS.hairStyles) for (const eyeStyle of OPTIONS.eyeStyles) for (const outfit of OPTIONS.outfits)
        expect(render({ ...s, hairStyle, eyeStyle, outfit })).toContain('<svg');
  });
  it('uses the configured hair colour', () => {
    expect(render({ ...STARTERS.kit, hairColor: '#123456' })).toContain('#123456');
  });
  it('blink removes pupils', () => {
    expect(render(STARTERS.kit, frame({ blink: true }))).not.toContain('data-part="pupil"');
  });
  it('wave rotates the right arm', () => {
    const html = render(STARTERS.kit, frame({ gesture: 'wave', gestureProgress: 0.125 }));
    const m = html.match(/<g[^>]*data-part="arm-right"[^>]*>/);
    expect(m).not.toBeNull();
    const rot = m![0].match(/rotate\((-?[\d.]+)/);
    expect(rot).not.toBeNull();
    expect(Math.abs(parseFloat(rot![1]))).toBeGreaterThan(1);
  });
  it('celebrate raises both arms', () => {
    const html = render(STARTERS.kit, frame({ gesture: 'celebrate', gestureProgress: 0.5 }));
    for (const side of ['left', 'right']) {
      const rot = html.match(new RegExp(`data-part="arm-${side}"[^>]*rotate\\((-?[\\d.]+)`));
      expect(Math.abs(parseFloat(rot![1]))).toBeGreaterThan(100);
    }
  });
  it('renders every gesture mid-way without NaN', () => {
    for (const g of GESTURES) expect(render(STARTERS.pip, frame({ gesture: g, gestureProgress: 0.4 }))).not.toMatch(/NaN/);
  });
  it('wink shuts one eye only', () => {
    const html = render(STARTERS.kit, frame({ expression: 'wink' }));
    expect(html.match(/data-part="pupil"/g)?.length).toBe(1);
  });
  it('draws a mid-blend face that differs from both ends', () => {
    const at = (blend: number) => render(STARTERS.kit, frame({ fromExpression: 'sad', expression: 'excited', blend }));
    expect(at(0)).toBe(render(STARTERS.kit, frame({ expression: 'sad' })));
    expect(at(1)).toBe(render(STARTERS.kit, frame({ expression: 'excited' })));
    expect(at(0.5)).not.toBe(at(0));
    expect(at(0.5)).not.toBe(at(1));
    expect(at(0.5)).not.toMatch(/NaN/);
  });
  it('a glance moves the pupils', () => {
    expect(render(STARTERS.milo, frame({ glance: 1 }))).not.toBe(render(STARTERS.milo, frame()));
  });
});

describe('expression library', () => {
  it('has a face preset and a TTS tone for every expression', () => {
    for (const e of EXPRESSIONS) {
      expect(FACES[e]).toBeDefined();
      expect(TONES[e]).toMatch(/^[a-z]+$/);
    }
  });
  it('mixFaces interpolates every parameter', () => {
    const m = mixFaces(FACES.neutral, FACES.surprised, 0.5);
    expect(m.eyeScale).toBeCloseTo(1.1);
    expect(m.browL.raise).toBeCloseTo(13);
    expect(m.mouth.hs).toBeCloseTo(1.2);
  });
});
