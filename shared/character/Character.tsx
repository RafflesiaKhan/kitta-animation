import type { ReactElement } from 'react';
import type { CharacterConfig, FrameState, StarterId } from '../types';
import { FACES, mixFaces, type BrowParams, type FaceParams, type MouthMood } from './expressions';
import { mouthDetail, mouthPath } from './mouth';

// Pure props → SVG. No hooks, no CSS, no browser APIs: this is also rendered
// server-side (renderToStaticMarkup + resvg) for video export.

const INK = '#2d2a32';
const SW = 7; // outline width at the 1000×1000 viewBox
const SHIRT = '#f7f3e9'; // shirt under overalls
const MOUTH_IN = '#5b1f2b';
const TONGUE = '#ff7b8a';
const CHEEK = '#ff8fa3';

interface Layout {
  head: { cx: number; cy: number; rx: number; ry: number };
  eye: { dx: number; y: number; r: number };
  mouth: { y: number; scale: number };
  shoulderY: number; // top of the torso
  shoulderW: number; // half-width of the torso
  arm: { len: number; w: number };
  ears: 'human' | 'animal';
  cheeks: boolean;
  hairRange: [number, number]; // degrees on the head ellipse (270 = top)
}

const LAYOUTS: Record<StarterId, Layout> = {
  // round-faced kid: big round head, compact body
  kit: { head: { cx: 500, cy: 440, rx: 225, ry: 215 }, eye: { dx: 80, y: 445, r: 34 }, mouth: { y: 550, scale: 1 },
    shoulderY: 700, shoulderW: 200, arm: { len: 170, w: 58 }, ears: 'human', cheeks: true, hairRange: [190, 350] },
  // taller teen: oval head sitting higher, longer neck, broader shoulders
  milo: { head: { cx: 500, cy: 380, rx: 175, ry: 220 }, eye: { dx: 68, y: 390, r: 30 }, mouth: { y: 500, scale: 0.9 },
    shoulderY: 665, shoulderW: 215, arm: { len: 190, w: 60 }, ears: 'human', cheeks: false, hairRange: [185, 355] },
  // small animal mascot: low wide head, big eyes, pointy ears, muzzle
  pip: { head: { cx: 500, cy: 560, rx: 210, ry: 185 }, eye: { dx: 85, y: 545, r: 38 }, mouth: { y: 655, scale: 0.75 },
    shoulderY: 775, shoulderW: 165, arm: { len: 150, w: 52 }, ears: 'animal', cheeks: true, hairRange: [245, 295] },
};

const n = (v: number) => Math.round(v * 10) / 10;
const rad = (deg: number) => (deg * Math.PI) / 180;
const onEllipse = (h: Layout['head'], deg: number, k = 1): [number, number] =>
  [h.cx + h.rx * k * Math.cos(rad(deg)), h.cy + h.ry * k * Math.sin(rad(deg))];

// ---------- hair ----------
function hairCap(h: Layout['head'], [a0, a1]: [number, number], k: number, hairline: number): string {
  const [x0, y0] = onEllipse(h, a0, k);
  const [x1, y1] = onEllipse(h, a1, k);
  return `M${n(x0)} ${n(y0)} A${n(h.rx * k)} ${n(h.ry * k)} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${n(x1)} ${n(y1)} Q${h.cx} ${n(h.cy - h.ry * hairline)} ${n(x0)} ${n(y0)} Z`;
}

function Hair({ style, color, layout }: { style: string; color: string; layout: Layout }) {
  const h = layout.head;
  const range = layout.hairRange;
  const common = { fill: color, stroke: INK, strokeWidth: SW, strokeLinejoin: 'round' as const };
  if (style === 'bob') {
    const tuft = range[1] - range[0] < 120;
    return (
      <g data-part="hair">
        {!tuft && (
          <path {...common} d={`M${n(h.cx - h.rx * 1.06)} ${n(h.cy + h.ry * 0.35)} L${n(h.cx - h.rx * 1.06)} ${n(h.cy - h.ry * 0.1)} L${n(h.cx - h.rx * 0.78)} ${n(h.cy - h.ry * 0.1)} L${n(h.cx - h.rx * 0.78)} ${n(h.cy + h.ry * 0.35)} Z M${n(h.cx + h.rx * 1.06)} ${n(h.cy + h.ry * 0.35)} L${n(h.cx + h.rx * 1.06)} ${n(h.cy - h.ry * 0.1)} L${n(h.cx + h.rx * 0.78)} ${n(h.cy - h.ry * 0.1)} L${n(h.cx + h.rx * 0.78)} ${n(h.cy + h.ry * 0.35)} Z`} />
        )}
        <path {...common} d={hairCap(h, tuft ? [235, 305] : [175, 365], 1.06, tuft ? 0.8 : 0.55)} />
      </g>
    );
  }
  if (style === 'curly') {
    const [a0, a1] = range;
    const step = (a1 - a0) / Math.max(3, Math.round((a1 - a0) / 22));
    const curls: [number, number][] = [];
    for (let a = a0; a <= a1 + 0.01; a += step) curls.push(onEllipse(h, a, 1.0));
    const r = h.rx * (range[1] - range[0] < 120 ? 0.14 : 0.2);
    return (
      <g data-part="hair">
        <path {...common} d={hairCap(h, range, 1.02, 0.8)} />
        {curls.map(([x, y], i) => <circle key={i} {...common} cx={n(x)} cy={n(y)} r={n(r)} />)}
      </g>
    );
  }
  // spiky (default): zig-zag crown
  const [a0, a1] = range;
  const spikes = range[1] - range[0] < 120 ? 3 : 7;
  const pts: string[] = [];
  for (let i = 0; i <= spikes * 2; i++) {
    const [x, y] = onEllipse(h, a0 + ((a1 - a0) * i) / (spikes * 2), i % 2 ? 1.28 : 1.0);
    pts.push(`${n(x)} ${n(y)}`);
  }
  const [x0, y0] = onEllipse(h, a0);
  return (
    <g data-part="hair">
      <path {...common} d={`M${pts.join(' L')} Q${h.cx} ${n(h.cy - h.ry * 0.8)} ${n(x0)} ${n(y0)} Z`} />
    </g>
  );
}

// ---------- eyes & brows ----------
// lid: upper lid 0 open .. 1 shut; squint: lower-lid smile 0..1; lookX/lookY: pupil offset -1..1.
function Eye({ side, x, y, r, style, scale, lid, squint, lookX, lookY, blink, lookDown, skin }: {
  side: 'left' | 'right'; x: number; y: number; r: number; style: string; scale: number; lid: number; squint: number;
  lookX: number; lookY: number; blink: boolean; lookDown: boolean; skin: string;
}) {
  const R = r * scale;
  const dot = style === 'dot';
  const px = x + lookX * R * 0.35;
  const py = y + lookY * R * 0.3 + (lookDown ? 8 : 0);
  let eye: ReactElement;
  if (blink || lid >= 0.92) {
    eye = <path d={`M${n(x - R)} ${n(y)} Q${n(x)} ${n(y + R * 0.6)} ${n(x + R)} ${n(y)}`} fill="none" stroke={INK} strokeWidth={SW + 2} strokeLinecap="round" />;
  } else {
    const pr = dot ? R * 0.55 : R * 0.48;
    const pcy = dot ? py : py + R * 0.15;
    // Skin-coloured lids drawn over the eye; the upper lid edge moves down with lid, the lower one up with squint.
    const top = y - R * 1.15, lidY = top + R * 2.1 * lid;
    const sq = (k0: number, k1: number) => y + R * (k0 + (k1 - k0) * squint);
    const sqEdge = sq(1.3, 0.45), sqCtrl = sq(1.3, -0.25);
    eye = (
      <g>
        {!dot && <ellipse cx={x} cy={y} rx={n(R)} ry={n(R * 1.15)} fill="#ffffff" stroke={INK} strokeWidth={SW} />}
        <ellipse data-part="pupil" cx={n(px)} cy={n(pcy)} rx={n(pr)} ry={n(dot ? pr * 1.3 : pr)} fill={INK} />
        <circle cx={n(px + pr * 0.35)} cy={n(pcy - pr * 0.4)} r={n(pr * 0.3)} fill="#ffffff" />
        {lid > 0.02 && (
          <g data-part="lid">
            <path d={`M${n(x - R - 8)} ${n(top - 10)} L${n(x + R + 8)} ${n(top - 10)} L${n(x + R + 8)} ${n(lidY)} Q${n(x)} ${n(lidY + R * 0.2)} ${n(x - R - 8)} ${n(lidY)} Z`} fill={skin} />
            <path d={`M${n(x - R - 4)} ${n(lidY)} Q${n(x)} ${n(lidY + R * 0.2)} ${n(x + R + 4)} ${n(lidY)}`} fill="none" stroke={INK} strokeWidth={SW} strokeLinecap="round" />
          </g>
        )}
        {squint > 0.02 && (
          <g data-part="squint">
            <path d={`M${n(x - R - 8)} ${n(y + R * 1.4)} L${n(x - R - 8)} ${n(sqEdge)} Q${n(x)} ${n(sqCtrl)} ${n(x + R + 8)} ${n(sqEdge)} L${n(x + R + 8)} ${n(y + R * 1.4)} Z`} fill={skin} />
            <path d={`M${n(x - R - 4)} ${n(sqEdge + R * 0.02)} Q${n(x)} ${n(sqCtrl + R * 0.05)} ${n(x + R + 4)} ${n(sqEdge + R * 0.02)}`} fill="none" stroke={INK} strokeWidth={SW} strokeLinecap="round" />
          </g>
        )}
      </g>
    );
  }
  return <g data-part={`eye-${side}`}>{eye}</g>;
}

function Brow({ side, x, y, brow: b }: { side: 'left' | 'right'; x: number; y: number; brow: BrowParams }) {
  const dir = side === 'left' ? 1 : -1; // direction towards the face centre
  const by = y - b.raise;
  const ix = x + 32 * dir, ox = x - 32 * dir;
  const iy = by + b.inner, oy = by + b.outer;
  return (
    <path data-part={`brow-${side}`} d={`M${n(ox)} ${n(oy)} Q${n(x)} ${n((iy + oy) / 2 - b.arch * 2)} ${n(ix)} ${n(iy)}`}
      fill="none" stroke={INK} strokeWidth={14} strokeLinecap="round" />
  );
}

// ---------- mouth ----------
// Short stable hash of the path, so the clip id follows the geometry even mid-blend.
const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i); return (h >>> 0).toString(36); };

export function Mouth({ shape, mood, x, y, scale }: { shape: FrameState['mouth']; mood: MouthMood; x: number; y: number; scale: number }) {
  const d = mouthPath(shape, mood);
  const det = mouthDetail(shape, mood);
  // Same id ⇔ same local geometry, so duplicate ids across several characters on one page are harmless.
  const clipId = `kitta-mouth-${hash(d)}`;
  return (
    <g data-part="mouth" data-shape={shape} transform={`translate(${n(x)} ${n(y)}) scale(${scale})`}>
      <defs><clipPath id={clipId}><path d={d} /></clipPath></defs>
      <path d={d} fill={MOUTH_IN} />
      <g clipPath={`url(#${clipId})`}>
        {det.tongue && <ellipse cx={n(det.tongue.cx)} cy={n(det.tongue.cy)} rx={n(det.tongue.rx)} ry={n(Math.max(det.tongue.ry, 1))} fill={TONGUE} />}
        {det.teethBottom !== null && <rect x={n(-det.w)} y={-200} width={n(det.w * 2)} height={n(det.teethBottom + 200)} fill="#ffffff" />}
      </g>
      <path d={d} fill="none" stroke={INK} strokeWidth={n(SW / scale)} strokeLinejoin="round" />
    </g>
  );
}

// ---------- body ----------
function Body({ config, layout }: { config: CharacterConfig; layout: Layout }) {
  const { cx, cy, ry } = layout.head;
  const top = layout.shoulderY, w = layout.shoulderW;
  const torso = `M${cx - w} 1030 L${cx - w} ${top + 80} Q${cx - w} ${top} ${cx - w + 80} ${top} L${cx + w - 80} ${top} Q${cx + w} ${top} ${cx + w} ${top + 80} L${cx + w} 1030 Z`;
  const neckTop = cy + ry * 0.6;
  const line = { fill: 'none', stroke: INK, strokeWidth: SW, strokeLinecap: 'round' as const };
  const o = config.outfit;
  return (
    <g data-part="body">
      {o === 'hoodie' && <path data-part="hood" d={`M${cx - 120} ${top + 20} Q${cx - 130} ${top - 60} ${cx} ${top - 60} Q${cx + 130} ${top - 60} ${cx + 120} ${top + 20} Z`} fill={config.outfitColor} stroke={INK} strokeWidth={SW} />}
      <rect data-part="neck" x={cx - 45} y={n(neckTop)} width={90} height={n(top + 40 - neckTop)} fill={config.skin} stroke={INK} strokeWidth={SW} />
      <path d={torso} fill={o === 'overalls' ? SHIRT : config.outfitColor} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
      {o === 'tshirt' && <path d={`M${cx - 60} ${top} Q${cx} ${top + 70} ${cx + 60} ${top}`} fill={config.skin} stroke={INK} strokeWidth={SW} />}
      {o === 'hoodie' && (
        <g>
          <path d={`M${cx - 70} ${top} Q${cx} ${top + 60} ${cx + 70} ${top}`} fill={config.skin} stroke={INK} strokeWidth={SW} />
          <path {...line} d={`M${cx - 30} ${top + 40} L${cx - 34} ${top + 130} M${cx + 30} ${top + 40} L${cx + 34} ${top + 130}`} />
          <path {...line} d={`M${cx - w * 0.55} 1010 L${cx - w * 0.45} ${top + 170} L${cx + w * 0.45} ${top + 170} L${cx + w * 0.55} 1010`} />
        </g>
      )}
      {o === 'overalls' && (
        <g data-part="overalls">
          <path d={`M${cx - 60} ${top} Q${cx} ${top + 55} ${cx + 60} ${top}`} fill={config.skin} stroke={INK} strokeWidth={SW} />
          <path d={`M${cx - w * 0.62} 1030 L${cx - w * 0.62} ${top + 95} L${cx + w * 0.62} ${top + 95} L${cx + w * 0.62} 1030 Z`} fill={config.outfitColor} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
          <path d={`M${cx - w + 30} ${top + 5} L${cx - w * 0.55} ${top + 100} M${cx + w - 30} ${top + 5} L${cx + w * 0.55} ${top + 100}`} stroke={INK} strokeWidth={34} strokeLinecap="round" />
          <path d={`M${cx - w + 30} ${top + 5} L${cx - w * 0.55} ${top + 100} M${cx + w - 30} ${top + 5} L${cx + w * 0.55} ${top + 100}`} stroke={config.outfitColor} strokeWidth={20} strokeLinecap="round" />
          <circle cx={cx - w * 0.5} cy={top + 112} r={9} fill={INK} />
          <circle cx={cx + w * 0.5} cy={top + 112} r={9} fill={INK} />
        </g>
      )}
    </g>
  );
}

// Arm = upper arm rotated about the shoulder + forearm rotated about the elbow.
function Arm({ side, layout, config, raise, bend }: { side: 'left' | 'right'; layout: Layout; config: CharacterConfig; raise: number; bend: number }) {
  const dir = side === 'right' ? 1 : -1;
  const { len, w } = layout.arm;
  const sx = layout.head.cx + dir * (layout.shoulderW - w * 0.55);
  const sy = layout.shoulderY + w * 0.8;
  const restDeg = side === 'right' ? 82 : 98; // hanging down, slightly outwards
  const ex = sx + len * Math.cos(rad(restDeg)), ey = sy + len * Math.sin(rad(restDeg));
  const hx = ex + len * Math.cos(rad(restDeg)), hy = ey + len * Math.sin(rad(restDeg));
  const sleeve = config.outfit === 'overalls' ? SHIRT : config.outfitColor;
  const fore = config.outfit === 'tshirt' ? config.skin : sleeve;
  const seg = (x1: number, y1: number, x2: number, y2: number) => `M${n(x1)} ${n(y1)} L${n(x2)} ${n(y2)}`;
  const foreT = `rotate(${n(bend)} ${n(ex)} ${n(ey)})`;
  return (
    <g data-part={`arm-${side}`} transform={`rotate(${n(raise)} ${n(sx)} ${n(sy)})`}>
      <path d={seg(sx, sy, ex, ey)} stroke={INK} strokeWidth={w + SW * 2} strokeLinecap="round" />
      <g transform={foreT}><path d={seg(ex, ey, hx, hy)} stroke={INK} strokeWidth={w + SW * 2} strokeLinecap="round" /></g>
      <path d={seg(sx, sy, ex, ey)} stroke={sleeve} strokeWidth={w} strokeLinecap="round" />
      <g transform={foreT}>
        <path d={seg(ex, ey, hx, hy)} stroke={fore} strokeWidth={w} strokeLinecap="round" />
        <circle data-part="hand" cx={n(hx)} cy={n(hy)} r={n(w * 0.75)} fill={config.skin} stroke={INK} strokeWidth={SW} />
      </g>
    </g>
  );
}

// ---------- head extras ----------
function Ears({ layout, skin }: { layout: Layout; skin: string }) {
  const h = layout.head;
  if (layout.ears === 'human') {
    const r = h.rx * 0.17;
    return (
      <g data-part="ears">
        <circle cx={n(h.cx - h.rx * 0.97)} cy={layout.eye.y + 25} r={n(r)} fill={skin} stroke={INK} strokeWidth={SW} />
        <circle cx={n(h.cx + h.rx * 0.97)} cy={layout.eye.y + 25} r={n(r)} fill={skin} stroke={INK} strokeWidth={SW} />
      </g>
    );
  }
  const ear = (sign: number) => {
    const [ax, ay] = onEllipse(h, sign < 0 ? 205 : 335);
    const [bx, by] = onEllipse(h, sign < 0 ? 255 : 285);
    const tx = h.cx + sign * h.rx * 0.88, ty = h.cy - h.ry * 1.35;
    const inner = (k: number) => `${n(tx + (ax - tx) * k)} ${n(ty + (ay - ty) * k)}`;
    return (
      <g key={sign}>
        <path d={`M${n(ax)} ${n(ay)} L${n(tx)} ${n(ty)} L${n(bx)} ${n(by)} Z`} fill={skin} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
        <path d={`M${inner(0.75)} L${n(tx + (ax - tx) * 0.15)} ${n(ty + (by - ty) * 0.2)} L${n(tx + (bx - tx) * 0.7)} ${n(ty + (by - ty) * 0.7)} Z`} fill={CHEEK} />
      </g>
    );
  };
  return <g data-part="ears">{ear(-1)}{ear(1)}</g>;
}

function Glasses({ layout, r }: { layout: Layout; r: number }) {
  const { dx, y } = layout.eye, cx = layout.head.cx, R = r * 1.6;
  const s = { fill: 'none', stroke: INK, strokeWidth: 9 };
  return (
    <g data-part="glasses">
      <circle cx={cx - dx} cy={y} r={n(R)} {...s} fill="#ffffff" fillOpacity={0.2} />
      <circle cx={cx + dx} cy={y} r={n(R)} {...s} fill="#ffffff" fillOpacity={0.2} />
      <path d={`M${n(cx - dx + R)} ${y} Q${cx} ${y - 18} ${n(cx + dx - R)} ${y}`} {...s} />
      <path d={`M${n(cx - dx - R)} ${y - 6} L${n(cx - layout.head.rx * 0.98)} ${y - 14} M${n(cx + dx + R)} ${y - 6} L${n(cx + layout.head.rx * 0.98)} ${y - 14}`} {...s} />
    </g>
  );
}

// ---------- arm posing ----------
interface ArmPose { raise: number; bend: number }
const REST_POSE: ArmPose = { raise: 0, bend: 0 };
const mixPose = (a: ArmPose, b: ArmPose, t: number): ArmPose => ({ raise: a.raise + (b.raise - a.raise) * t, bend: a.bend + (b.bend - a.bend) * t });
const wrap = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;

/** Two-joint reach: the arm pose that puts the hand at (tx, ty), the elbow kept to the outside (or hanging down). */
export function reach(L: Layout, side: 'left' | 'right', tx: number, ty: number, elbow: 'out' | 'down' = 'out'): ArmPose {
  const dir = side === 'right' ? 1 : -1;
  const { len, w } = L.arm;
  const sx = L.head.cx + dir * (L.shoulderW - w * 0.55), sy = L.shoulderY + w * 0.8;
  const dx = tx - sx, dy = ty - sy;
  const d = Math.min(Math.hypot(dx, dy), len * 1.99);
  const aim = Math.atan2(dy, dx), bendA = Math.acos(d / (2 * len));
  // Of the two elbow positions, take the one further out to the character's side (or the lower one).
  const score = (a: number) => (elbow === 'out' ? Math.cos(a) * dir : Math.sin(a));
  const [upper, fore] = score(aim + bendA) > score(aim - bendA) ? [aim + bendA, aim - bendA] : [aim - bendA, aim + bendA];
  const rest = side === 'right' ? 82 : 98;
  return { raise: wrap((upper * 180) / Math.PI - rest), bend: wrap(((fore - upper) * 180) / Math.PI) };
}

// ---------- Character ----------
export interface CharacterProps { config: CharacterConfig; frame: FrameState; width?: number; height?: number }

const ARM_GESTURES = new Set(['wave', 'celebrate', 'shrug', 'think', 'point', 'explain']);

export function Character({ config, frame, width = 1000, height = 1000 }: CharacterProps) {
  const L = LAYOUTS[config.starter] ?? LAYOUTS.kit;
  const h = L.head;
  const f: FaceParams = frame.fromExpression !== undefined && frame.blend !== undefined
    ? mixFaces(FACES[frame.fromExpression] ?? FACES.neutral, FACES[frame.expression] ?? FACES.neutral, frame.blend)
    : FACES[frame.expression] ?? FACES.neutral;
  const lookX = Math.max(-1, Math.min(1, f.lookX + (frame.glance ?? 0) * 0.8));
  const p = frame.gestureProgress;
  const g = frame.gesture;
  const lookDown = g === 'lookDown';
  const energy = f.energy;
  // Speech motion, scaled by the expression's energy: nods on stressed syllables, a little tilt and sway.
  const nod = (frame.nod ?? 0) * energy;
  const headY = (g === 'nod' ? Math.sin(p * 2 * Math.PI) * 12 : 0) + (lookDown ? 6 : 0) + nod + f.slump * 0.6;
  const tilt = f.tilt + (frame.tilt ?? 0) * Math.min(1.3, energy) + (g === 'think' ? 4 : 0);
  const sway = (frame.sway ?? 0) * (0.5 + energy * 0.5);
  // Every arm gesture eases in and out over the first and last 10% of its line.
  const ease = Math.max(0, Math.min(1, p / 0.1, (1 - p) / 0.1));
  const busy = ARM_GESTURES.has(g) ? ease : 0;
  // wave: raise the arm, then swing the forearm by sin(p·4π)·25°
  const lift = g === 'wave' ? ease : 0;
  const waveRaise = -lift * 112;
  const waveBend = g === 'wave' ? -lift * 50 + Math.sin(p * 4 * Math.PI) * 25 : 0;
  // celebrate: both arms up and three little hops; shrug: forearms turn out, palms up
  const cheer = g === 'celebrate' ? ease : 0;
  const shrug = g === 'shrug' ? ease : 0;
  const hop = -Math.abs(Math.sin(p * 3 * Math.PI)) * 30 * cheer;

  // Resting arms: drawn together in front when worried, plus "talking hands" beats on stressed syllables.
  const clasp = Math.max(0, Math.min(1, f.clasp));
  const front = L.shoulderY + L.arm.len * 1.25;
  let left = mixPose(REST_POSE, reach(L, 'left', h.cx - 28, front), clasp);
  let right = mixPose(REST_POSE, reach(L, 'right', h.cx + 28, front), clasp);
  // A beat lifts the forearm up in front of the body (elbow slightly out); the left hand joins in more softly.
  const beat = Math.min(1.2, (frame.beat ?? 0) * energy), talk = (frame.talk ?? 0) * Math.min(1, energy);
  const free = 1 - busy;
  right = { raise: right.raise - (beat * 8 + talk * 3) * free, bend: right.bend + (beat * 55 + talk * 18) * free };
  left = { raise: left.raise + (beat * 5 + talk * 2) * free, bend: left.bend - (beat * 30 + talk * 10) * free };

  // Reaching gestures: hand to chin, pointing out to the side, both hands open while explaining.
  if (g === 'think') right = mixPose(right, reach(L, 'right', h.cx + h.rx * 0.35, h.cy + h.ry * 0.95 + headY), ease);
  if (g === 'point') {
    const sx = h.cx + L.shoulderW - L.arm.w * 0.55;
    right = mixPose(right, reach(L, 'right', sx + L.arm.len * 1.85, L.shoulderY - L.arm.len * 0.55), ease);
  }
  if (g === 'explain') {
    const wob = Math.sin(p * 6 * Math.PI) * 18; // hands bob a little as the point is made
    // Open palms: hands out at chest height, elbows hanging below them.
    left = mixPose(left, reach(L, 'left', h.cx - L.shoulderW - L.arm.len * 0.5, L.shoulderY + L.arm.len * 0.35 - wob, 'down'), ease);
    right = mixPose(right, reach(L, 'right', h.cx + L.shoulderW + L.arm.len * 0.5, L.shoulderY + L.arm.len * 0.35 + wob, 'down'), ease);
  }
  const raiseR = right.raise + waveRaise - cheer * 140 - shrug * 30;
  const bendR = right.bend + waveBend - cheer * 10 - shrug * 75;
  const raiseL = left.raise + cheer * 140 + shrug * 30;
  const bendL = left.bend + cheer * 10 + shrug * 75;

  const blushK = Math.max(0, Math.min(1, f.blush));
  const eyeR = L.eye.r;
  const browY = L.eye.y - eyeR * f.eyeScale - 40 - (config.eyeStyle === 'glasses' ? 22 : 0) - (frame.browLift ?? 0) * 12 * Math.min(1.2, energy);
  const pivotY = h.cy + h.ry * 0.85; // the head tilts about the neck
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width={width} height={height}>
      <g data-part="character" transform={`translate(${n(sway * 0.6)} ${n(frame.bob + hop + f.slump * 0.25)})`}>
        <Body config={config} layout={L} />
        <Arm side="left" layout={L} config={config} raise={raiseL} bend={bendL} />
        <g data-part="head-group" transform={`translate(${n(sway * 0.4)} ${n(headY)}) rotate(${n(tilt)} ${h.cx} ${n(pivotY)})`}>
          <Ears layout={L} skin={config.skin} />
          <ellipse data-part="head" cx={h.cx} cy={h.cy} rx={h.rx} ry={h.ry} fill={config.skin} stroke={INK} strokeWidth={SW} />
          {(L.cheeks || blushK > 0.02) && (
            <g data-part="cheeks">
              <ellipse cx={h.cx - L.eye.dx - 45} cy={L.eye.y + 75} rx={30} ry={18} fill={CHEEK} fillOpacity={n(L.cheeks ? 0.55 + 0.4 * blushK : 0.6 * blushK)} />
              <ellipse cx={h.cx + L.eye.dx + 45} cy={L.eye.y + 75} rx={30} ry={18} fill={CHEEK} fillOpacity={n(L.cheeks ? 0.55 + 0.4 * blushK : 0.6 * blushK)} />
            </g>
          )}
          {L.ears === 'animal' && (
            <g data-part="muzzle">
              <ellipse cx={h.cx} cy={L.mouth.y - 20} rx={95} ry={72} fill="#fde8d0" stroke={INK} strokeWidth={SW} />
              <path data-part="nose" d={`M${h.cx - 22} ${L.mouth.y - 72} Q${h.cx} ${L.mouth.y - 80} ${h.cx + 22} ${L.mouth.y - 72} Q${h.cx} ${L.mouth.y - 40} ${h.cx - 22} ${L.mouth.y - 72} Z`} fill={INK} stroke={INK} strokeWidth={6} strokeLinejoin="round" />
            </g>
          )}
          <Hair style={config.hairStyle} color={config.hairColor} layout={L} />
          <Eye side="left" x={h.cx - L.eye.dx} y={L.eye.y} r={eyeR} style={config.eyeStyle} scale={f.eyeScale} lid={f.lidL} squint={f.squint}
            lookX={lookX} lookY={f.lookY} blink={frame.blink} lookDown={lookDown} skin={config.skin} />
          <Eye side="right" x={h.cx + L.eye.dx} y={L.eye.y} r={eyeR} style={config.eyeStyle} scale={f.eyeScale} lid={f.lidR} squint={f.squint}
            lookX={lookX} lookY={f.lookY} blink={frame.blink} lookDown={lookDown} skin={config.skin} />
          {config.eyeStyle === 'glasses' && <Glasses layout={L} r={eyeR} />}
          <Brow side="left" x={h.cx - L.eye.dx} y={browY} brow={f.browL} />
          <Brow side="right" x={h.cx + L.eye.dx} y={browY} brow={f.browR} />
          <Mouth shape={frame.mouth} mood={f.mouth} x={h.cx} y={L.mouth.y} scale={L.mouth.scale} />
        </g>
        <Arm side="right" layout={L} config={config} raise={raiseR} bend={bendR} />
      </g>
    </svg>
  );
}
