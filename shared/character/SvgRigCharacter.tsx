import { useEffect, useState } from 'react';
import type { FrameState } from '../types';
import type { RigShape, SvgRigCharacter, SvgRigPack } from '../svg-rig';
import { poseRig, rigViewBox } from '../svg-rig-eval';

// A reference-made SVG character (shared/svg-rig.ts): its parts are drawn as plain SVG from the evaluated pose, so the
// export rasterises the vectors at the final size (no low-resolution intermediate picture).

export interface SvgRigCharacterProps { character: SvgRigCharacter; frame: FrameState; width?: number; height?: number }

const packs = new Map<string, Promise<SvgRigPack>>();
/** The browser loads a library pack once by id; the server attaches it to the character instead. */
export function loadRigPack(id: string): Promise<SvgRigPack> {
  let p = packs.get(id);
  if (!p) {
    p = fetch(`/api/characters/${id}/rig.json`).then(async (res) => {
      if (!res.ok) throw new Error(`rig not found for ${id}`);
      return (await res.json()) as SvgRigPack;
    });
    packs.set(id, p);
    p.catch(() => packs.delete(id));
  }
  return p;
}

function usePack(character: SvgRigCharacter): SvgRigPack | undefined {
  const [loaded, setLoaded] = useState<{ id: string; pack: SvgRigPack }>();
  useEffect(() => {
    if (character.pack) return;
    let live = true;
    loadRigPack(character.id).then((pack) => { if (live) setLoaded({ id: character.id, pack }); }, () => {});
    return () => { live = false; };
  }, [character.id, character.pack]);
  return character.pack ?? (loaded?.id === character.id ? loaded.pack : undefined);
}

function Shape({ s }: { s: RigShape }) {
  const paint = { fill: s.fill, stroke: s.stroke, strokeWidth: s.strokeWidth, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  if (s.kind === 'ellipse') return <ellipse cx={s.x ?? 0} cy={s.y ?? 0} rx={s.rx} ry={s.ry} {...paint} />;
  if (s.kind === 'rect') return <rect x={s.x ?? 0} y={s.y ?? 0} width={s.width} height={s.height} rx={s.rx} ry={s.ry} {...paint} />;
  return <path d={s.d} {...paint} />;
}

const fmt = (n: number) => Number(n.toFixed(3));

/** Draws the character for one frame; a character carrying its `pack` (server, tests, sheets) draws without fetching. */
export function SvgRigCharacterView({ character, frame, width = 1000, height = 1000 }: SvgRigCharacterProps) {
  const pack = usePack(character);
  const view = pack && (pack.views[character.view ?? 'front'] ?? pack.views.front);
  const box = view ? rigViewBox(view, character.framing) : [0, 0, 1000, 1000];
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={box.map(fmt).join(' ')} width={width} height={height} data-character="svg-rig">
      {pack && poseRig(pack, character, frame).map((p) => (
        <g key={p.id} data-part={p.id} transform={`matrix(${p.matrix.map(fmt).join(' ')})`}>
          {p.shapeScale[0] !== 1 || p.shapeScale[1] !== 1
            ? <g transform={`scale(${fmt(p.shapeScale[0])} ${fmt(p.shapeScale[1])})`}>{p.shapes.map((s, i) => <Shape key={i} s={s} />)}</g>
            : p.shapes.map((s, i) => <Shape key={i} s={s} />)}
        </g>
      ))}
    </svg>
  );
}
