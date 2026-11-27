import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import { isArt, isVector } from '../shared/types';
import type { AnyCharacter, FrameState, StudioComposition, Timeline } from '../shared/types';
import { StudioFrame } from '../shared/StudioFrame';
import { frameAt } from '../shared/timeline';
import type { FrameSource } from '../shared/vector-avator/stage';

const IDLE: Timeline = { durationMs: 0, cues: [], lines: [] };

export interface PreviewProps {
  character: AnyCharacter;
  timeline: Timeline | null;
  audioUrl: string | null;
  status?: string;
  audioRef?: RefObject<HTMLAudioElement>; // pass one to read or move the clock from outside (the Animate timeline)
  composition?: StudioComposition;
  onComposition?: (composition: StudioComposition) => void;
  aspect?: '16:9' | '9:16' | '1:1' | 'circle';
}

// The <audio> element is the master clock: every animation frame reads its
// currentTime, so the drawing can never drift from the sound. With no audio the
// character idles (blink/bob) on performance.now().
export function Preview({ character, timeline, audioUrl, status, audioRef: shared, composition = { background: { kind: 'transparent' }, placement: { x: .5, bottom: 0, scale: 1, flip: false } }, onComposition, aspect = '16:9' }: PreviewProps) {
  const own = useRef<HTMLAudioElement>(null);
  const audioRef = shared ?? own;
  const [frame, setFrame] = useState<FrameState>(() => frameAt(IDLE, 0));
  // Vector characters also need the clock and the frames before it (their springs replay them after a scrub).
  const [clock, setClock] = useState<{ ms: number; source: FrameSource }>(() => ({ ms: 0, source: (ms) => frameAt(IDLE, ms) }));
  const stageRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<{ x: number; bottom: number } | null>(null);
  const compositionRef = useRef(composition); compositionRef.current = composition;
  const callbackRef = useRef(onComposition); callbackRef.current = onComposition;
  const place = (e: globalThis.PointerEvent) => {
    const r = stageRef.current?.getBoundingClientRect();
    if (!r || !callbackRef.current) return;
    const offset = dragging.current ?? { x: 0, bottom: 0 };
    const current = compositionRef.current;
    callbackRef.current({ ...current, placement: { ...current.placement, x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width - offset.x)), bottom: Math.max(0, Math.min(1, (r.bottom - e.clientY) / r.height - offset.bottom)) } });
  };
  useEffect(() => { const move = (e: globalThis.PointerEvent) => { if (dragging.current) place(e); }; const up = () => { dragging.current = null; }; window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); }; });

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const audio = audioRef.current;
      const idle = frameAt(IDLE, performance.now());
      if (!timeline || !audio) {
        setFrame(idle);
        if (isVector(character)) setClock({ ms: performance.now(), source: (ms) => frameAt(IDLE, ms) });
      } else {
        const ms = audio.currentTime * 1000;
        const f = frameAt(timeline, ms);
        // While playing everything follows the audio (matches export); when paused keep blinking/breathing on the wall clock.
        const idling = audio.paused || audio.ended;
        setFrame(idling ? { ...f, blink: idle.blink, bob: idle.bob } : f);
        if (isVector(character)) setClock(idling ? { ms: performance.now(), source: (t) => ({ ...f, blink: frameAt(IDLE, t).blink, bob: frameAt(IDLE, t).bob }) } : { ms, source: (t) => frameAt(timeline, t) });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [timeline, character]);

  // Warm the browser cache with every pose of an AI character, so the first blink or gesture doesn't flash empty.
  useEffect(() => {
    if (!isArt(character)) return;
    for (const im of Object.values(character.images)) if (im) new Image().src = `/api/characters/${character.id}/${im.file}`;
  }, [character]);

  return (
    <div className="preview">
      <div className="preview-head"><span>Preview</span>{timeline && <span className="ready">Lip sync ready</span>}</div>
      <div ref={stageRef} className={`stage${aspect === '9:16' ? ' portrait' : ''}${aspect === 'circle' ? ' circle' : ''}`} style={{ aspectRatio: aspect === '16:9' ? '16 / 9' : aspect === '9:16' ? '9 / 16' : '1 / 1' }} data-testid="stage" data-starter={isArt(character) ? `art:${character.id}` : isVector(character) ? `vector:${character.id}` : character.starter} onPointerDown={(e: PointerEvent<HTMLDivElement>) => { const r = e.currentTarget.getBoundingClientRect(); dragging.current = { x: (e.clientX - r.left) / r.width - composition.placement.x, bottom: (r.bottom - e.clientY) / r.height - composition.placement.bottom }; place(e.nativeEvent); }}>
        <StudioFrame character={character} frame={frame} width={aspect === '16:9' ? 16 : aspect === '9:16' ? 9 : 1} height={aspect === '16:9' ? 9 : aspect === '9:16' ? 16 : 1} placement={composition.placement} background={composition.background} shape={aspect === 'circle' ? 'circle' : 'rect'}
          picture={composition.background.kind === 'picture' ? `/api/backgrounds/${composition.background.id}` : undefined} clockMs={clock.ms} frameSource={clock.source} />
        {status && <div className="status">{status}</div>}
      </div>
      {audioUrl && <audio ref={audioRef} src={audioUrl} controls />}
    </div>
  );
}
