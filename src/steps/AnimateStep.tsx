import { useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent, type RefObject } from 'react';
import { EXPRESSIONS, GESTURES } from '../../shared/types';
import type { ActionMark, AnyCharacter, Expression, FrameState, Marks, Timeline } from '../../shared/types';
import { CharacterView } from '../../shared/character/CharacterView';
import { frameAt } from '../../shared/timeline';
import { addAction, addExpression, marksOf, moveAction, moveExpression, removeAction, removeExpression, resizeAction, resizeExpression } from '../../shared/marks';
import { peaks } from '../waveform';

interface Props {
  character: AnyCharacter;
  timeline: Timeline | null;
  audioUrl: string | null;
  audioRef: RefObject<HTMLAudioElement>; // the preview's audio: the one clock, read for the playhead and set to seek
  onMarks: (edit: (m: Marks) => Marks) => void; // applied to the marks as they are then, so quick edits never undo each other
}

type Action = ActionMark['gesture'];
type Kind = 'expression' | 'action';
type Drag = { kind: Kind | `${Kind}End`; i: number; x: number; ms: number; base: Marks; width: number; moved: boolean };

const ACTIONS = GESTURES.filter((g): g is Action => g !== 'none');
const NAMES: Partial<Record<Action, string>> = { lookDown: 'look down' };
const COLUMNS = 600; // waveform resolution
const STILL: FrameState = { ...frameAt({ durationMs: 0, cues: [], lines: [] }, 0), blink: false, bob: 0, tilt: 0, sway: 0 };

const name = (x: Expression | Action) => NAMES[x as Action] ?? x;
const clock = (ms: number) => `${Math.floor(ms / 60000)}:${((ms / 1000) % 60).toFixed(1).padStart(4, '0')}`;
const pct = (ms: number, total: number) => `${(100 * ms) / total}%`;
const said = (text: string) => text.replace(/\[[^\]]*\]|<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); // words only, no pause or cue tags

/** A palette tile: the user's own character showing that expression, or caught early in that action. */
function Tile({ character, kind, value, onAdd }: { character: AnyCharacter; kind: Kind; value: Expression | Action; onAdd: () => void }) {
  const frame = kind === 'expression' ? { ...STILL, expression: value as Expression } : { ...STILL, gesture: value as Action, gestureProgress: 0.25 };
  return (
    <button className="trigger" draggable aria-label={`Add ${name(value)}`} title={`Drag onto the timeline, or click to add at the playhead`}
      onDragStart={(e) => e.dataTransfer.setData('text/plain', `${kind}:${value}`)} onClick={onAdd}>
      <CharacterView config={character} frame={frame} width={56} height={56} />
      <span>{name(value)}</span>
    </button>
  );
}

export function AnimateStep({ character, timeline, audioUrl, audioRef, onMarks }: Props) {
  const [now, setNow] = useState(0);
  const [wave, setWave] = useState<number[] | null>(null);
  const [selected, setSelected] = useState<{ kind: Kind; i: number } | null>(null);
  const [note, setNote] = useState('');
  const drag = useRef<Drag | null>(null);
  const marks = timeline ? marksOf(timeline) : null;
  const total = timeline?.durationMs ?? 1;

  // The playhead follows the audio clock.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setNow((audioRef.current?.currentTime ?? 0) * 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [audioRef]);

  useEffect(() => {
    setWave(null);
    if (!audioUrl) return;
    let live = true;
    peaks(audioUrl, COLUMNS).then((p) => live && setWave(p), () => {}); // no waveform: the row stays a flat bar
    return () => { live = false; };
  }, [audioUrl]);

  useEffect(() => setSelected(null), [timeline?.lines]); // new audio: the old selection means nothing

  // Moving and stretching: every step starts again from the marks as they were when the drag began.
  useEffect(() => {
    const move = (e: globalThis.PointerEvent) => {
      const d = drag.current;
      if (!d || !timeline) return;
      const dx = e.clientX - d.x;
      if (!d.moved && Math.abs(dx) < 3) return;
      d.moved = true;
      const ms = d.ms + (dx / d.width) * timeline.durationMs;
      const total = timeline.durationMs;
      const next = d.kind === 'expression' ? moveExpression(d.base, d.i, ms, total) : d.kind === 'action' ? moveAction(d.base, d.i, ms, total)
        : d.kind === 'expressionEnd' ? resizeExpression(d.base, d.i, ms, total) : resizeAction(d.base, d.i, ms, total);
      onMarks(() => next);
    };
    const up = (e: globalThis.PointerEvent) => { move(e); drag.current = null; }; // a quick flick may end past its last move
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [timeline, onMarks]);

  const wavePath = useMemo(() => (wave ? wave.map((v, x) => `M${x} ${50 - v * 48}V${50 + v * 48}`).join('') : ''), [wave]);

  if (!timeline || !marks) {
    return (
      <section className="panel">
        <h2>Animate</h2>
        <p className="hint">Add a voiceover first. Then drag expressions and actions onto its timeline here.</p>
      </section>
    );
  }

  const add = (kind: Kind, value: string, ms: number) => {
    setNote('');
    if (kind === 'expression') return onMarks((m) => addExpression(m, ms, value as Expression));
    if (addAction(marks, ms, value as Action, timeline.durationMs)) onMarks((m) => addAction(m, ms, value as Action, timeline.durationMs) ?? m);
    else setNote('No room for an action there: it needs half a second free.');
  };
  const remove = (kind: Kind, i: number) => {
    if (kind === 'expression' && i === 0) return; // the character always has an expression
    onMarks((m) => (kind === 'expression' ? removeExpression(m, i) : removeAction(m, i)));
    setSelected(null);
  };
  const at = () => (audioRef.current?.currentTime ?? 0) * 1000; // the playhead, read straight from the clock
  const msAt = (el: Element, clientX: number) => {
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / (r.width || 1))) * timeline.durationMs;
  };
  const seek = (e: { currentTarget: Element; clientX: number }) => {
    if (audioRef.current) audioRef.current.currentTime = msAt(e.currentTarget, e.clientX) / 1000;
  };
  const drop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const [kind, value] = e.dataTransfer.getData('text/plain').split(':');
    if ((kind === 'expression' && EXPRESSIONS.includes(value as Expression)) || (kind === 'action' && ACTIONS.includes(value as Action))) add(kind, value, msAt(e.currentTarget, e.clientX));
  };
  const lane = { onDragOver: (e: DragEvent) => e.preventDefault(), onDrop: drop, onClick: seek };
  const grab = (kind: Drag['kind'], i: number, ms: number) => (e: PointerEvent<HTMLElement>) => {
    e.stopPropagation();
    if (kind === 'expression' || kind === 'action') setSelected({ kind, i });
    const row = (e.currentTarget.closest('.lane') ?? e.currentTarget).getBoundingClientRect();
    drag.current = { kind, i, x: e.clientX, ms, base: marks, width: row.width || 1, moved: false };
  };
  const isSel = (kind: Kind, i: number) => selected?.kind === kind && selected.i === i;
  const block = (kind: Kind, i: number, startMs: number, endMs: number, label: string) => (
    <div key={`${kind}${i}`} data-mark className={`mark ${kind}${isSel(kind, i) ? ' selected' : ''}`} style={{ left: pct(startMs, total), width: pct(endMs - startMs, total) }}>
      <button className="mark-body" aria-label={`${label} at ${clock(startMs)}`} title={`${label} at ${clock(startMs)}`}
        onPointerDown={grab(kind, i, startMs)} onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(kind, i); } }}>{label}</button>
      {isSel(kind, i) && !(kind === 'expression' && i === 0) && <button className="mark-x" aria-label={`Remove ${label}`} onClick={(e) => { e.stopPropagation(); remove(kind, i); }}>×</button>}
      {!(kind === 'expression' && i === 0) && <span className="mark-grip" data-testid={`end-${kind}-${i}`} title="Drag to change when it ends" aria-hidden onPointerDown={grab(`${kind}End`, i, endMs)} onClick={(e) => e.stopPropagation()} />}
    </div>
  );

  return (
    <>
      <section className="panel palette">
        <h2>Animate</h2>
        <h3>Expressions</h3>
        <div className="triggers">
          {EXPRESSIONS.map((x) => <Tile key={x} character={character} kind="expression" value={x} onAdd={() => add('expression', x, at())} />)}
        </div>
        <h3>Actions</h3>
        <div className="triggers">
          {ACTIONS.map((g) => <Tile key={g} character={character} kind="action" value={g} onAdd={() => add('action', g, at())} />)}
        </div>
        <p className="hint">Drag onto the timeline, or click to add at the playhead.</p>
      </section>
      <section className="panel timeline" data-testid="tracks">
        <div className="timeline-head">
          <span className="clock">{clock(now)} / {clock(timeline.durationMs)}</span>
          {note && <span className="hint">{note}</span>}
        </div>
        <div className="tracks">
          <div className="track"><span className="track-label">Script</span>
            <div className="lane" data-testid="row-script" {...lane}>
              {timeline.lines.map((l, i) => said(l.text) && (
                <span key={i} className="line-span" title={said(l.text)} style={{ left: pct(l.startMs, total), width: pct(l.endMs - l.startMs, total) }}>{said(l.text)}</span>
              ))}
            </div>
          </div>
          <div className="track"><span className="track-label">Audio</span>
            <div className="lane wave" data-testid="row-audio" {...lane}>
              <svg viewBox={`0 0 ${COLUMNS} 100`} preserveAspectRatio="none" aria-hidden>
                {wavePath ? <path d={wavePath} /> : <line x1={0} x2={COLUMNS} y1={50} y2={50} />}
              </svg>
            </div>
          </div>
          <div className="track"><span className="track-label">Expression</span>
            <div className="lane" data-testid="row-expression" {...lane}>
              {marks.expressions.map((m, i) => block('expression', i, m.startMs, m.endMs ?? marks.expressions[i + 1]?.startMs ?? timeline.durationMs, m.expression))}
            </div>
          </div>
          <div className="track"><span className="track-label">Actions</span>
            <div className="lane" data-testid="row-actions" {...lane}>
              {marks.actions.map((a, i) => block('action', i, a.startMs, a.endMs, name(a.gesture)))}
            </div>
          </div>
          <div className="playhead-area" aria-hidden><div className="playhead" style={{ left: pct(Math.min(now, total), total) }} /></div>
        </div>
      </section>
    </>
  );
}
