import { useState } from 'react';
import { EXPRESSIONS, type FrameState } from '../../shared/types';
import { RIG_PROPORTIONS, SVG_RIG_ACTIONS, SVG_RIG_EXPRESSIONS, SVG_RIG_GESTURES, SVG_RIG_MOUTHS, SVG_RIG_VIEWS, type SvgRigCharacter } from '../../shared/svg-rig';
import { RIG_RUNNING_STAGES, type RigJob, type RigModel } from '../../shared/svg-rig-job';
import { CharacterView } from '../../shared/character/CharacterView';
import type * as api from '../api';
import { Icon } from '../Icon';

// The reference-made SVG character UI (version 2 planning/reference-svg-character-plan.md §1): the create form, a job
// card while it is generated, and the character sheet of everything the pack can do, with its per-use controls.
// Plain buttons (type="button"), no <form>: it also renders inside the project character form.

const REST: FrameState = { expression: 'neutral', mouth: 'X', gesture: 'none', gestureProgress: 0, blink: false, bob: 0, timeMs: 0 };
const PROPORTION_LABELS: Record<typeof RIG_PROPORTIONS[number], string> = { torsoWidth: 'Torso width', headScale: 'Head size', armLength: 'Arm length', legLength: 'Leg length' };

export function RigCreateForm({ busy, models, onCreate, onCancel }: { busy: boolean; models: RigModel[]; onCreate: (input: api.CreateRigInput) => void; onCancel: () => void }) {
  const [picked, setPicked] = useState(0);
  const model = models[picked] ?? models[0];
  const [description, setDescription] = useState('');
  const [name, setName] = useState('');
  const [reference, setReference] = useState<File | undefined>();
  const ready = !!model && !!reference && !busy;
  return (
    <div className="create-form">
      <h3>Create from reference (SVG)</h3>
      <p className="hint">Upload a picture of your character. Kitta draws it as SVG parts in six views, with 36 expressions, lip-sync mouths, 24 gestures and 14 body actions, and keeps it in your library.</p>
      {!models.length && <p className="hint">Add ANTHROPIC_API_KEY or OPENAI_API_KEY to .env to create SVG characters.</p>}
      <label className="field"><span>Reference picture</span>
        <input type="file" accept="image/png,image/jpeg,image/webp" aria-label="Reference picture" disabled={busy} onChange={(e) => setReference(e.target.files?.[0])} />
      </label>
      <div className="fields">
        <label className="field"><span>Name</span>
          <input aria-label="Name" maxLength={40} disabled={busy} placeholder="Optional" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        {models.length > 0 && (
          <label className="field"><span>Drawn by</span>
            <select aria-label="Drawn by" disabled={busy} value={picked} onChange={(e) => setPicked(Number(e.target.value))}>
              {models.map((m, i) => <option key={`${m.provider}/${m.model}`} value={i}>{m.label}</option>)}
            </select>
          </label>
        )}
      </div>
      <textarea aria-label="Notes about the character" rows={2} maxLength={400} disabled={busy}
        placeholder="Optional: anything the picture doesn't show, e.g. 'wears sandals, carries nothing'" value={description} onChange={(e) => setDescription(e.target.value)} />
      <p className="hint"><strong>Supported:</strong> people and two-legged animals. It makes about 6–10 model calls in the background (the cost shows on the card as it runs); you can keep working, close Kitta and resume later.</p>
      <div className="line-actions">
        <button type="button" className="btn" disabled={!ready} onClick={() => model && reference && onCreate({ description: description.trim(), name: name.trim(), provider: model.provider, model: model.model, reference })}><Icon name="spark" /> Create SVG character</button>
        <button type="button" className="btn secondary" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

const STEPS = [['design', 'Reading the reference'], ['front', 'Front view (drawn, checked, reviewed)'], ['views', 'Other views'], ['assemble', 'Motion, check and save']] as const;

export function RigJobCard({ job: j, onJob }: { job: RigJob; onJob: (id: string, action: 'cancel' | 'resume' | 'discard') => void }) {
  const live = RIG_RUNNING_STAGES.includes(j.stage);
  const order = STEPS.map(([s]) => s as string);
  const reached = (s: string) => {
    if (s === 'front') return j.viewsDone.includes('front');
    if (s === 'views') return j.viewsPlanned.every((v) => j.viewsDone.includes(v));
    if (s === 'design') return j.viewsDone.length > 0 || order.indexOf(j.stage) > 0;
    return j.hasSheet;
  };
  const pic = (file: string) => `/api/rig-jobs/${j.id}/${file}?v=${encodeURIComponent(j.updatedAt)}`;
  const cost = j.cost >= 0.01 ? `$${j.cost.toFixed(2)}` : j.cost > 0 ? '<$0.01' : '$0';
  return (
    <div className="create-form vector-job" aria-label={`${live ? 'Creating' : 'Stopped:'} ${j.name}`}>
      <h3>{live ? 'Creating' : 'Stopped:'} {j.name} (SVG)</h3>
      <ol className="job-steps">
        {STEPS.map(([s, label]) => (
          <li key={s} className={reached(s) ? 'done' : j.stage === s ? 'active' : ''}>
            {reached(s) ? '✓ ' : j.stage === s ? '… ' : ''}{label}
            {s === 'views' && <span className="hint"> · {j.viewsDone.filter((v) => v !== 'front').length} of {j.viewsPlanned.length - 1}</span>}
          </li>
        ))}
      </ol>
      <div className="job-pictures">
        {j.hasCheck && <a href={pic('check.png')} target="_blank" rel="noreferrer"><img src={pic('check.png')} alt="Front view check" height={120} /></a>}
        {j.hasSheet && <a href={pic('sheet.png')} target="_blank" rel="noreferrer"><img src={pic('sheet.png')} alt="Character sheet" height={120} /></a>}
      </div>
      <p className="hint">{j.message ?? (live ? 'Runs in the background; you can keep working.' : '')} {j.calls} model call{j.calls === 1 ? '' : 's'} ({j.repairs} repair{j.repairs === 1 ? '' : 's'}), {j.input.toLocaleString()} in / {j.output.toLocaleString()} out tokens, {cost}.</p>
      {j.inferred && <p className="hint">Inferred (not in the picture): {j.inferred}</p>}
      <div className="line-actions">
        {live
          ? <button type="button" className="btn secondary" onClick={() => onJob(j.id, 'cancel')}>Cancel</button>
          : <>
            <button type="button" className="btn" onClick={() => onJob(j.id, 'resume')}>Resume</button>
            <button type="button" className="btn secondary" onClick={() => { if (confirm(`Discard ${j.name}?`)) onJob(j.id, 'discard'); }}>Discard</button>
          </>}
      </div>
    </div>
  );
}

/** Everything the character can do, drawn by the real renderer, plus its per-use view, framing and proportions. */
export function RigSheet({ character: c, busy, onChange, onDelete }: { character: SvgRigCharacter; busy: boolean; onChange: (c: SvgRigCharacter) => void; onDelete?: (id: string) => void }) {
  const tile = (key: string, label: string, frame: Partial<FrameState>, patch: Partial<SvgRigCharacter> = {}) => (
    <figure key={key} className="expression" data-testid={`rig-${key}`}>
      <CharacterView config={{ ...c, ...patch }} frame={{ ...REST, ...frame }} width={64} height={64} />
      <figcaption>{label}</figcaption>
    </figure>
  );
  const proportions = c.proportions ?? {};
  return (
    <div>
      <div className="art-head">
        <h3>{c.name}</h3>
        {onDelete && <button type="button" className="mini" disabled={busy} onClick={() => { if (confirm(`Delete ${c.name}?`)) onDelete(c.id); }}>Delete</button>}
      </div>
      <div className="fields">
        <label className="field"><span>View</span>
          <select value={c.view ?? 'front'} onChange={(e) => onChange({ ...c, view: e.target.value as SvgRigCharacter['view'] })}>
            {SVG_RIG_VIEWS.map((v) => <option key={v} value={v}>{v.replace(/-/g, ' ')}</option>)}
          </select>
        </label>
        <label className="field"><span>Framing</span>
          <select value={c.framing ?? 'waist'} onChange={(e) => onChange({ ...c, framing: e.target.value === 'full' ? 'full' : 'waist' })}>
            <option value="waist">Waist-up</option><option value="full">Full body</option>
          </select>
        </label>
        {RIG_PROPORTIONS.map((k) => (
          <label key={k} className="field"><span>{PROPORTION_LABELS[k]} {Math.round((proportions[k] ?? 1) * 100)}%</span>
            <input type="range" min={0.8} max={1.25} step={0.05} value={proportions[k] ?? 1} aria-label={PROPORTION_LABELS[k]}
              onChange={(e) => onChange({ ...c, proportions: { ...proportions, [k]: Number(e.target.value) } })} />
          </label>
        ))}
      </div>
      <h3>Views</h3>
      <div className="expressions">{SVG_RIG_VIEWS.map((v) => tile(`view-${v}`, v.replace(/-/g, ' '), {}, { view: v, framing: 'full' }))}</div>
      <h3>Expressions</h3>
      <p className="hint">All 36 are part of the character. The {EXPRESSIONS.length} with a ● can be picked in Voiceover and Animate today; the rest are ready for later timeline lanes.</p>
      <div className="expressions">{SVG_RIG_EXPRESSIONS.map((x) => tile(`expr-${x}`, `${(EXPRESSIONS as readonly string[]).includes(x) ? '● ' : ''}${x}`, { expression: x as FrameState['expression'] }))}</div>
      <h3>Speech</h3>
      <div className="expressions">{SVG_RIG_MOUTHS.map((m) => tile(`mouth-${m}`, m, { mouth: m }))}</div>
      <h3>Gestures</h3>
      <p className="hint">Animate's wave, nod, shrug, think, point and explain play these; the others are previewable here.</p>
      <div className="expressions">{SVG_RIG_GESTURES.map((g) => tile(`gesture-${g}`, g, { gesture: g, gestureProgress: 0.5 }))}</div>
      <h3>Body actions</h3>
      <div className="expressions">{SVG_RIG_ACTIONS.map((a) => tile(`action-${a}`, a, { gesture: a, gestureProgress: a === 'jump' ? 0.45 : 0.5, gestureDurationMs: 2000 }, { framing: 'full' }))}</div>
    </div>
  );
}
