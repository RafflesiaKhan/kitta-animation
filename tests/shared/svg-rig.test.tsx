import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SVG_RIG_ACTIONS, SVG_RIG_EXPRESSIONS, SVG_RIG_GESTURES, SVG_RIG_VIEWS, rigOptions, validateSvgRigPack, validateSvgRigView, type SvgRigCharacter } from '../../shared/svg-rig';
import { fixtureArt, fixturePack } from '../../shared/svg-rig-fixture';
import { bindView, mirrorPath, mirrorView } from '../../shared/svg-rig-motion';
import { performancePose, poseRig, rigMotionFor } from '../../shared/svg-rig-eval';
import { SvgRigCharacterView } from '../../shared/character/SvgRigCharacter';
import { CharacterView } from '../../shared/character/CharacterView';
import { SceneView } from '../../shared/SceneView';
import type { FrameState } from '../../shared/types';
import type { Scene } from '../../shared/scene';

const pack = fixturePack();
const haru: SvgRigCharacter = { kind: 'svg-rig', id: '00000000-0000-4000-8000-000000000001', name: 'Haru', packVersion: 1, pack };
const REST: FrameState = { expression: 'neutral', mouth: 'X', gesture: 'none', gestureProgress: 0, blink: false, bob: 0, timeMs: 0 };
const at = (f: Partial<FrameState>, c: Partial<SvgRigCharacter> = {}) => poseRig(pack, { ...haru, ...c }, { ...REST, ...f });
const part = (f: Partial<FrameState>, id: string, c: Partial<SvgRigCharacter> = {}) => at(f, c).find((p) => p.id === id)!;
const svg = (f: Partial<FrameState>, c: Partial<SvgRigCharacter> = {}) => renderToStaticMarkup(<SvgRigCharacterView character={{ ...haru, ...c }} frame={{ ...REST, ...f }} />);

describe('svg rig pack contract', () => {
  it('the hand-made fixture is a complete, valid pack', () => {
    expect(validateSvgRigPack(pack)).toEqual([]);
    expect(Object.keys(pack.views)).toEqual([...SVG_RIG_VIEWS]);
    for (const v of SVG_RIG_VIEWS) expect(Object.keys(pack.views[v].expressions)).toEqual([...SVG_RIG_EXPRESSIONS]);
    expect(Object.keys(pack.gestures)).toEqual([...SVG_RIG_GESTURES]);
    expect(Object.keys(pack.actions)).toEqual([...SVG_RIG_ACTIONS]);
    expect(pack.views.back.mouthPart).toBeNull();
  });

  it('rejects unsafe or incomplete artwork', () => {
    const front = fixtureArt().front;
    const withShape = (shape: object) => bindView({ ...front, parts: front.parts.map((p) => (p.id === 'head' ? { ...p, shapes: [shape as never] } : p)) });
    expect(validateSvgRigView(withShape({ kind: 'path', d: 'M0 0 L10 10', fill: 'url(#x)' })).join()).toMatch(/unsafe paint/);
    expect(validateSvgRigView(withShape({ kind: 'path', d: '<script>', fill: '#fff' })).join()).toMatch(/invalid path/);
    expect(validateSvgRigView(withShape({ kind: 'image', href: 'http://x', fill: '#fff' })).join()).toMatch(/unsupported shape/);
    const noSmile = bindView({ ...front, parts: front.parts.map((p) => (p.id === 'mouth' ? { ...p, variants: { ...p.variants, smile: undefined as never } } : p)) });
    expect(validateSvgRigView({ ...noSmile, parts: noSmile.parts.map((p) => (p.id === 'mouth' ? { ...p, variants: Object.fromEntries(Object.entries(p.variants!).filter(([k]) => k !== 'smile')) } : p)) }).join()).toMatch(/mouth: missing smile/);
    expect(validateSvgRigPack({ ...pack, views: { ...pack.views, 'profile-left': undefined } }).join()).toMatch(/profile-left/);
  });

  it('mirrors paths, shapes and side names for the opposite view', () => {
    expect(mirrorPath('M 10 5 L -3 4 C 1 2 3 4 5 6 h 7 v 2 A 5 5 30 0 1 8 9 Z')).toBe('M-10 5 L3 4 C-1 2 -3 4 -5 6 h-7 v2 A5 5 -30 0 0 -8 9 Z');
    const left = fixtureArt()['profile-left'];
    const right = mirrorView(left);
    expect(right.parts.find((p) => p.id === 'arm-left')!.x).toBe(-left.parts.find((p) => p.id === 'arm-right')!.x);
    expect(right.parts.find((p) => p.id === 'body')!.x).toBe(1000 - left.parts.find((p) => p.id === 'body')!.x);
    expect(right.parts.find((p) => p.id === 'forearm-left')!.parent).toBe('arm-left');
  });

  it('sanitises per-use options', () => {
    expect(rigOptions({ view: 'back', framing: 'full', proportions: { legLength: 9, headScale: 1.1, bogus: 2 }, pack: 'x' }))
      .toEqual({ view: 'back', framing: 'full', proportions: { legLength: 1.25, headScale: 1.1 } });
    expect(rigOptions({ view: 'sideways', framing: 'huge' })).toEqual({});
  });
});

describe('svg rig composition', () => {
  it('is deterministic: the same frame always draws the same markup, in any seek order', () => {
    const frames = [0, 700, 1300, 2600].map((ms) => ({ ...REST, timeMs: ms, gesture: 'wave', gestureProgress: ms / 2600 }));
    const forward = frames.map((f) => svg(f));
    const backward = [...frames].reverse().map((f) => svg(f)).reverse();
    expect(backward).toEqual(forward);
    expect(new Set(forward).size).toBe(4);
  });

  it('every expression, gesture, action and speech shape draws in every view', () => {
    for (const view of SVG_RIG_VIEWS) {
      for (const expression of SVG_RIG_EXPRESSIONS) expect(svg({ expression: expression as never }, { view })).toContain('data-part="head"');
      for (const g of [...SVG_RIG_GESTURES, ...SVG_RIG_ACTIONS]) expect(svg({ gesture: g, gestureProgress: 0.5 }, { view })).not.toMatch(/NaN|undefined/);
    }
    for (const m of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const) expect(svg({ mouth: m })).not.toBe(svg({ mouth: 'X' }));
  });

  it('walk + wave + talk: legs walk, the waving arm is owned by the gesture, the mouth speaks', () => {
    const pose = performancePose(pack, pack.views.front, { ...REST, gesture: 'wave', gestureProgress: 0.5, mouth: 'D' });
    expect(pose['arm-right'].rotate).toBeCloseTo(-140, 0);
    expect(pose.mouth.variant).toBe('D');
    // walking is an action, so it layers under a gesture on other channels (here: the next mark's walk)
    const walking = performancePose(pack, pack.views['profile-left'], { ...REST, gesture: 'walk', gestureProgress: 0.125, gestureDurationMs: 2000, mouth: 'C' });
    expect(Math.abs(walking['leg-left'].rotate ?? 0)).toBeGreaterThan(10);
    expect(walking.mouth.variant).toBe('C');
  });

  it('talking keeps the expression on the rest of the face; silence shows the expression mouth', () => {
    const angry = performancePose(pack, pack.views.front, { ...REST, expression: 'angry', mouth: 'C' });
    expect(angry['brow-left'].rotate).toBeGreaterThan(10);
    expect(angry.mouth.variant).toBe('C');
    expect(performancePose(pack, pack.views.front, { ...REST, expression: 'happy' }).mouth.variant).toBe('smile');
    expect(performancePose(pack, pack.views.front, { ...REST, expression: 'neutral' }).mouth.variant).toBe('X');
  });

  it('blends expression changes and hides pupils behind closed eyes', () => {
    const half = performancePose(pack, pack.views.front, { ...REST, fromExpression: 'neutral', expression: 'angry', blend: 0.5 });
    const full = performancePose(pack, pack.views.front, { ...REST, expression: 'angry' });
    expect(half['brow-left'].rotate).toBeCloseTo((full['brow-left'].rotate ?? 0) / 2, 5);
    expect(part({ expression: 'laughing' as never }, 'pupil-left').shapes).toEqual([]);
    expect(part({ blink: true }, 'eye-left').shapes).toEqual(pack.views.front.parts.find((p) => p.id === 'eye-left')!.variants!.closed);
    expect(part({ blink: true }, 'pupil-left').shapes).toEqual([]);
  });

  it('maps today\'s Animate gestures onto the rig catalog', () => {
    expect(rigMotionFor('point')).toEqual({ gesture: 'point-right' });
    expect(rigMotionFor('starterWalk')).toEqual({ action: 'walk' });
    expect(rigMotionFor('facepalm')).toEqual({ gesture: 'facepalm' });
    expect(rigMotionFor('none')).toEqual({});
  });

  it('body proportions scale segments and keep the feet on the ground', () => {
    const footY = (legLength: number) => part({}, 'foot-left', { proportions: { legLength } }).matrix[5];
    expect(footY(1.25)).toBeCloseTo(footY(1), 3);
    expect(footY(0.8)).toBeCloseTo(footY(1), 3);
    expect(part({}, 'shin-left', { proportions: { legLength: 1.25 } }).shapeScale).toEqual([1, 1.25]);
    expect(part({}, 'head', { proportions: { headScale: 1.2 } }).matrix[0]).toBeCloseTo(1.2, 1);
  });

  it('frames waist-up or the full body over the same character', () => {
    expect(svg({})).toMatch(/viewBox="165 0 670 670"/);
    expect(svg({}, { framing: 'full' })).toMatch(/viewBox="0 -18 1000 1000"/);
  });

  it('draws through CharacterView and SceneView like every other kind', () => {
    expect(renderToStaticMarkup(<CharacterView config={haru} frame={REST} />)).toContain('data-character="svg-rig"');
    const scene: Scene = { title: 't', audioId: 'a', durationMs: 1000, background: 'data:image/png;base64,', shots: [{ startMs: 0, name: 'w', zoom: 1, focusX: 0.5, focusY: 0.5 }],
      actors: [{ id: 'h', character: haru, x: 0.5, scale: 1, idleOffsetMs: 0, timeline: { durationMs: 1000, cues: [], lines: [] } }] };
    expect(renderToStaticMarkup(<SceneView scene={scene} ms={500} />)).toContain('data-part="mouth"');
  });
});
