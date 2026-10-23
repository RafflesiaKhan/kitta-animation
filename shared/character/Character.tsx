import type { ReactElement } from 'react';
import type { CharacterConfig, Expression, FrameState, StarterId } from '../types';
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
function Eye({ side, x, y, r, style, expression, blink, lookDown, skin }: {
  side: 'left' | 'right'; x: number; y: number; r: number; style: string; expression: Expression; blink: boolean; lookDown: boolean; skin: string;
}) {
  const R = expression === 'surprised' ? r * 1.2 : r;
  const py = y + (lookDown ? 8 : 0);
  const dot = style === 'dot';
  let eye: ReactElement;
  if (blink) {
    eye = <path d={`M${n(x - R)} ${n(y)} Q${n(x)} ${n(y + R * 0.6)} ${n(x + R)} ${n(y)}`} fill="none" stroke={INK} strokeWidth={SW + 2} strokeLinecap="round" />;
  } else {
    const pr = dot ? R * 0.55 : R * 0.48;
    eye = (
      <g>
        {!dot && <ellipse cx={x} cy={y} rx={n(R)} ry={n(R * 1.15)} fill="#ffffff" stroke={INK} strokeWidth={SW} />}
        <ellipse data-part="pupil" cx={x} cy={n(dot ? y + (lookDown ? 8 : 0) : py + R * 0.15)} rx={n(pr)} ry={n(dot ? pr * 1.3 : pr)} fill={INK} />
        <circle cx={n(x + pr * 0.35)} cy={n((dot ? py : py + R * 0.15) - pr * 0.4)} r={n(pr * 0.3)} fill="#ffffff" />
        {expression === 'happy' && (
          <g>
            <path d={`M${n(x - R - 8)} ${n(y + R * 1.4)} L${n(x - R - 8)} ${n(y + R * 0.45)} Q${n(x)} ${n(y - R * 0.25)} ${n(x + R + 8)} ${n(y + R * 0.45)} L${n(x + R + 8)} ${n(y + R * 1.4)} Z`} fill={skin} />
            <path d={`M${n(x - R - 4)} ${n(y + R * 0.47)} Q${n(x)} ${n(y - R * 0.2)} ${n(x + R + 4)} ${n(y + R * 0.47)}`} fill="none" stroke={INK} strokeWidth={SW} strokeLinecap="round" />
          </g>
        )}
      </g>
    );
  }
  return <g data-part={`eye-${side}`}>{eye}</g>;
}

const BROWS: Record<Expression, { raise: number; inner: number; outer: number; arch: number }> = {
  neutral: { raise: 0, inner: 0, outer: 0, arch: 6 },
  happy: { raise: 10, inner: 0, outer: 2, arch: 12 },
  sad: { raise: 0, inner: -18, outer: 8, arch: 0 },
  angry: { raise: -8, inner: 18, outer: -10, arch: 0 },
  surprised: { raise: 26, inner: 0, outer: 0, arch: 14 },
};

function Brow({ side, x, y, expression }: { side: 'left' | 'right'; x: number; y: number; expression: Expression }) {
  const b = BROWS[expression];
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
function Mouth({ frame, x, y, scale }: { frame: FrameState; x: number; y: number; scale: number }) {
  const d = mouthPath(frame.mouth, frame.expression);
  const det = mouthDetail(frame.mouth, frame.expression);
  // Same id ⇔ same local geometry, so duplicate ids across several characters on one page are harmless.
  const clipId = `kitta-mouth-${frame.mouth}-${frame.expression}`;
  return (
    <g data-part="mouth" transform={`translate(${n(x)} ${n(y)}) scale(${scale})`}>
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

// ---------- Character ----------
export interface CharacterProps { config: CharacterConfig; frame: FrameState; width?: number; height?: number }

export function Character({ config, frame, width = 1000, height = 1000 }: CharacterProps) {
  const L = LAYOUTS[config.starter] ?? LAYOUTS.kit;
  const h = L.head;
  const p = frame.gestureProgress;
  const lookDown = frame.gesture === 'lookDown';
  const headY = (frame.gesture === 'nod' ? Math.sin(p * 2 * Math.PI) * 12 : 0) + (lookDown ? 6 : 0);
  // wave: raise the arm (eased in/out over the first/last 10%), then swing the forearm by sin(p·4π)·25°
  const lift = frame.gesture === 'wave' ? Math.max(0, Math.min(1, p / 0.1, (1 - p) / 0.1)) : 0;
  const waveRaise = -lift * 112;
  const waveBend = frame.gesture === 'wave' ? -lift * 50 + Math.sin(p * 4 * Math.PI) * 25 : 0;
  const eyeR = L.eye.r;
  const browY = L.eye.y - eyeR * (frame.expression === 'surprised' ? 1.2 : 1) - 40 - (config.eyeStyle === 'glasses' ? 22 : 0);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width={width} height={height}>
      <g data-part="character" transform={`translate(0 ${n(frame.bob)})`}>
        <Body config={config} layout={L} />
        <Arm side="left" layout={L} config={config} raise={0} bend={0} />
        <g data-part="head-group" transform={`translate(0 ${n(headY)})`}>
          <Ears layout={L} skin={config.skin} />
          <ellipse data-part="head" cx={h.cx} cy={h.cy} rx={h.rx} ry={h.ry} fill={config.skin} stroke={INK} strokeWidth={SW} />
          {L.cheeks && (
            <g data-part="cheeks">
              <ellipse cx={h.cx - L.eye.dx - 45} cy={L.eye.y + 75} rx={30} ry={18} fill={CHEEK} fillOpacity={0.55} />
              <ellipse cx={h.cx + L.eye.dx + 45} cy={L.eye.y + 75} rx={30} ry={18} fill={CHEEK} fillOpacity={0.55} />
            </g>
          )}
          {L.ears === 'animal' && (
            <g data-part="muzzle">
              <ellipse cx={h.cx} cy={L.mouth.y - 20} rx={95} ry={72} fill="#fde8d0" stroke={INK} strokeWidth={SW} />
              <path data-part="nose" d={`M${h.cx - 22} ${L.mouth.y - 72} Q${h.cx} ${L.mouth.y - 80} ${h.cx + 22} ${L.mouth.y - 72} Q${h.cx} ${L.mouth.y - 40} ${h.cx - 22} ${L.mouth.y - 72} Z`} fill={INK} stroke={INK} strokeWidth={6} strokeLinejoin="round" />
            </g>
          )}
          <Hair style={config.hairStyle} color={config.hairColor} layout={L} />
          <Eye side="left" x={h.cx - L.eye.dx} y={L.eye.y} r={eyeR} style={config.eyeStyle} expression={frame.expression} blink={frame.blink} lookDown={lookDown} skin={config.skin} />
          <Eye side="right" x={h.cx + L.eye.dx} y={L.eye.y} r={eyeR} style={config.eyeStyle} expression={frame.expression} blink={frame.blink} lookDown={lookDown} skin={config.skin} />
          {config.eyeStyle === 'glasses' && <Glasses layout={L} r={eyeR} />}
          <Brow side="left" x={h.cx - L.eye.dx} y={browY} expression={frame.expression} />
          <Brow side="right" x={h.cx + L.eye.dx} y={browY} expression={frame.expression} />
          <Mouth frame={frame} x={h.cx} y={L.mouth.y} scale={L.mouth.scale} />
        </g>
        <Arm side="right" layout={L} config={config} raise={waveRaise} bend={waveBend} />
      </g>
    </svg>
  );
}
