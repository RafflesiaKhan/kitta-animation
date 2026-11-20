import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FrameState, VectorCharacter } from '../types';
import { VectorStage, type FrameSource } from '../vector-avator/stage';
import { prepareVector, type LoadedVector, type VectorDoc } from '../vector-avator/renderers/vector/vdata';

// A vector-avator character. The export draws it on the server with @napi-rs/canvas and passes the finished picture
// as a data URI (`picture`), so this component stays pure SVG there. In the browser there is no picture: the same
// renderer draws into a canvas shown inside the SVG, so the preview and the export run the same code.

export interface VectorCharacterProps {
  character: VectorCharacter;
  frame: FrameState;
  /** The actor's idle clock in ms (scene time + idleOffsetMs); drives the idle motion and springs. */
  clockMs?: number;
  /** The actor's frame at any idle-clock time; lets a scrub replay the real motion before the playhead. Absent: the current frame is held. */
  frameSource?: FrameSource;
  /** Export: the drawn picture as a data URI. */
  picture?: string;
  width?: number;
  height?: number;
  /** Browser tiles only: `face` shows the head close up (the export always draws the body). */
  framing?: 'body' | 'face';
}

const docs = new Map<string, Promise<LoadedVector>>();
const loadDoc = (id: string): Promise<LoadedVector> => {
  let doc = docs.get(id);
  if (!doc) {
    doc = fetch(`/api/characters/${id}/vector.json`).then(async (res) => {
      if (!res.ok) throw new Error(`vector data not found for ${id}`);
      return prepareVector((await res.json()) as VectorDoc);
    });
    docs.set(id, doc);
    doc.catch(() => docs.delete(id));
  }
  return doc;
};

/** Same picture size as the export, except for small tiles. */
const stageSize = (width: number) => (width >= 300 ? 1024 : 256);

export function VectorCharacterView({ character, frame, clockMs = 0, frameSource, picture, width = 1000, height = 1000, framing = 'body' }: VectorCharacterProps) {
  const svg = (inner: JSX.Element) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width={width} height={height}>{inner}</svg>;
  if (picture !== undefined) return svg(<image data-part="vector" href={picture} x={0} y={0} width={1000} height={1000} />);
  return svg(
    <foreignObject x={0} y={0} width={1000} height={1000}>
      <LiveVector id={character.id} frame={frame} clockMs={clockMs} source={frameSource} size={stageSize(width)} framing={framing} />
    </foreignObject>,
  );
}

function LiveVector({ id, frame, clockMs, source, size, framing }: { id: string; frame: FrameState; clockMs: number; source?: FrameSource; size: number; framing: 'body' | 'face' }) {
  const host = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<VectorStage | null>(null);
  const drawn = useRef('');
  useEffect(() => {
    let live = true;
    loadDoc(id).then((lv) => { if (live) setStage(new VectorStage(lv, size, undefined, framing)); }, () => {});
    return () => { live = false; };
  }, [id, size, framing]);
  useLayoutEffect(() => {
    if (!stage || !host.current) return;
    const cv = stage.canvas;
    if (cv.parentElement !== host.current) {
      drawn.current = '';
      cv.style.width = '100%';
      cv.style.height = '100%';
      cv.style.display = 'block';
      host.current.replaceChildren(cv);
    }
    const key = `${clockMs}|${JSON.stringify(frame)}`;
    if (drawn.current === key && cv.parentElement === host.current) return; // paused: nothing moved
    drawn.current = key;
    stage.draw(source ?? (() => frame), clockMs);
  });
  return <div ref={host} style={{ width: '100%', height: '100%' }} />;
}
