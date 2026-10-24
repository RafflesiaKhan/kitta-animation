import { useEffect, useState } from 'react';
import { ART_ACTIONS, EXPRESSIONS, isArt } from '../../shared/types';
import type { AnyCharacter, ArtCharacter, ArtPose, CharacterConfig, FrameState, StarterId } from '../../shared/types';
import { Character } from '../../shared/character/Character';
import { OPTIONS, STARTERS } from '../../shared/character/starters';
import { ART_STYLES } from '../../shared/character/art';
import * as api from '../api';

const REST: FrameState = { expression: 'neutral', mouth: 'X', gesture: 'none', gestureProgress: 0, blink: false, bob: 0 };
const NEEDS_KEY = 'Needs GEMINI_API_KEY';

interface Props {
  character: AnyCharacter;
  onChange: (c: AnyCharacter) => void;
  library: ArtCharacter[];
  geminiOk: boolean;
  busy: boolean;
  error: string | null;
  onCreate: (input: api.CreateCharacterInput) => void;
  onDraw: (id: string, poses: ArtPose[]) => void;
  onDelete: (id: string) => void;
}

const imgUrl = (c: ArtCharacter, pose: ArtPose) => {
  const im = c.images[pose];
  return im ? `/api/characters/${c.id}/${im.file}` : null;
};

export function CharacterStep({ character, onChange, library, geminiOk, busy, error, onCreate, onDraw, onDelete }: Props) {
  const [creating, setCreating] = useState(false);
  // A finished creation selects the new character; leave the form then.
  useEffect(() => { if (isArt(character)) setCreating(false); }, [isArt(character) ? character.id : null]);

  const pickStarter = (id: StarterId) => {
    const { name: _name, ...config } = STARTERS[id];
    setCreating(false);
    onChange(config);
  };
  const selected = (c: ArtCharacter) => !creating && isArt(character) && character.id === c.id;
  return (
    <div>
      <h2>Pick a character</h2>
      <div className="tiles">
        {(Object.keys(STARTERS) as StarterId[]).map((id) => {
          const on = !creating && !isArt(character) && character.starter === id;
          return (
            <button key={id} className={`tile${on ? ' selected' : ''}`} aria-pressed={on} onClick={() => pickStarter(id)}>
              <Character config={STARTERS[id]} frame={REST} width={84} height={84} />
              <span>{STARTERS[id].name}</span>
            </button>
          );
        })}
        {library.map((c) => (
          <button key={c.id} className={`tile${selected(c) ? ' selected' : ''}`} aria-pressed={selected(c)} onClick={() => { setCreating(false); onChange(c); }}>
            <img src={imgUrl(c, 'neutral') ?? ''} alt="" width={84} height={84} />
            <span>{c.name}</span>
          </button>
        ))}
        <button className={`tile create${creating ? ' selected' : ''}`} aria-pressed={creating} onClick={() => setCreating(true)}>
          <span className="plus">＋</span>
          <span>Create with AI</span>
        </button>
      </div>
      {creating
        ? <CreateForm busy={busy} geminiOk={geminiOk} onCreate={onCreate} onCancel={() => setCreating(false)} />
        : isArt(character)
          ? <ArtSheet character={character} busy={busy} geminiOk={geminiOk} onDraw={onDraw} onDelete={onDelete} />
          : <Customize character={character} onChange={onChange} />}
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  );
}

function CreateForm({ busy, geminiOk, onCreate, onCancel }: { busy: boolean; geminiOk: boolean; onCreate: Props['onCreate']; onCancel: () => void }) {
  const [description, setDescription] = useState('');
  const [name, setName] = useState('');
  const [style, setStyle] = useState<string>(ART_STYLES[0]);
  const [reference, setReference] = useState<File | undefined>();
  const ready = geminiOk && !busy && (description.trim() !== '' || reference !== undefined);
  return (
    <div className="create-form">
      <h3>Create a character</h3>
      {!geminiOk && <p className="hint">Add GEMINI_API_KEY to .env to create characters.</p>}
      <textarea aria-label="Describe your character" rows={3} maxLength={400} disabled={busy}
        placeholder="e.g. a cheerful round robot with a teal scarf and one antenna" value={description} onChange={(e) => setDescription(e.target.value)} />
      <div className="fields">
        <label className="field"><span>Name</span>
          <input aria-label="Name" maxLength={40} disabled={busy} placeholder="Optional" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field"><span>Style</span>
          <select aria-label="Style" disabled={busy} value={style} onChange={(e) => setStyle(e.target.value)}>
            {ART_STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>
      <label className="field"><span>Reference picture (optional): redraw your own character or logo</span>
        <input type="file" accept="image/png,image/jpeg,image/webp" aria-label="Reference picture" disabled={busy}
          onChange={(e) => setReference(e.target.files?.[0])} />
      </label>
      <div className="line-actions">
        <button className="btn" disabled={!ready} title={geminiOk ? undefined : NEEDS_KEY}
          onClick={() => onCreate({ description: description.trim(), name: name.trim(), style, reference })}>✨ Create character</button>
        <button className="btn secondary" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
      <p className="hint">Gemini paints the character first. Then you draw its expressions and actions from it, so it stays the same character. Image generation may not be included in Gemini's free tier.</p>
    </div>
  );
}

function ArtSheet({ character: c, busy, geminiOk, onDraw, onDelete }: {
  character: ArtCharacter; busy: boolean; geminiOk: boolean; onDraw: Props['onDraw']; onDelete: Props['onDelete'];
}) {
  const missing = ([...EXPRESSIONS, 'blink', ...ART_ACTIONS] as ArtPose[]).filter((p) => !c.images[p]);
  const tile = (pose: ArtPose, label: string = pose) => {
    const url = imgUrl(c, pose);
    return (
      <figure key={pose} className="expression" data-testid={`pose-${pose}`}>
        {url ? <img src={url} alt={label} width={64} height={64} /> : <div className="pose-missing">not drawn</div>}
        <figcaption>{label}</figcaption>
        {pose !== 'neutral' && (
          <button className="mini" disabled={busy || !geminiOk} title={geminiOk ? undefined : NEEDS_KEY}
            aria-label={`${url ? 'Redraw' : 'Draw'} ${label}`} onClick={() => onDraw(c.id, [pose])}>{url ? '↻' : 'Draw'}</button>
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
      <p className="hint">{c.style} · {c.prompt || 'from a reference picture'}</p>
      {!c.images.neutral?.mouth && <p className="hint">No mouth was found in this picture, so this character won't move its lips.</p>}
      {missing.length > 0 && (
        <button className="btn" disabled={busy || !geminiOk} title={geminiOk ? undefined : NEEDS_KEY} onClick={() => onDraw(c.id, missing)}>
          ✨ Draw {missing.length === 1 ? 'the missing pose' : `all ${missing.length} missing poses`}
        </button>
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

function Customize({ character, onChange }: { character: CharacterConfig; onChange: (c: CharacterConfig) => void }) {
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
    </div>
  );
}
