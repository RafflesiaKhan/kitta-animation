import type { RigPart, RigShape, SvgRigPack, SvgRigViewId } from './svg-rig';
import { assemblePack, mirrorView, type ViewArt } from './svg-rig-motion';

// "Haru", a hand-authored diagnostic character (plan slice 1): an original design in the flat, thick-outlined TV
// cartoon style of the reference episode — round head, small moustache, kurta and scarf. It exercises every view,
// part, mouth shape and optional feature, so the renderer, motion and export are testable without any model call.

const OUT = '#2b1d18', SKIN = '#c98d68', SKIN_D = '#a9714f', HAIR = '#1f1714', KURTA = '#3b9c95', KURTA_FAR = '#2f7f79';
const SCARF = '#a3303d', DHOTI = '#efe6d2', DHOTI_FAR = '#d8ccb2', SANDAL = '#6b4226', MOUTH = '#5b1f24', TONGUE = '#d9727a', WHITE = '#ffffff';
const W = 8;

const path = (d: string, fill: string, stroke: string | undefined = OUT, strokeWidth = W): RigShape => ({ kind: 'path', d, fill, ...(stroke ? { stroke, strokeWidth } : {}) });
const line = (d: string, stroke: string, strokeWidth: number): RigShape => ({ kind: 'path', d, fill: 'none', stroke, strokeWidth });
const ell = (x: number, y: number, rx: number, ry: number, fill: string, stroke: string | undefined = OUT, strokeWidth = W): RigShape => ({ kind: 'ellipse', x, y, rx, ry, fill, ...(stroke ? { stroke, strokeWidth } : {}) });
const part = (id: string, parent: string | null, x: number, y: number, shapes: RigShape[], variants?: Record<string, RigShape[]>): RigPart =>
  ({ id, parent, x, y, shapes, ...(variants ? { variants } : {}) });

/** Scales an absolute-coordinate path's x by k (about 0) and shifts it: turns front drawings into three-quarter ones. */
function squash(d: string, k: number, dx = 0): string {
  return d.replace(/([MLCQ])([^MLCQZ]*)/g, (_, cmd: string, body: string) =>
    cmd + body.trim().split(/[\s,]+/).map((n, i) => (i % 2 === 0 ? Number((Number(n) * k + dx).toFixed(2)) : Number(n))).join(' ') + ' ');
}

/** Speech (A–H, X) and silent mouths, k = width (narrower when turned). */
function mouths(k = 1): Record<string, RigShape[]> {
  const w = (n: number) => Math.round(n * k);
  return {
    X: [line(`M ${w(-36)} 0 Q 0 9 ${w(36)} 0`, OUT, 7)],
    A: [line(`M ${w(-32)} 2 L ${w(32)} 2`, OUT, 8)],
    B: [ell(0, 4, w(30), 11, MOUTH, OUT, 6), { kind: 'rect', x: w(-20), y: -4, width: w(40), height: 8, fill: WHITE }],
    C: [ell(0, 8, w(30), 20, MOUTH, OUT, 6), ell(0, 18, w(16), 7, TONGUE, undefined)],
    D: [path(`M ${w(-40)} -6 Q 0 -12 ${w(40)} -6 Q ${w(36)} 40 0 44 Q ${w(-36)} 40 ${w(-40)} -6 Z`, MOUTH, OUT, 6), { kind: 'rect', x: w(-28), y: -7, width: w(56), height: 9, fill: WHITE }, ell(0, 30, w(20), 9, TONGUE, undefined)],
    E: [ell(0, 8, w(20), 19, MOUTH, OUT, 6)],
    F: [ell(0, 6, w(12), 13, MOUTH, OUT, 6)],
    G: [ell(0, 4, w(28), 10, MOUTH, OUT, 6), { kind: 'rect', x: w(-18), y: -5, width: w(36), height: 9, fill: WHITE }, line(`M ${w(-24)} 12 Q 0 6 ${w(24)} 12`, OUT, 5)],
    H: [ell(0, 7, w(26), 16, MOUTH, OUT, 6), ell(0, 0, w(13), 6, TONGUE, undefined)],
    smile: [line(`M ${w(-44)} -6 Q 0 32 ${w(44)} -6`, OUT, 7)],
    grin: [path(`M ${w(-48)} -8 Q 0 -2 ${w(48)} -8 Q ${w(30)} 42 0 42 Q ${w(-30)} 42 ${w(-48)} -8 Z`, MOUTH, OUT, 6), path(`M ${w(-40)} -6 Q 0 0 ${w(40)} -6 L ${w(36)} 6 Q 0 12 ${w(-36)} 6 Z`, WHITE, undefined)],
    frown: [line(`M ${w(-36)} 12 Q 0 -14 ${w(36)} 12`, OUT, 7)],
    o: [ell(0, 6, w(15), 18, MOUTH, OUT, 6)],
    smirk: [line(`M ${w(-34)} 6 Q ${w(6)} 12 ${w(40)} -10`, OUT, 7)],
  };
}

const hands = (dir: number): { shapes: RigShape[]; variants: Record<string, RigShape[]> } => {
  const thumb = path(`M ${dir * -18} 8 Q ${dir * -40} 18 ${dir * -30} 34 Q ${dir * -20} 30 ${dir * -14} 22 Z`, SKIN, OUT, 6);
  const fist = ell(0, 24, 30, 30, SKIN);
  return {
    shapes: [fist, thumb],
    variants: {
      fist: [fist, line(`M -14 30 Q 0 38 14 30`, SKIN_D, 4)],
      open: [path('M -28 4 L -32 46 Q -24 66 -12 52 L -6 62 Q 4 72 10 58 L 18 62 Q 30 64 30 46 L 28 4 Z', SKIN, OUT, 7), path(`M ${dir * -24} 10 Q ${dir * -48} 18 ${dir * -42} 32 Q ${dir * -30} 32 ${dir * -22} 24 Z`, SKIN, OUT, 6)],
      point: [fist, path('M -8 40 L -9 86 Q 0 96 9 86 L 8 40 Z', SKIN, OUT, 6)],
      'thumbs-up': [ell(0, 26, 28, 26, SKIN), path(`M ${dir * -6} 8 L ${dir * -8} -30 Q ${dir * 2} -42 ${dir * 10} -30 L ${dir * 12} 8 Z`, SKIN, OUT, 6)],
    },
  };
};

function arm(side: 'left' | 'right', x: number, y: number, sleeve: string, dir: number): RigPart[] {
  const h = hands(dir);
  return [
    part(`arm-${side}`, 'body', x, y, [path('M -32 -22 Q -48 70 -40 150 L 38 150 Q 42 70 32 -20 Z', sleeve)]),
    part(`forearm-${side}`, `arm-${side}`, 0, 145, [path('M -26 0 L 26 0 L 22 116 L -22 116 Z', SKIN)]),
    part(`hand-${side}`, `forearm-${side}`, 0, 112, h.shapes, h.variants),
  ];
}

function leg(side: 'left' | 'right', x: number, cloth: string, toe: number): RigPart[] {
  return [
    part(`leg-${side}`, 'body', x, 30, [path('M -60 -10 L 60 -10 L 70 170 Q 0 186 -70 170 Z', cloth)]),
    part(`shin-${side}`, `leg-${side}`, 0, 168, [path('M -26 0 L 26 0 L 22 136 L -22 136 Z', SKIN)]),
    part(`foot-${side}`, `shin-${side}`, 0, 134, [ell(toe, 0, 40, 15, SKIN), line(`M ${toe - 42} 8 Q ${toe} 22 ${toe + 42} 8`, SANDAL, 10)]),
  ];
}

const eye = (side: 'left' | 'right', x: number, k = 1): RigPart[] => [
  part(`eye-${side}`, 'head', x, -178, [ell(0, 0, 30 * k, 36, WHITE, OUT, 6)], { closed: [line(`M ${-28 * k} 2 Q 0 18 ${28 * k} 2`, OUT, 7)] }),
  part(`pupil-${side}`, `eye-${side}`, 4 * k, 6, [ell(0, 0, 12 * k, 14, OUT, undefined), ell(-4 * k, -5, 4, 4, WHITE, undefined)]),
];
const blankEye = (side: 'left' | 'right', x: number): RigPart[] => [part(`eye-${side}`, 'head', x, -178, []), part(`pupil-${side}`, `eye-${side}`, 0, 0, [])];
const brow = (side: 'left' | 'right', x: number, k = 1): RigPart => part(`brow-${side}`, 'head', x, -232, [line(`M ${-32 * k} 6 Q 0 -10 ${32 * k} 2`, HAIR, 11)]);
const extras = (side: 'left' | 'right', cheekX: number, tearX: number): RigPart[] => [
  part(`cheek-${side}`, 'head', cheekX, -98, [], { blush: [ell(0, 0, 26, 13, '#df7d6f', undefined)] }),
  part(`tear-${side}`, 'head', tearX, -140, [], { on: [path('M 0 0 Q -12 22 0 32 Q 12 22 0 0 Z', '#7cc8f0', OUT, 3)] }),
];

const BODY = 'M -130 -258 C -205 -240 -222 -140 -212 -50 C -205 30 -180 60 -150 72 Q 0 95 150 72 C 180 60 205 30 212 -50 C 222 -140 205 -240 130 -258 Q 0 -280 -130 -258 Z';
const HEAD = 'M 0 -312 C 95 -312 158 -245 155 -150 C 153 -70 115 0 0 8 C -115 0 -153 -70 -155 -150 C -158 -245 -95 -312 0 -312 Z';
const NOSE = 'M -10 -150 C -38 -112 -30 -88 0 -88 C 30 -88 38 -112 10 -150';
const MUSTACHE = 'M -42 -70 Q -22 -86 0 -76 Q 22 -86 42 -70 Q 22 -62 0 -66 Q -22 -62 -42 -70 Z';
const HAIR_L = 'M -150 -205 Q -178 -150 -152 -92 L -130 -108 Q -146 -150 -127 -208 Z';
const SCARF_L = 'M -95 -262 Q -130 -150 -112 -20 L -70 -16 Q -78 -150 -50 -255 Z';
const SCARF_NECK = 'M -100 -265 Q 0 -222 100 -265 L 92 -238 Q 0 -198 -92 -238 Z';
const ear = (x: number) => [ell(x, -145, 26, 36, SKIN), line(`M ${x + (x < 0 ? 8 : -8)} -162 Q ${x - (x < 0 ? 8 : -8)} -145 ${x + (x < 0 ? 6 : -6)} -128`, SKIN_D, 5)];

const front = (): ViewArt => ({
  waistY: 600, groundY: 952, mouthPart: 'mouth',
  parts: [
    part('body', null, 500, 600, []), // the body's own drawing comes after the legs, below
    ...leg('left', -72, DHOTI, -8), ...leg('right', 72, DHOTI, 8),
    part('torso', 'body', 0, 0, [path(BODY, KURTA), line('M 0 -250 L 0 40', KURTA_FAR, 6), line('M -120 10 Q 0 40 120 10', KURTA_FAR, 5),
      ell(0, -200, 6, 6, '#f3d27a', OUT, 3), ell(0, -150, 6, 6, '#f3d27a', OUT, 3), ell(0, -100, 6, 6, '#f3d27a', OUT, 3),
      path(SCARF_L, SCARF), path(squash(SCARF_L, -1), SCARF), path(SCARF_NECK, SCARF)]),
    part('head', 'body', 0, -250, [...ear(-150), ...ear(150), path(HEAD, SKIN), path(HAIR_L, HAIR), path(squash(HAIR_L, -1), HAIR),
      line('M -26 -302 Q 0 -322 26 -302', HAIR, 7), line('M -62 -8 Q 0 16 62 -8', SKIN_D, 5), path(NOSE, SKIN), path(MUSTACHE, HAIR)]),
    ...eye('left', -58), ...eye('right', 58), brow('left', -58), brow('right', 58),
    part('mouth', 'head', 0, -42, mouths().X, mouths()),
    ...extras('left', -96, -72), ...extras('right', 96, 72),
    ...arm('left', -175, -225, KURTA, 1), ...arm('right', 175, -225, KURTA, -1),
  ],
});

/** Turned toward screen-left: the screen-left side recedes. */
const threeQuarter = (): ViewArt => {
  const k = 0.9, dx = -14, face = -38;
  return {
    waistY: 600, groundY: 952, mouthPart: 'mouth',
    parts: [
      part('body', null, 500, 600, []),
      ...arm('left', -150, -228, KURTA_FAR, 1),
      ...leg('left', -50, DHOTI_FAR, -10), ...leg('right', 78, DHOTI, -6),
      part('torso', 'body', 0, 0, [path(squash(BODY, k, dx), KURTA), line(`M ${face} -250 Q ${face - 10} -100 ${face} 40`, KURTA_FAR, 6),
        path(squash(SCARF_L, 0.75, -10), SCARF), path(squash(SCARF_L, -0.95, -20), SCARF), path(squash(SCARF_NECK, k, dx), SCARF)]),
      part('head', 'body', -6, -250, [...ear(142), path(squash(HEAD, 0.97, -4), SKIN), path(squash(HAIR_L, -1, 4), HAIR),
        line('M -40 -302 Q -14 -322 12 -302', HAIR, 7), line('M -96 -6 Q -30 16 34 -10', SKIN_D, 5), path(squash(NOSE, 1.1, face - 12), SKIN), path(squash(MUSTACHE, 0.9, face), HAIR)]),
      ...eye('left', -106, 0.74), ...eye('right', 18), brow('left', -106, 0.74), brow('right', 18),
      part('mouth', 'head', face, -42, mouths(0.85).X, mouths(0.85)),
      ...extras('left', -125, -112), ...extras('right', 62, 30),
      ...arm('right', 165, -224, KURTA, -1),
    ],
  };
};

/** Facing screen-left: the near (screen-right) eye, arm and leg show. */
const profile = (): ViewArt => ({
  waistY: 600, groundY: 952, mouthPart: 'mouth',
  parts: [
    part('body', null, 500, 600, []),
    ...arm('left', 30, -232, KURTA_FAR, 1),
    ...leg('left', 22, DHOTI_FAR, -22), ...leg('right', -14, DHOTI, -22),
    part('torso', 'body', 0, 0, [path('M 30 -262 C -60 -270 -150 -200 -175 -90 C -190 0 -140 70 -60 78 L 60 76 C 110 60 120 -20 105 -120 C 95 -200 90 -250 30 -262 Z', KURTA),
      path('M -30 -262 Q -95 -160 -105 -30 L -65 -28 Q -55 -150 5 -250 Z', SCARF), path('M 40 -258 Q 85 -170 80 -60 L 52 -62 Q 55 -170 15 -250 Z', SCARF)]),
    part('head', 'body', 0, -250, [ell(55, -145, 26, 36, SKIN), path('M 10 -312 C 100 -312 150 -240 145 -150 C 140 -60 90 5 -10 8 C -90 8 -140 -40 -148 -110 C -152 -200 -95 -312 10 -312 Z', SKIN),
      path('M 70 -252 Q 150 -200 140 -100 L 112 -102 Q 116 -190 58 -236 Z', HAIR), line('M -20 -306 Q 10 -322 40 -308', HAIR, 7),
      path('M -138 -152 C -192 -140 -194 -96 -146 -90', SKIN), path('M -150 -76 Q -126 -92 -100 -76 Q -126 -64 -150 -72 Z', HAIR)]),
    ...blankEye('left', -80), ...eye('right', -82, 0.62), part('brow-left', 'head', -80, -232, []), brow('right', -82, 0.75),
    part('mouth', 'head', -112, -44, mouths(0.5).X, mouths(0.5)),
    part('cheek-left', 'head', -60, -98, [], { blush: [] }), part('tear-left', 'head', -90, -140, [], { on: [] }), ...extras('right', -58, -92),
    ...arm('right', -10, -226, KURTA, -1),
  ],
});

const back = (): ViewArt => ({
  waistY: 600, groundY: 952, mouthPart: null,
  parts: [
    part('body', null, 500, 600, []),
    ...leg('left', -72, DHOTI, 0), ...leg('right', 72, DHOTI, 0),
    part('torso', 'body', 0, 0, [path(BODY, KURTA), line('M -120 10 Q 0 40 120 10', KURTA_FAR, 5), path(SCARF_NECK, SCARF)]),
    part('head', 'body', 0, -250, [...ear(-150), ...ear(150), path(HEAD, SKIN), path('M -152 -175 Q -150 -50 0 -32 Q 150 -50 152 -175 Q 120 -120 0 -112 Q -120 -120 -152 -175 Z', HAIR)]),
    ...blankEye('left', -58), ...blankEye('right', 58), part('brow-left', 'head', -58, -232, []), part('brow-right', 'head', 58, -232, []),
    part('mouth', 'head', 0, -42, []),
    ...arm('left', -175, -225, KURTA, 1), ...arm('right', 175, -225, KURTA, -1),
  ],
});

/** The six views' artwork: right-facing ones are mirrors (the design is symmetric, so mirroring keeps its details). */
export function fixtureArt(): Record<SvgRigViewId, ViewArt> {
  const tq = threeQuarter(), side = profile();
  return { front: front(), 'three-quarter-left': tq, 'three-quarter-right': mirrorView(tq), 'profile-left': side, 'profile-right': mirrorView(side), back: back() };
}

export const fixturePack = (): SvgRigPack => assemblePack(fixtureArt(), 'human');
