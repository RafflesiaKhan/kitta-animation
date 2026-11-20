import { useEffect, useState } from 'react';
import { EXPRESSIONS, GESTURES, type Expression, type FrameState, type Gesture, type MouthShape, type VectorCharacter } from '../../shared/types';
import type { VectorJob } from '../../shared/vector-job';
import { CharacterView } from '../../shared/character/CharacterView';
import { EXPRESSION_MAP } from '../../shared/vector-avator/kitta';
import * as api from '../api';

// What a vector character is and can do: how it was made (pictures, model, cost), its expressions, talking, and
// actions, all drawn by the live renderer so they look exactly as in a scene.

const REST: FrameState = { expression: 'neutral', mouth: 'X', gesture: 'none', gestureProgress: 0, blink: false, bob: 0 };
const DRAW_NAMES = { anthropic: 'Claude', openai: 'OpenAI' } as const;
const FACES = { neutral: 'neutral', smile: 'smile', surprised: 'surprised', troubled: 'troubled' } as const;
const TALK: MouthShape[] = ['D', 'E', 'B', 'F', 'C', 'X'];
const GESTURE_MS = 2600;

/** What each of Kitta's expressions shows on a vector character (it has 4 drawn faces). */
export function expressionNote(x: Expression): string {
  if (x === 'wink') return 'smile, one eye shut';
  if (x === 'sleepy') return 'neutral, half-closed eyes';
  const face = FACES[EXPRESSION_MAP[x]];
  return face === x ? 'drawn face' : `shows ${face}`;
}

const GESTURE_NOTES: Partial<Record<Gesture, string>> = {
  shrug: 'spreads both hands', celebrate: 'spreads both hands (same as shrug)', lookDown: 'tilts the head down', nod: 'nods',
};

/** A clock in ms that runs while `on` (one animation frame at a time). */
function useClock(on: boolean): number {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!on) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => { setT(now - start); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on]);
  return t;
}

function TalkingTile({ c }: { c: VectorCharacter }) {
  const t = useClock(true);
  const frame: FrameState = { ...REST, mouth: TALK[Math.floor(t / 180) % TALK.length], blink: t % 3000 < 150 };
  return (
    <figure className="expression">
      <CharacterView config={c} frame={frame} clockMs={t} width={120} height={120} framing="face" />
      <figcaption>talking</figcaption>
    </figure>
  );
}

/** Shows the middle of the gesture; plays it on a loop while hovered or focused. */
function GestureTile({ c, g }: { c: VectorCharacter; g: Gesture }) {
  const [on, setOn] = useState(false);
  const t = useClock(on);
  const frame: FrameState = { ...REST, gesture: g, gestureProgress: on ? (t % GESTURE_MS) / GESTURE_MS : 0.5 };
  return (
    <figure className="expression" tabIndex={0} title="Hover to play" onMouseEnter={() => setOn(true)} onMouseLeave={() => setOn(false)} onFocus={() => setOn(true)} onBlur={() => setOn(false)}>
      <CharacterView config={c} frame={frame} clockMs={t} width={120} height={120} />
      <figcaption>{g}{GESTURE_NOTES[g] && <span className="hint"><br />{GESTURE_NOTES[g]}</span>}</figcaption>
    </figure>
  );
}

export function VectorSheet({ character: c, busy, onDelete }: { character: VectorCharacter; busy: boolean; onDelete?: (id: string) => void }) {
  const [job, setJob] = useState<VectorJob | null>(null);
  const [parts, setParts] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    setJob(null);
    setParts(null);
    api.getVectorJob(c.id).then((j) => { if (live) setJob(j); }, () => {}); // the bundled sample has no job
    fetch(`/api/characters/${c.id}/vector.json`).then((r) => r.json()).then((d: { parts?: unknown[] }) => { if (live) setParts(d.parts?.length ?? null); }, () => {});
    return () => { live = false; };
  }, [c.id]);
  const pic = (file: string) => `/api/vector-jobs/${c.id}/${file}`;
  const made = job && job.stage === 'done';
  return (
    <div className="vector-sheet">
      <div className="art-head">
        <h3>{c.name}</h3>
        {onDelete && <button className="mini" disabled={busy} onClick={() => { if (confirm(`Remove ${c.name}?`)) onDelete(c.id); }}>Remove</button>}
      </div>
      <p className="hint">
        A vector character: drawn live from {parts ?? 'its'} parts on a skeleton, so its arms bend, its head moves and it lip-syncs smoothly.
        {made && <> Drawn by {DRAW_NAMES[job.drawProvider]}{job.drawModel ? ` (${job.drawModel})` : ''} on {new Date(job.updatedAt).toLocaleDateString()} · cost ${job.cost.toFixed(2)}{job.errors ? ` · ${job.errors} check errors left` : ''}.</>}
        {!job && ' The bundled sample, for trying things out.'}
      </p>
      {made && (
        <>
          <h3>How it was made</h3>
          <p className="hint">The front picture and face sheet it was drawn from, and the final check picture (click to open).</p>
          <div className="job-pictures">
            {job.hasFront && <a href={pic('front.png')} target="_blank" rel="noreferrer"><img src={pic('front.png')} alt="Front picture" /></a>}
            {job.hasFace && <a href={pic('sheet_face.png')} target="_blank" rel="noreferrer"><img src={pic('sheet_face.png')} alt="Face sheet" /></a>}
            {job.hasCheck && <a href={pic('check.png')} target="_blank" rel="noreferrer"><img src={pic('check.png')} alt="Final check picture" /></a>}
          </div>
        </>
      )}
      <h3>Expressions</h3>
      <p className="hint">It has 4 drawn faces (neutral, smile, surprised, troubled); Kitta's 11 expressions use them as noted.</p>
      <div className="expressions">
        {EXPRESSIONS.map((x) => (
          <figure key={x} className="expression">
            <CharacterView config={c} frame={{ ...REST, expression: x }} width={120} height={120} framing="face" />
            <figcaption>{x}<span className="hint"><br />{expressionNote(x)}</span></figcaption>
          </figure>
        ))}
      </div>
      <h3>Talking</h3>
      <p className="hint">Lip sync uses 5 mouth shapes (a, i, u, e, o) and a closed mouth; it blinks and breathes on its own.</p>
      <div className="expressions"><TalkingTile c={c} /></div>
      <h3>Actions</h3>
      <p className="hint">Hover over one to play it. Shown while a line's gesture plays.</p>
      <div className="expressions">{GESTURES.filter((g) => g !== 'none').map((g) => <GestureTile key={g} c={c} g={g} />)}</div>
    </div>
  );
}
