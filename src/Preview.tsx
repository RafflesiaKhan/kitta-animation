import { useEffect, useRef, useState } from 'react';
import type { CharacterConfig, FrameState, Timeline } from '../shared/types';
import { Character } from '../shared/character/Character';
import { frameAt } from '../shared/timeline';

const IDLE: Timeline = { durationMs: 0, cues: [], lines: [] };

export interface PreviewProps {
  character: CharacterConfig;
  timeline: Timeline | null;
  audioUrl: string | null;
  status?: string;
}

// The <audio> element is the master clock: every animation frame reads its
// currentTime, so the drawing can never drift from the sound. With no audio the
// character idles (blink/bob) on performance.now().
export function Preview({ character, timeline, audioUrl, status }: PreviewProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [frame, setFrame] = useState<FrameState>(() => frameAt(IDLE, 0));

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const audio = audioRef.current;
      const idle = frameAt(IDLE, performance.now());
      if (!timeline || !audio) setFrame(idle);
      else {
        const f = frameAt(timeline, audio.currentTime * 1000);
        // While playing everything follows the audio (matches export); when paused keep blinking/breathing on the wall clock.
        setFrame(audio.paused || audio.ended ? { ...f, blink: idle.blink, bob: idle.bob } : f);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [timeline]);

  return (
    <div className="preview">
      <div className="stage" data-testid="stage" data-starter={character.starter}>
        <Character config={character} frame={frame} width={420} height={420} />
        {status && <div className="status">{status}</div>}
      </div>
      {audioUrl && <audio ref={audioRef} src={audioUrl} controls />}
    </div>
  );
}
