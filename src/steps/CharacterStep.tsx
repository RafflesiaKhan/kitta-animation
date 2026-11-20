import { useEffect, useState, type MouseEvent } from 'react';
import { ART_ACTIONS, EXPRESSIONS, GESTURES, isArt, isVector } from '../../shared/types';
import type { AnyCharacter, ArtCharacter, ArtPose, CharacterConfig, FrameState, ImageProvider, StarterId, VectorCharacter } from '../../shared/types';
import { CharacterView } from '../../shared/character/CharacterView';
import { Character } from '../../shared/character/Character';
import { OPTIONS, STARTERS } from '../../shared/character/starters';
import { ART_STYLES } from '../../shared/character/art';
import * as api from '../api';
import { Icon } from '../Icon';
import type { ProjectStyle } from '../../shared/projects';
import { RUNNING_STAGES, type VectorJob } from '../../shared/vector-job';
import { Tile } from './AnimateStep';
import { VectorSheet } from './VectorSheet';

const REST: FrameState = { expression: 'neutral', mouth: 'X', gesture: 'none', gestureProgress: 0, blink: false, bob: 0 };
const NEEDS_KEY = 'Needs GEMINI_API_KEY or OPENAI_API_KEY';
const PROVIDER_NAMES: Record<ImageProvider, string> = { gemini: 'Gemini', openai: 'OpenAI' };

interface Props {
  character?: AnyCharacter;
  projectStyle?: ProjectStyle;
  onChange: (c: AnyCharacter) => void;
  library: ArtCharacter[];
  vectors?: VectorCharacter[]; // saved vector-avator characters
  onImportVector?: () => void; // adds the bundled sample
  onDeleteVector?: (id: string) => void;
  imageProviders?: ImageProvider[]; // image providers with a key on the server
  busy?: boolean;
  error?: string | null;
  onCreate?: (input: api.CreateCharacterInput) => void;
  onDraw?: (id: string, poses: ArtPose[]) => void;
  onFindMouths?: (id: string) => void;
  onSetMouth?: (id: string, x: number, y: number) => void;
  onDelete?: (id: string) => void;
  // Vector characters created in the background (server/vector-create.ts).
  vectorJobs?: VectorJob[];
  vectorDraw?: boolean; // the drawing model has a key on the server
  vectorDrawBy?: 'anthropic' | 'openai';
  onCreateVector?: (input: api.CreateVectorInput) => void;
  onJob?: (id: string, action: 'cancel' | 'resume' | 'discard') => void;
}

const DRAW_NAMES = { anthropic: 'Claude', openai: 'OpenAI' } as const;

const imgUrl = (c: ArtCharacter, pose: ArtPose) => {
  const im = c.images[pose];
  return im ? `/api/characters/${c.id}/${im.file}` : null;
};

export function CharacterStep({ character, onChange, library, vectors = [], onImportVector, onDeleteVector, projectStyle, imageProviders = [], busy = false, error = null, onCreate, onDraw, onFindMouths, onSetMouth, onDelete, vectorJobs = [], vectorDraw = false, vectorDrawBy = 'openai', onCreateVector, onJob }: Props) {
  const [creating, setCreating] = useState(false);
  const aiOk = imageProviders.length > 0;
  // A finished creation selects the new character; leave the form then.
  useEffect(() => { if (character && isArt(character)) setCreating(false); }, [character && isArt(character) ? character.id : null]);
  // A started vector job shows as a card below; leave the form then too.
  useEffect(() => { if (vectorJobs.length) setCreating(false); }, [vectorJobs[0]?.id]);

  const pickStarter = (id: StarterId) => {
    const { name: _name, ...config } = STARTERS[id];
    setCreating(false);
    onChange(config);
  };
  const selected = (c: ArtCharacter) => !creating && !!character && isArt(character) && character.id === c.id;
  return (
    <div>
      {!projectStyle && <p className="eyebrow">Step 1</p>}
      <h2>Pick a character</h2>
      <div className="tiles">
        {projectStyle !== 'ai' && (Object.keys(STARTERS) as StarterId[]).map((id) => {
          const on = !creating && !!character && !isArt(character) && !isVector(character) && character.starter === id;
          return (
            <button type="button" key={id} className={`tile${on ? ' selected' : ''}`} aria-pressed={on} onClick={() => pickStarter(id)}>
              <Character config={STARTERS[id]} frame={REST} width={84} height={84} />
              <span>{STARTERS[id].name}</span>
            </button>
          );
        })}
        {projectStyle !== 'svg' && library.map((c) => (
          <button type="button" key={c.id} className={`tile${selected(c) ? ' selected' : ''}`} aria-pressed={selected(c)} onClick={() => { setCreating(false); onChange(c); }}>
            <img src={imgUrl(c, 'neutral') ?? ''} alt="" width={84} height={84} />
            <span>{c.name}</span>
          </button>
        ))}
        {!projectStyle && vectors.map((c) => {
          const on = !creating && !!character && isVector(character) && character.id === c.id;
          return (
            <button type="button" key={c.id} className={`tile${on ? ' selected' : ''}`} aria-pressed={on} onClick={() => { setCreating(false); onChange(c); }}>
              <CharacterView config={c} frame={REST} width={84} height={84} />
              <span>{c.name}</span>
            </button>
          );
        })}
        {!projectStyle && onImportVector && !vectors.length && <button type="button" className="tile create" onClick={onImportVector}>
          <span className="plus"><Icon name="plus" size={22} /></span>
          <span>Add vector sample</span>
        </button>}
        {!projectStyle && onCreate && <button className={`tile create${creating ? ' selected' : ''}`} aria-pressed={creating} onClick={() => setCreating(true)}>
          <span className="plus"><Icon name="plus" size={22} /></span>
          <span>Create with AI</span>
        </button>}
      </div>
      {!projectStyle && onJob && vectorJobs.map((j) => <VectorJobCard key={j.id} job={j} onJob={onJob} />)}
      {creating && onCreate
        ? <CreateForm busy={busy} providers={imageProviders} onCreate={onCreate} onCancel={() => setCreating(false)}
          vectorDraw={vectorDraw} vectorDrawBy={vectorDrawBy} onCreateVector={onCreateVector} />
        : character && (isVector(character)
          ? !projectStyle && <VectorSheet character={character} busy={busy} onDelete={onDeleteVector} />
          : isArt(character)
          ? !projectStyle && onDraw && onFindMouths && onSetMouth && onDelete && <ArtSheet character={character} busy={busy} geminiOk={aiOk} onDraw={onDraw} onFindMouths={onFindMouths} onSetMouth={onSetMouth} onDelete={onDelete} />
          : <Customize character={character} onChange={onChange} showExpressions={!projectStyle} />)}
      {projectStyle && character && <>
        <h3>Expressions</h3>
        <div className="expressions">{EXPRESSIONS.map(value => <Tile key={value} character={character} kind="expression" value={value} />)}</div>
        <h3>Actions</h3>
        <div className="expressions">{GESTURES.filter(value => value !== 'none').map(value => <Tile key={value} character={character} kind="action" value={value} />)}</div>
      </>}
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  );
}

function CreateForm({ busy, providers, onCreate, onCancel, vectorDraw, vectorDrawBy, onCreateVector }: {
  busy: boolean; providers: ImageProvider[]; onCreate: NonNullable<Props['onCreate']>; onCancel: () => void;
  vectorDraw: boolean; vectorDrawBy: 'anthropic' | 'openai'; onCreateVector?: Props['onCreateVector'];
}) {
  const geminiOk = providers.length > 0;
  const [picked, setPicked] = useState<ImageProvider | null>(null);
  const provider = picked && providers.includes(picked) ? picked : providers[0];
  const [description, setDescription] = useState('');
  const [name, setName] = useState('');
  const [style, setStyle] = useState<string>(ART_STYLES[0]);
  const [reference, setReference] = useState<File | undefined>();
  const [type, setType] = useState<'picture' | 'vector'>('picture');
  const vector = type === 'vector';
  const ready = geminiOk && !busy && (description.trim() !== '' || reference !== undefined) && (!vector || vectorDraw);
  const drawKey = vectorDrawBy === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
  const create = () => (vector
    ? onCreateVector?.({ description: description.trim(), name: name.trim(), provider, reference })
    : onCreate({ description: description.trim(), name: name.trim(), style, provider, reference }));
  return (
    <div className="create-form">
      <h3>Create a character</h3>
      {!geminiOk && <p className="hint">Add GEMINI_API_KEY or OPENAI_API_KEY to .env to create characters.</p>}
      {onCreateVector && (
        <label className="field"><span>Type</span>
          <select aria-label="Type" disabled={busy} value={type} onChange={(e) => setType(e.target.value as 'picture' | 'vector')}>
            <option value="picture">Picture</option>
            <option value="vector" disabled={!vectorDraw}>Vector (moves smoothly){vectorDraw ? '' : ` (needs ${drawKey})`}</option>
          </select>
        </label>
      )}
      <textarea aria-label="Describe your character" rows={3} maxLength={400} disabled={busy}
        placeholder="e.g. a cheerful round robot with a teal scarf and one antenna" value={description} onChange={(e) => setDescription(e.target.value)} />
      <div className="fields">
        <label className="field"><span>Name</span>
          <input aria-label="Name" maxLength={40} disabled={busy} placeholder="Optional" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        {!vector && (
          <label className="field"><span>Style</span>
            <select aria-label="Style" disabled={busy} value={style} onChange={(e) => setStyle(e.target.value)}>
              {ART_STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )}
        {providers.length > 1 && (
          <label className="field"><span>{vector ? 'Pictures by' : 'Drawn by'}</span>
            <select aria-label="Drawn by" disabled={busy} value={provider} onChange={(e) => setPicked(e.target.value as ImageProvider)}>
              {providers.map((p) => <option key={p} value={p}>{PROVIDER_NAMES[p]}</option>)}
            </select>
          </label>
        )}
      </div>
      <label className="field"><span>Reference picture (optional): redraw your own character or logo</span>
        <input type="file" accept="image/png,image/jpeg,image/webp" aria-label="Reference picture" disabled={busy}
          onChange={(e) => setReference(e.target.files?.[0])} />
      </label>
      <div className="line-actions">
        <button className="btn" disabled={!ready} title={geminiOk ? undefined : NEEDS_KEY}
          onClick={create}><Icon name="spark" /> Create character</button>
        <button className="btn secondary" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
      {vector
        ? <p className="hint">{provider ? PROVIDER_NAMES[provider] : 'The AI'} paints a front picture and a face sheet, then {DRAW_NAMES[vectorDrawBy]} draws the character as parts on a skeleton and checks them, so its arms bend and its head turns smoothly. It usually takes 5 to 10 minutes and costs about $1.50 to $2.50. It runs in the background: you can keep working or close Kitta, and resume it later.</p>
        : <p className="hint">{provider ? PROVIDER_NAMES[provider] : 'The AI'} paints the character first. Then you draw its expressions and actions from it, so it stays the same character. Image generation is usually paid (Gemini's free tier may not include it).</p>}
    </div>
  );
}

const STEP_LABELS = [['front', 'Front picture'], ['face', 'Face sheet'], ['drawing', 'Drawing the parts']] as const;

/** Progress of one vector character being created: the steps, the latest check picture, and cancel/resume. */
function VectorJobCard({ job: j, onJob }: { job: VectorJob; onJob: NonNullable<Props['onJob']> }) {
  const live = RUNNING_STAGES.includes(j.stage);
  const done = (s: 'front' | 'face' | 'drawing') => (s === 'front' ? j.hasFront : s === 'face' ? j.hasFace : false);
  const pic = (file: string) => `/api/vector-jobs/${j.id}/${file}?v=${encodeURIComponent(j.updatedAt)}`;
  const cost = j.cost >= 0.01 ? `$${j.cost.toFixed(2)}` : j.cost > 0 ? '<$0.01' : '$0';
  return (
    <div className="create-form vector-job" aria-label={`${live ? 'Creating' : 'Stopped:'} ${j.name}`}>
      <h3>{live ? 'Creating' : 'Stopped:'} {j.name} (vector)</h3>
      <ol className="job-steps">
        {STEP_LABELS.map(([s, label]) => (
          <li key={s} className={done(s) ? 'done' : j.stage === s ? 'active' : ''}>
            {done(s) ? '✓ ' : j.stage === s ? '… ' : ''}{label}
            {s === 'drawing' && (j.stage === 'drawing' || j.round > 0) && <span className="hint"> · round {Math.min(j.round + (j.stage === 'drawing' ? 1 : 0), j.maxRounds)} of up to {j.maxRounds}{j.errors !== null ? ` · ${j.errors} check error${j.errors === 1 ? '' : 's'} last round` : ''}</span>}
          </li>
        ))}
      </ol>
      <div className="job-pictures">
        {j.hasFront && <a href={pic('front.png')} target="_blank" rel="noreferrer"><img src={pic('front.png')} alt="Front picture" height={160} /></a>}
        {j.hasFace && <a href={pic('sheet_face.png')} target="_blank" rel="noreferrer"><img src={pic('sheet_face.png')} alt="Face sheet" height={160} /></a>}
        {j.hasCheck && <a href={pic('check.png')} target="_blank" rel="noreferrer"><img src={pic('check.png')} alt="Latest check picture" height={160} /></a>}
      </div>
      <p className="hint">{j.message ?? (live ? 'Runs in the background; you can keep working.' : '')} Spent so far: {cost}.</p>
      <div className="line-actions">
        {live
          ? <button className="btn secondary" onClick={() => onJob(j.id, 'cancel')}>Cancel</button>
          : <>
            <button className="btn" onClick={() => onJob(j.id, 'resume')}>Resume</button>
            <button className="btn secondary" onClick={() => { if (confirm(`Discard ${j.name} and its pictures?`)) onJob(j.id, 'discard'); }}>Discard</button>
          </>}
      </div>
    </div>
  );
}

function ArtSheet({ character: c, busy, geminiOk, onDraw, onFindMouths, onSetMouth, onDelete }: {
  character: ArtCharacter; busy: boolean; geminiOk: boolean; onDraw: NonNullable<Props['onDraw']>; onFindMouths: NonNullable<Props['onFindMouths']>; onSetMouth: NonNullable<Props['onSetMouth']>; onDelete: NonNullable<Props['onDelete']>;
}) {
  const missing = ([...EXPRESSIONS, 'blink', ...ART_ACTIONS] as ArtPose[]).filter((p) => !c.images[p]);
  const noMouth = Object.values(c.images).filter((im) => im && !im.mouth).length;
  const pickMouth = (e: MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onSetMouth(c.id, Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)));
  };
  const tile = (pose: ArtPose, label: string = pose) => {
    const url = imgUrl(c, pose);
    return (
      <figure key={pose} className="expression" data-testid={`pose-${pose}`}>
        {url ? <img src={url} alt={label} width={64} height={64} /> : <div className="pose-missing">not drawn</div>}
        <figcaption>{label}</figcaption>
        {pose !== 'neutral' && (
          <button className="mini" disabled={busy || !geminiOk} title={geminiOk ? undefined : NEEDS_KEY}
            aria-label={`${url ? 'Redraw' : 'Draw'} ${label}`} onClick={() => onDraw(c.id, [pose])}>{url ? <Icon name="redo" size={14} /> : 'Draw'}</button>
        )}
      </figure>
    );
  };
  return (
    <div>
      <div className="art-head">
        <h3>{c.name}</h3>
        <button className="mini" disabled={busy} onClick={() => { if (confirm(`Delete ${c.name}?`)) onDelete(c.id); }}>Delete</button>
      </div>
      <p className="hint">{c.style} · {PROVIDER_NAMES[c.provider ?? 'gemini']} · {c.prompt || 'from a reference picture'}</p>
      {(noMouth > 0 || !c.mouthsMeasured) && (
        <p className="hint">
          {noMouth > 0
            ? `${noMouth === 1 ? '1 picture has' : `${noMouth} pictures have`} no mouth found, so the character won't move its lips in ${noMouth === 1 ? 'it' : 'them'}.`
            : 'This character was made before mouths were measured precisely, so its talking mouth may sit off its painted one.'}{' '}
          <button className="mini" disabled={busy || !geminiOk} title={geminiOk ? undefined : NEEDS_KEY} onClick={() => onFindMouths(c.id)}>Find mouths again</button>
        </p>
      )}
      {missing.length > 0 && (
        <button className="btn" disabled={busy || !geminiOk} title={geminiOk ? undefined : NEEDS_KEY} onClick={() => onDraw(c.id, missing)}>
          <Icon name="spark" /> Draw {missing.length === 1 ? 'the missing pose' : `all ${missing.length} missing poses`}
        </button>
      )}
      {c.images.neutral && (
        <div className="mouth-picker">
          <h3>Set lip-sync position</h3>
          <p className="hint">Click the centre of the mouth once. Kitta will reuse this position and refine it locally across the saved poses.</p>
          <button type="button" className="mouth-target" disabled={busy} aria-label="Click the character mouth" onClick={pickMouth}>
            <img src={imgUrl(c, 'neutral') ?? ''} alt="Click the character mouth" width={180} height={180} />
            {c.mouthAnchor && <span className="mouth-marker" style={{ left: `${c.mouthAnchor.x * 100}%`, top: `${c.mouthAnchor.y * 100}%` }} />}
          </button>
          {c.mouthAnchor && <p className="hint">Mouth position saved.</p>}
        </div>
      )}
      <h3>Expressions</h3>
      <p className="hint">Lines use these faces; one that isn't drawn yet shows the neutral face.</p>
      <div className="expressions">{EXPRESSIONS.map((x) => tile(x))}{tile('blink', 'blink (eyes shut)')}</div>
      <h3>Actions</h3>
      <p className="hint">Shown while a line's gesture plays. Nod works without a picture.</p>
      <div className="expressions">{ART_ACTIONS.map((a) => tile(a))}</div>
    </div>
  );
}

function Customize({ character, onChange, showExpressions }: { character: CharacterConfig; onChange: (c: CharacterConfig) => void; showExpressions: boolean }) {
  const set = (patch: Partial<CharacterConfig>) => onChange({ ...character, ...patch });
  const colour = (label: string, key: 'skin' | 'hairColor' | 'outfitColor') => (
    <label className="field">
      <span>{label}</span>
      <input type="color" value={character[key]} onChange={(e) => set({ [key]: e.target.value })} />
    </label>
  );
  const select = (label: string, key: 'hairStyle' | 'eyeStyle' | 'outfit', values: string[]) => (
    <label className="field">
      <span>{label}</span>
      <select value={character[key]} onChange={(e) => set({ [key]: e.target.value })}>
        {values.map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
    </label>
  );
  return (
    <div>
      <h3>Customize</h3>
      <div className="fields">
        {colour('Skin colour', 'skin')}
        {colour('Hair colour', 'hairColor')}
        {colour('Outfit colour', 'outfitColor')}
        {select('Hair style', 'hairStyle', OPTIONS.hairStyles)}
        {select('Eyes', 'eyeStyle', OPTIONS.eyeStyles)}
        {select('Outfit', 'outfit', OPTIONS.outfits)}
      </div>
      {showExpressions && <>
      <h3>Expressions</h3>
      <p className="hint">Your character's expression set. Pick one per line in the Voiceover step; faces morph smoothly from line to line.</p>
      <div className="expressions" data-testid="expression-sheet">
        {EXPRESSIONS.map((x) => (
          <figure key={x} className="expression">
            <Character config={character} frame={{ ...REST, expression: x }} width={64} height={64} />
            <figcaption>{x}</figcaption>
          </figure>
        ))}
      </div>
      </>}
    </div>
  );
}
