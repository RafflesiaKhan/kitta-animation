import { useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent, type RefObject } from 'react';
import { EXPRESSIONS, isVector } from '../../shared/types';
import type { ActionMark, AnyCharacter, Expression, FrameState, Marks, Timeline } from '../../shared/types';
import { actionsForLibrary, LEGACY_ACTION_IDS, parseActions, replaceActions, type Action as LibraryAction } from '../../shared/actions';
import { CharacterView } from '../../shared/character/CharacterView';
import { frameAt } from '../../shared/timeline';
import { addAction, addExpression, marksOf, moveAction, moveExpression, removeAction, removeExpression, resizeAction, resizeExpression } from '../../shared/marks';
import { Icon } from '../Icon';
import { peaks } from '../waveform';

interface Props {
  character: AnyCharacter;
  timeline: Timeline | null;
  audioUrl: string | null;
  audioRef: RefObject<HTMLAudioElement>; // the preview's audio: the one clock, read for the playhead and set to seek
  onMarks: (edit: (m: Marks) => Marks) => void; // applied to the marks as they are then, so quick edits never undo each other
}

type ActionId = ActionMark['gesture'];
type Kind = 'expression' | 'action';
type Drag = { kind: Kind | `${Kind}End`; i: number; x: number; ms: number; base: Marks; width: number; moved: boolean };

const COLUMNS = 600; // waveform resolution
const STILL: FrameState = { ...frameAt({ durationMs: 0, cues: [], lines: [] }, 0), blink: false, bob: 0, tilt: 0, sway: 0 };

const name = (x: Expression | ActionId, actions: LibraryAction[] = actionsForLibrary()) => actions.find((a) => a.name === x)?.label ?? x;
const clock = (ms: number) => `${Math.floor(ms / 60000)}:${((ms / 1000) % 60).toFixed(1).padStart(4, '0')}`;
const pct = (ms: number, total: number) => `${(100 * ms) / total}%`;
const said = (text: string) => text.replace(/\[[^\]]*\]|<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); // words only, no pause or cue tags

/** A palette tile: the user's own character showing that expression, or caught early in that action. */
export function Tile({ character, kind, value, label, disabled, reason, onAdd }: { character: AnyCharacter; kind: Kind; value: Expression | ActionId; label?: string; disabled?: boolean; reason?: string; onAdd?: () => void }) {
  const frame = kind === 'expression' ? { ...STILL, expression: value as Expression } : { ...STILL, gesture: value as ActionId, gestureProgress: 0.25 };
  if (!onAdd) return <figure className="expression">
    <CharacterView config={character} frame={frame} width={56} height={56} />
    <figcaption>{label ?? name(value)}</figcaption>
  </figure>;
  return (
    <button className="trigger" disabled={disabled} draggable={!disabled} aria-label={`Add ${label ?? name(value)}`} title={reason ?? `Drag onto the timeline, or click to add at the playhead`}
      onDragStart={(e) => e.dataTransfer.setData('text/plain', `${kind}:${value}`)} onClick={onAdd}>
      <CharacterView config={character} frame={frame} width={56} height={56} />
      <span>{label ?? name(value)}</span>
    </button>
  );
}

export function AnimateStep({ character, timeline, audioUrl, audioRef, onMarks }: Props) {
  const [now, setNow] = useState(0);
  const [wave, setWave] = useState<number[] | null>(null);
  const [selected, setSelected] = useState<{ kind: Kind; i: number } | null>(null);
  const [note, setNote] = useState('');
  const [library, setLibrary] = useState<LibraryAction[]>(actionsForLibrary());
  const drag = useRef<Drag | null>(null);
  const marks = timeline ? marksOf(timeline) : null;
  const total = timeline?.durationMs ?? 1;
  useEffect(() => {
    fetch('/api/actions').then((response) => response.ok ? response.json() : Promise.reject()).then((body: { actions?: unknown[]; errors?: string[] }) => {
      const actions = parseActions(body.actions ?? []);
      replaceActions(actions);
      setLibrary(actionsForLibrary());
      if (body.errors?.length) setNote(body.errors.join(' '));
    }).catch(() => {});
  }, []);
  const paletteActions = isVector(character) ? library.filter((a) => a.name !== 'none') : library.filter((a) => LEGACY_ACTION_IDS.includes(a.name as typeof LEGACY_ACTION_IDS[number]));

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
        <p className="eyebrow">Step 3</p>
        <h2>Animate</h2>
        <p className="hint">Add a voiceover first. Then drag expressions and actions onto its timeline here.</p>
      </section>
    );
  }

  const add = (kind: Kind, value: string, ms: number) => {
    setNote('');
    if (kind === 'expression') return onMarks((m) => addExpression(m, ms, value as Expression));
    if (addAction(marks, ms, value as ActionId, timeline.durationMs)) onMarks((m) => addAction(m, ms, value as ActionId, timeline.durationMs) ?? m);
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
    if ((kind === 'expression' && EXPRESSIONS.includes(value as Expression)) || (kind === 'action' && paletteActions.some((a) => a.name === value))) add(kind, value, msAt(e.currentTarget, e.clientX));
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
      {isSel(kind, i) && !(kind === 'expression' && i === 0) && <button className="mark-x" aria-label={`Remove ${label}`} onClick={(e) => { e.stopPropagation(); remove(kind, i); }}><Icon name="close" size={12} /></button>}
      {!(kind === 'expression' && i === 0) && <span className="mark-grip" data-testid={`end-${kind}-${i}`} title="Drag to change when it ends" aria-hidden onPointerDown={grab(`${kind}End`, i, endMs)} onClick={(e) => e.stopPropagation()} />}
    </div>
  );

  return (
    <>
      <section className="panel palette">
        <p className="eyebrow">Step 3</p>
        <h2>Animate</h2>
        <h3>Expressions</h3>
        <div className="triggers">
          {EXPRESSIONS.map((x) => <Tile key={x} character={character} kind="expression" value={x} label={x} onAdd={() => add('expression', x, at())} />)}
        </div>
        <h3>Actions</h3>
        <div className="triggers">
          {paletteActions.map((a) => {
            const capabilities = isVector(character) ? new Set(character.capabilities ?? []) : new Set<string>();
            const missing = a.needs.filter((need) => !capabilities.has(need));
            const reason = missing.length ? `Needs ${missing.join(', ')}, which this character does not have` : undefined;
            return <Tile key={a.name} character={character} kind="action" value={a.name} label={a.label} disabled={!!reason} reason={reason} onAdd={() => !reason && add('action', a.name, at())} />;
          })}
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
