import {
  SVG_RIG_ACTIONS, SVG_RIG_EXPRESSIONS, SVG_RIG_GESTURES, SVG_RIG_VIEWS,
  type RigClip, type RigKey, type RigPart, type RigPose, type RigShape, type RigTransform,
  type SvgRigAction, type SvgRigExpression, type SvgRigGesture, type SvgRigPack, type SvgRigView, type SvgRigViewId,
} from './svg-rig';

// Shared behaviour recipes (version 2 planning/reference-svg-character-plan.md §3): every character draws its own parts,
// and these expressions, gestures and actions move them by the standard part ids. A generated pack therefore only
// needs artwork; the motion is written once here and bound to each view when the pack is assembled.

/** The artwork of one view: what a model (or the fixture) draws. Poses are added by `bindView`. */
export type ViewArt = Pick<SvgRigView, 'parts' | 'mouthPart' | 'waistY' | 'groundY'>;

type Face = {
  brow?: number; browY?: number; browIn?: number; eye?: number; eyeVariant?: string; look?: [number, number];
  mouth?: string; mouthY?: number; head?: number; headY?: number; blush?: boolean; tears?: boolean; wink?: boolean;
};

// brow: + = inner ends down (cross), - = inner ends up (worried). eye: lid opening scale. look: pupil offset.
const FACES: Record<SvgRigExpression, Face> = {
  neutral: {},
  attentive: { browY: -6, eye: 1.08 },
  focused: { brow: 8, eye: 0.82, mouth: 'A' },
  thinking: { brow: -4, browIn: 4, look: [8, -9], mouth: 'smirk', head: -5 },
  curious: { browY: -8, browIn: -6, eye: 1.1, look: [5, 0], mouth: 'o', head: 6 },
  happy: { browY: -6, mouth: 'smile' },
  content: { eye: 0.7, mouth: 'smile', head: 3 },
  excited: { browY: -12, eye: 1.18, mouth: 'grin' },
  delighted: { browY: -10, eye: 0.55, mouth: 'grin', blush: true },
  laughing: { browY: -10, eye: 0.18, eyeVariant: 'closed', mouth: 'D', head: -4 },
  proud: { browY: -4, eye: 0.8, mouth: 'smirk', headY: -6, head: -3 },
  affectionate: { brow: -6, eye: 0.65, mouth: 'smile', blush: true, head: 5 },
  relieved: { brow: -8, eye: 0.6, mouth: 'smile', headY: 4 },
  sad: { brow: -16, eye: 0.85, look: [0, 6], mouth: 'frown', headY: 6 },
  crying: { brow: -20, eye: 0.45, mouth: 'frown', tears: true, headY: 8 },
  worried: { brow: -14, browY: -4, eye: 1.05, mouth: 'frown' },
  scared: { brow: -18, browY: -12, eye: 1.25, mouth: 'o', headY: 4 },
  panicked: { brow: -20, browY: -14, eye: 1.3, mouth: 'D', head: 4 },
  embarrassed: { brow: -8, eye: 0.8, look: [-8, 4], mouth: 'smirk', blush: true, head: -4 },
  shy: { brow: -6, eye: 0.7, look: [6, 6], mouth: 'smile', blush: true, headY: 5, head: 6 },
  disappointed: { brow: -10, eye: 0.6, look: [0, 7], mouth: 'frown', headY: 5 },
  angry: { brow: 18, browY: 4, eye: 0.85, mouth: 'frown' },
  furious: { brow: 24, browY: 8, eye: 0.75, mouth: 'B', headY: 3 },
  annoyed: { brow: 10, eye: 0.6, look: [7, 0], mouth: 'A', head: -3 },
  disgusted: { brow: 12, browIn: 6, eye: 0.6, mouth: 'frown', head: -6 },
  determined: { brow: 14, eye: 0.85, mouth: 'A', headY: 2 },
  suspicious: { brow: 9, eye: 0.5, look: [9, 0], mouth: 'smirk' },
  skeptical: { brow: 6, browIn: -8, eye: 0.75, mouth: 'smirk', head: 4 },
  smug: { brow: 4, eye: 0.55, mouth: 'smirk', head: -4 },
  unimpressed: { eye: 0.5, mouth: 'A' },
  surprised: { browY: -16, eye: 1.25, mouth: 'o' },
  shocked: { browY: -22, eye: 1.35, mouth: 'D', headY: -4 },
  confused: { brow: -6, browIn: 10, look: [-6, -4], mouth: 'smirk', head: 7 },
  sleepy: { browY: 4, eye: 0.25, look: [0, 4], mouth: 'X', headY: 6, head: 4 },
  tired: { brow: -6, eye: 0.45, mouth: 'frown', headY: 5 },
  wink: { browY: -4, wink: true, mouth: 'smile', head: 3 },
};

/** The expression poses of a view, from the parts it actually has (optional parts and variants are used when present). */
export function expressionsFor(parts: RigPart[]): Record<SvgRigExpression, RigPose> {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const has = (id: string, variant?: string) => byId.has(id) && (!variant || !!byId.get(id)!.variants?.[variant]);
  const out = {} as Record<SvgRigExpression, RigPose>;
  for (const name of SVG_RIG_EXPRESSIONS) {
    const f = FACES[name];
    const pose: RigPose = {};
    const set = (id: string, t: RigTransform) => { if (has(id)) pose[id] = { ...pose[id], ...t }; };
    for (const side of ['left', 'right'] as const) {
      const inward = side === 'left' ? 1 : -1; // + rotation lowers the inner end of the screen-left brow
      const brow = (f.brow ?? 0) * inward + (f.browIn ?? 0) * (side === 'left' ? 1 : 0);
      if (brow || f.browY) set(`brow-${side}`, { ...(brow ? { rotate: brow } : {}), ...(f.browY ? { y: f.browY } : {}) });
      const winked = f.wink && side === 'right';
      const eye = winked ? 0.12 : f.eye;
      const closed = winked || f.eyeVariant === 'closed';
      if (closed && has(`eye-${side}`, 'closed')) set(`eye-${side}`, { variant: 'closed' });
      else if (eye !== undefined && eye !== 1) set(`eye-${side}`, { scaleY: eye });
      if (f.look) set(`pupil-${side}`, { x: f.look[0], y: f.look[1] });
      if (f.blush && has(`cheek-${side}`, 'blush')) set(`cheek-${side}`, { variant: 'blush' });
      if (f.tears && has(`tear-${side}`, 'on')) set(`tear-${side}`, { variant: 'on' });
    }
    if (f.mouth && has('mouth', f.mouth)) set('mouth', { variant: f.mouth });
    if (f.head || f.headY) set('head', { ...(f.head ? { rotate: f.head } : {}), ...(f.headY ? { y: f.headY } : {}) });
    out[name] = pose;
  }
  return out;
}

export function blinkFor(parts: RigPart[]): RigPose {
  const pose: RigPose = {};
  for (const p of parts) if (p.id === 'eye-left' || p.id === 'eye-right') pose[p.id] = p.variants?.closed ? { variant: 'closed' } : { scaleY: 0.1 };
  return pose;
}

// ---------- clips ----------

const clip = (durationMs: number, loop: boolean, tracks: Record<string, RigKey[]>): RigClip =>
  ({ durationMs, loop, tracks: Object.entries(tracks).map(([part, keys]) => ({ part, keys })) });
/** Rest → pose (by `inAt`) → held/varied → rest (from `outAt`), for one channel. */
const hold = (t: RigTransform, inAt = 0.2, outAt = 0.8, mid: RigKey[] = []): RigKey[] => [{ at: 0 }, { at: inAt, ...t }, ...mid, { at: outAt, ...t }, { at: 1 }];
/** Oscillates around `t` between inAt and outAt. */
const shake = (t: RigTransform, key: keyof RigTransform, amp: number, times: number, inAt = 0.2, outAt = 0.8): RigKey[] => {
  const mid: RigKey[] = [];
  for (let i = 1; i < times * 2; i++) mid.push({ at: inAt + ((outAt - inAt) * i) / (times * 2), ...t, [key]: Number(t[key] ?? 0) + (i % 2 ? amp : -amp * 0.3) });
  return hold(t, inAt, outAt, mid);
};
const both = (side: (s: 'left' | 'right', out: number) => Record<string, RigKey[]>) => ({ ...side('left', 1), ...side('right', -1) });

/** Gesture recipes: screen-right arm by default; `out` is the sign that swings an arm away from the body. */
export const GESTURE_CLIPS: Record<SvgRigGesture, RigClip> = {
  wave: clip(1600, false, { 'arm-right': hold({ rotate: -140 }, 0.18, 0.82), 'forearm-right': shake({ rotate: -15 }, 'rotate', 28, 3, 0.22, 0.8), 'hand-right': hold({ rotate: -10, variant: 'open' }, 0.18, 0.82) }),
  'point-left': clip(1400, false, { 'arm-left': hold({ rotate: 80 }), 'hand-left': hold({ variant: 'point' }), head: hold({ rotate: -3 }) }),
  'point-right': clip(1400, false, { 'arm-right': hold({ rotate: -80 }), 'hand-right': hold({ variant: 'point' }), head: hold({ rotate: 3 }) }),
  'point-up': clip(1400, false, { 'arm-right': hold({ rotate: -165 }), 'hand-right': hold({ variant: 'point' }), head: hold({ y: -4 }) }),
  'point-down': clip(1400, false, { 'arm-right': hold({ rotate: -35 }), 'forearm-right': hold({ rotate: -10 }), 'hand-right': hold({ variant: 'point' }), head: hold({ y: 6 }) }),
  'present-left': clip(1500, false, { 'arm-left': hold({ rotate: 55 }), 'forearm-left': hold({ rotate: -35 }), 'hand-left': hold({ variant: 'open' }), head: hold({ rotate: -4 }) }),
  'present-right': clip(1500, false, { 'arm-right': hold({ rotate: -55 }), 'forearm-right': hold({ rotate: 35 }), 'hand-right': hold({ variant: 'open' }), head: hold({ rotate: 4 }) }),
  explain: clip(1800, false, both((s, out) => ({ [`arm-${s}`]: hold({ rotate: 25 * out }), [`forearm-${s}`]: shake({ rotate: -110 * out }, 'rotate', 12 * out, 2), [`hand-${s}`]: hold({ variant: 'open' }) }))),
  shrug: clip(1300, false, { ...both((s, out) => ({ [`arm-${s}`]: hold({ rotate: 28 * out }, 0.25, 0.75), [`forearm-${s}`]: hold({ rotate: 95 * out }, 0.25, 0.75), [`hand-${s}`]: hold({ variant: 'open' }, 0.25, 0.75) })), head: hold({ rotate: 7, y: 6 }, 0.25, 0.75), body: hold({ y: -6 }, 0.25, 0.75) }),
  'palms-up': clip(1300, false, { ...both((s, out) => ({ [`arm-${s}`]: hold({ rotate: 18 * out }), [`forearm-${s}`]: hold({ rotate: 70 * out }), [`hand-${s}`]: hold({ variant: 'open' }) })), head: hold({ rotate: 6 }) }),
  stop: clip(1300, false, { 'arm-right': hold({ rotate: -70 }, 0.15), 'forearm-right': hold({ rotate: -110 }, 0.15), 'hand-right': hold({ variant: 'open' }, 0.15), head: hold({ y: -3 }, 0.15) }),
  beckon: clip(1600, false, { 'arm-right': hold({ rotate: -40 }), 'forearm-right': shake({ rotate: -105 }, 'rotate', -28, 3), 'hand-right': hold({ variant: 'open' }) }),
  'thumbs-up': clip(1300, false, { 'arm-right': hold({ rotate: -30 }), 'forearm-right': hold({ rotate: -120 }), 'hand-right': hold({ variant: 'thumbs-up' }), head: hold({ rotate: 3 }) }),
  clap: clip(1600, false, both((s, out) => ({ [`arm-${s}`]: hold({ rotate: 20 * out }), [`forearm-${s}`]: shake({ rotate: -95 * out }, 'rotate', 18 * out, 4), [`hand-${s}`]: hold({ variant: 'open' }) }))),
  'folded-arms': clip(2000, false, { ...both((s, out) => ({ [`arm-${s}`]: hold({ rotate: 10 * out }, 0.15, 0.85), [`forearm-${s}`]: hold({ rotate: -112 * out }, 0.15, 0.85), [`hand-${s}`]: hold({ variant: 'fist' }, 0.15, 0.85) })), head: hold({ y: -3 }, 0.15, 0.85) }),
  'hands-on-hips': clip(2000, false, both((s, out) => ({ [`arm-${s}`]: hold({ rotate: 42 * out }, 0.15, 0.85), [`forearm-${s}`]: hold({ rotate: -100 * out }, 0.15, 0.85), [`hand-${s}`]: hold({ variant: 'fist' }, 0.15, 0.85) }))),
  think: clip(2000, false, { 'arm-right': hold({ rotate: -12 }), 'forearm-right': hold({ rotate: 158 }), 'hand-right': hold({ variant: 'fist' }), head: hold({ rotate: -6 }), 'pupil-left': hold({ x: 6, y: -8 }), 'pupil-right': hold({ x: 6, y: -8 }) }),
  'hand-to-chest': clip(1600, false, { 'arm-right': hold({ rotate: -6 }), 'forearm-right': hold({ rotate: 118 }), 'hand-right': hold({ variant: 'open' }), head: hold({ y: 4, rotate: 3 }) }),
  namaste: clip(1600, false, { ...both((s, out) => ({ [`arm-${s}`]: hold({ rotate: 16 * out }), [`forearm-${s}`]: hold({ rotate: -166 * out }), [`hand-${s}`]: hold({ variant: 'open' }) })), head: hold({ y: 8 }, 0.35, 0.65) }),
  salute: clip(1400, false, { 'arm-right': hold({ rotate: -120 }, 0.2), 'forearm-right': hold({ rotate: -116 }, 0.2), 'hand-right': hold({ variant: 'open' }, 0.2), head: hold({ y: -4 }, 0.2) }),
  nod: clip(900, false, { head: [{ at: 0 }, { at: 0.25, y: 10, scaleY: 0.97 }, { at: 0.5 }, { at: 0.72, y: 8, scaleY: 0.98 }, { at: 1 }] }),
  'shake-head': clip(1100, false, { head: [{ at: 0 }, { at: 0.2, x: -8, rotate: -4 }, { at: 0.45, x: 8, rotate: 4 }, { at: 0.7, x: -6, rotate: -3 }, { at: 1 }], 'pupil-left': hold({ x: -5 }, 0.2, 0.7), 'pupil-right': hold({ x: -5 }, 0.2, 0.7) }),
  'scratch-head': clip(1800, false, { 'arm-right': hold({ rotate: -122 }), 'forearm-right': shake({ rotate: -72 }, 'rotate', -12, 3), 'hand-right': hold({ variant: 'open' }), head: hold({ rotate: 5 }) }),
  facepalm: clip(1800, false, { 'arm-right': hold({ rotate: -162 }, 0.25), 'forearm-right': hold({ rotate: -96 }, 0.25), 'hand-right': hold({ variant: 'open' }, 0.25), head: hold({ y: 8, rotate: -4 }, 0.3) }),
};

const legSwing = (amp: number, knee: number, lift = 0): Record<string, RigKey[]> => {
  const keys = (sign: number) => [0, 0.25, 0.5, 0.75, 1].map((at) => {
    const s = Math.sin(at * Math.PI * 2) * sign;
    return { at, rotate: amp * s };
  });
  const shin = (sign: number) => [0, 0.25, 0.5, 0.75, 1].map((at) => ({ at, rotate: Math.max(0, Math.sin(at * Math.PI * 2) * sign) * knee * -sign }));
  const foot = (sign: number) => [0, 0.25, 0.5, 0.75, 1].map((at) => ({ at, y: -Math.max(0, -Math.sin(at * Math.PI * 2) * sign) * lift }));
  return { 'leg-left': keys(1), 'leg-right': keys(-1), 'shin-left': shin(1), 'shin-right': shin(-1), ...(lift ? { 'foot-left': foot(1), 'foot-right': foot(-1) } : {}) };
};
const cycle = (at: number[], f: (a: number) => RigTransform): RigKey[] => at.map((a) => ({ at: a, ...f(a) }));
const Q = [0, 0.25, 0.5, 0.75, 1];

/** Body action recipes; walk/run/tiptoe/idle/seated loop, the rest play once. */
export const ACTION_CLIPS: Record<SvgRigAction, RigClip> = {
  idle: clip(4000, true, { body: cycle(Q, (a) => ({ y: -3 * Math.sin(a * Math.PI * 2) ** 2 })), head: cycle(Q, (a) => ({ rotate: 1.5 * Math.sin(a * Math.PI * 2) })), 'arm-left': cycle(Q, (a) => ({ rotate: 1.5 * Math.sin(a * Math.PI * 2) })), 'arm-right': cycle(Q, (a) => ({ rotate: -1.5 * Math.sin(a * Math.PI * 2) })) }),
  walk: clip(1000, true, { ...legSwing(18, 22), 'arm-left': cycle(Q, (a) => ({ rotate: -12 * Math.sin(a * Math.PI * 2) })), 'arm-right': cycle(Q, (a) => ({ rotate: -12 * Math.sin(a * Math.PI * 2) })), body: cycle([0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1], (a) => ({ y: -7 * Math.abs(Math.sin(a * Math.PI * 2)) })), head: cycle(Q, (a) => ({ rotate: 1.5 * Math.sin(a * Math.PI * 4) })) }),
  run: clip(640, true, { ...legSwing(32, 48), 'arm-left': cycle(Q, (a) => ({ rotate: -30 * Math.sin(a * Math.PI * 2) })), 'arm-right': cycle(Q, (a) => ({ rotate: -30 * Math.sin(a * Math.PI * 2) })), 'forearm-left': hold({ rotate: -55 }, 0.01, 0.99), 'forearm-right': hold({ rotate: 55 }, 0.01, 0.99), body: cycle([0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1], (a) => ({ y: -16 * Math.abs(Math.sin(a * Math.PI * 2)), rotate: -4 })) }),
  tiptoe: clip(1300, true, { ...legSwing(9, 12, 10), body: cycle(Q, (a) => ({ y: -12 - 4 * Math.abs(Math.sin(a * Math.PI * 2)) })), 'arm-left': hold({ rotate: 30 }, 0.01, 0.99), 'arm-right': hold({ rotate: -30 }, 0.01, 0.99), 'forearm-left': hold({ rotate: -70 }, 0.01, 0.99), 'forearm-right': hold({ rotate: 70 }, 0.01, 0.99) }),
  turn: clip(900, false, { body: [{ at: 0 }, { at: 0.5, scaleX: 0.86 }, { at: 1 }], head: [{ at: 0 }, { at: 0.4, x: -10, rotate: -3 }, { at: 1 }] }),
  'sit-down': clip(1200, false, { body: [{ at: 0 }, { at: 0.35, y: 20 }, { at: 1, y: 150 }], 'leg-left': [{ at: 0 }, { at: 1, rotate: 12, scaleY: 0.4 }], 'leg-right': [{ at: 0 }, { at: 1, rotate: -12, scaleY: 0.4 }], 'shin-left': [{ at: 0 }, { at: 1, rotate: -12 }], 'shin-right': [{ at: 0 }, { at: 1, rotate: 12 }], 'arm-left': [{ at: 0 }, { at: 0.5, rotate: 18 }, { at: 1, rotate: 8 }], 'arm-right': [{ at: 0 }, { at: 0.5, rotate: -18 }, { at: 1, rotate: -8 }] }),
  seated: clip(4000, true, { body: cycle(Q, (a) => ({ y: 150 - 3 * Math.sin(a * Math.PI * 2) ** 2 })), 'leg-left': hold({ rotate: 12, scaleY: 0.4 }, 0.01, 0.99), 'leg-right': hold({ rotate: -12, scaleY: 0.4 }, 0.01, 0.99), 'shin-left': hold({ rotate: -12 }, 0.01, 0.99), 'shin-right': hold({ rotate: 12 }, 0.01, 0.99), 'arm-left': hold({ rotate: 8 }, 0.01, 0.99), 'arm-right': hold({ rotate: -8 }, 0.01, 0.99) }),
  'stand-up': clip(1200, false, { body: [{ at: 0, y: 150 }, { at: 0.65, y: 20 }, { at: 1 }], 'leg-left': [{ at: 0, rotate: 12, scaleY: 0.4 }, { at: 1 }], 'leg-right': [{ at: 0, rotate: -12, scaleY: 0.4 }, { at: 1 }], 'shin-left': [{ at: 0, rotate: -12 }, { at: 1 }], 'shin-right': [{ at: 0, rotate: 12 }, { at: 1 }], 'arm-left': [{ at: 0, rotate: 8 }, { at: 0.5, rotate: 18 }, { at: 1 }], 'arm-right': [{ at: 0, rotate: -8 }, { at: 0.5, rotate: -18 }, { at: 1 }] }),
  reach: clip(1500, false, { 'arm-right': hold({ rotate: -120 }, 0.3, 0.7), 'forearm-right': hold({ rotate: 10 }, 0.3, 0.7), 'hand-right': hold({ variant: 'open' }, 0.3, 0.7), body: hold({ rotate: -5, y: -12 }, 0.3, 0.7), 'foot-left': hold({ rotate: 10 }, 0.3, 0.7), 'foot-right': hold({ rotate: -10 }, 0.3, 0.7) }),
  crouch: clip(1400, false, { body: hold({ y: 85 }, 0.3, 0.7), 'leg-left': hold({ rotate: 26 }, 0.3, 0.7), 'leg-right': hold({ rotate: -26 }, 0.3, 0.7), 'shin-left': hold({ rotate: -50 }, 0.3, 0.7), 'shin-right': hold({ rotate: 50 }, 0.3, 0.7), 'foot-left': hold({ rotate: 24 }, 0.3, 0.7), 'foot-right': hold({ rotate: -24 }, 0.3, 0.7), 'arm-left': hold({ rotate: 20 }, 0.3, 0.7), 'arm-right': hold({ rotate: -20 }, 0.3, 0.7) }),
  jump: clip(1200, false, {
    body: [{ at: 0 }, { at: 0.2, y: 50 }, { at: 0.45, y: -150 }, { at: 0.7, y: 0 }, { at: 0.8, y: 35 }, { at: 1 }],
    'leg-left': [{ at: 0 }, { at: 0.2, rotate: 18 }, { at: 0.45, rotate: -4 }, { at: 0.8, rotate: 14 }, { at: 1 }], 'leg-right': [{ at: 0 }, { at: 0.2, rotate: -18 }, { at: 0.45, rotate: 4 }, { at: 0.8, rotate: -14 }, { at: 1 }],
    'shin-left': [{ at: 0 }, { at: 0.2, rotate: -34 }, { at: 0.45, rotate: 10 }, { at: 0.8, rotate: -26 }, { at: 1 }], 'shin-right': [{ at: 0 }, { at: 0.2, rotate: 34 }, { at: 0.45, rotate: -10 }, { at: 0.8, rotate: 26 }, { at: 1 }],
    'arm-left': [{ at: 0 }, { at: 0.2, rotate: -10 }, { at: 0.45, rotate: 150 }, { at: 0.8, rotate: 20 }, { at: 1 }], 'arm-right': [{ at: 0 }, { at: 0.2, rotate: 10 }, { at: 0.45, rotate: -150 }, { at: 0.8, rotate: -20 }, { at: 1 }],
  }),
  bow: clip(1800, false, { head: hold({ y: 38, scaleY: 0.92 }, 0.35, 0.7), body: hold({ y: 12, scaleY: 0.96 }, 0.35, 0.7), 'arm-left': hold({ rotate: -6 }, 0.35, 0.7), 'arm-right': hold({ rotate: 6 }, 0.35, 0.7) }),
  recoil: clip(1000, false, { body: [{ at: 0 }, { at: 0.18, x: 26, rotate: 5 }, { at: 0.6, x: 20, rotate: 4 }, { at: 1 }], head: [{ at: 0 }, { at: 0.15, x: 14, y: -6 }, { at: 0.6, x: 10 }, { at: 1 }], 'arm-left': [{ at: 0 }, { at: 0.18, rotate: 40 }, { at: 0.6, rotate: 30 }, { at: 1 }], 'arm-right': [{ at: 0 }, { at: 0.18, rotate: -40 }, { at: 0.6, rotate: -30 }, { at: 1 }] }),
  celebrate: clip(1800, false, { ...both((s, out) => ({ [`arm-${s}`]: shake({ rotate: 155 * out }, 'rotate', 12 * out, 3), [`forearm-${s}`]: hold({ rotate: -10 * out }), [`hand-${s}`]: hold({ variant: 'fist' }) })), body: [{ at: 0 }, { at: 0.25, y: -40 }, { at: 0.4, y: 0 }, { at: 0.55, y: -34 }, { at: 0.7, y: 0 }, { at: 1 }] }),
};

/** Drops tracks and variants a view can't use, so one recipe binds to every character (and validates). */
export function bindClip(c: RigClip, views: RigPart[][]): RigClip {
  const ok = (part: string) => views.every((ps) => ps.some((p) => p.id === part));
  const variantOk = (part: string, v: string) => views.every((ps) => !!ps.find((p) => p.id === part)?.variants?.[v]);
  return {
    ...c,
    tracks: c.tracks.filter((t) => ok(t.part)).map((t) => ({ ...t, keys: t.keys.map(({ variant, ...k }) => (variant && variantOk(t.part, variant) ? { ...k, variant } : k)) })),
  };
}

/** Adds the shared expressions and blink to one view's artwork. */
export const bindView = (art: ViewArt): SvgRigView => ({ ...art, expressions: expressionsFor(art.parts), blink: blinkFor(art.parts) });

/** A complete pack from the six views' artwork: shared expressions, blink, gestures and actions bound to them. */
export function assemblePack(art: Record<SvgRigViewId, ViewArt>, bodyFamily: SvgRigPack['bodyFamily']): SvgRigPack {
  const views = Object.fromEntries(SVG_RIG_VIEWS.map((v) => [v, bindView(art[v])])) as Record<SvgRigViewId, SvgRigView>;
  const parts = SVG_RIG_VIEWS.map((v) => art[v].parts);
  return {
    version: 1, bodyFamily, views,
    gestures: Object.fromEntries(SVG_RIG_GESTURES.map((g) => [g, bindClip(GESTURE_CLIPS[g], parts)])) as SvgRigPack['gestures'],
    actions: Object.fromEntries(SVG_RIG_ACTIONS.map((a) => [a, bindClip(ACTION_CLIPS[a], parts)])) as SvgRigPack['actions'],
  };
}

// ---------- mirroring a view (left → right) ----------

const NUM = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
/** Which arguments of each path command are x coordinates (negated) or arc sweep flags (flipped), per repeat. */
const ARGS: Record<string, string> = { m: 'xy', l: 'xy', t: 'xy', h: 'x', v: 'y', c: 'xyxyxy', s: 'xyxy', q: 'xyxy', a: 'rrnfsxy', z: '' };

/** The path mirrored across its local x = 0 (absolute and relative commands alike, since negation is linear). */
export function mirrorPath(d: string): string {
  const out: string[] = [];
  for (const [, cmd, body] of d.matchAll(/([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g)) {
    const roles = ARGS[cmd.toLowerCase()];
    const nums = (body.match(NUM) ?? []).map(Number);
    const mapped = nums.map((n, i) => {
      const r = roles[i % roles.length];
      return r === 'x' || r === 'n' ? -n : r === 's' ? (n ? 0 : 1) : n;
    });
    out.push(cmd + mapped.map((n) => Number(n.toFixed(3))).join(' '));
  }
  return out.join(' ');
}

const mirrorShape = (s: RigShape): RigShape => (
  s.kind === 'path' ? { ...s, d: mirrorPath(s.d ?? '') }
  : s.kind === 'rect' ? { ...s, x: -((s.x ?? 0) + (s.width ?? 0)) }
  : { ...s, x: -(s.x ?? 0) });
const swapSide = (id: string) => id.replace(/-(left|right)$/, (_, s: string) => (s === 'left' ? '-right' : '-left'));

/** The view seen from the other side: geometry mirrored about the canvas centre, left/right part ids swapped. */
export function mirrorView(art: ViewArt): ViewArt {
  return {
    ...art,
    mouthPart: art.mouthPart && swapSide(art.mouthPart),
    parts: art.parts.map((p) => ({
      ...p, id: swapSide(p.id), parent: p.parent && swapSide(p.parent),
      x: p.parent === null ? 1000 - p.x : -p.x,
      shapes: p.shapes.map(mirrorShape),
      ...(p.variants ? { variants: Object.fromEntries(Object.entries(p.variants).map(([k, v]) => [k, v.map(mirrorShape)])) } : {}),
    })),
  };
}
