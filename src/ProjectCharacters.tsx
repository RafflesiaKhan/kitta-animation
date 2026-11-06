import { useState, type FormEvent } from 'react';
import { STARTERS } from '../shared/character/starters';
import type { Project, ProjectCharacter, ProjectCharacterInput, ProjectVoice } from '../shared/projects';
import { isArt, type AnyCharacter, type ArtCharacter } from '../shared/types';
import { DEFAULT_SPEAKER, TTS_PROVIDERS, TTS_PROVIDER_NAMES } from '../shared/voices';
import { CharacterStep } from './steps/CharacterStep';

export function ProjectCharacters({ project, library, busy, onSave }: {
  project: Project; library: ArtCharacter[]; busy: boolean;
  onSave: (input: ProjectCharacterInput, id?: string) => Promise<Project | undefined>;
}) {
  const [selectedId, setSelectedId] = useState('');
  const [character, setCharacter] = useState<AnyCharacter | undefined>(() => project.style === 'svg' ? STARTERS.kit : undefined);
  const selected = project.characters?.find(item => item.id === selectedId);
  function edit(item?: ProjectCharacter) {
    setSelectedId(item?.id ?? '');
    const saved = item?.character;
    if (!saved) setCharacter(project.style === 'svg' ? STARTERS.kit : undefined);
    else setCharacter('artId' in saved ? library.find(art => art.id === saved.artId) : saved);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!character || busy) return;
    const data = new FormData(event.currentTarget);
    const saved = await onSave({
      name: String(data.get('name')), anchorY: Number(data.get('anchorY')),
      character: isArt(character) ? { artId: character.id } : character,
      voice: { provider: data.get('provider') as ProjectVoice['provider'], voice: String(data.get('voice')),
        engine: String(data.get('engine')), speaker: String(data.get('speaker')), variability: data.get('variability') as ProjectVoice['variability'] },
    }, selected?.id);
    if (saved && !selected) setSelectedId(saved.characters?.at(-1)?.id ?? '');
  }
  return <>
    <label className="field">Project character <select value={selectedId} disabled={busy} onChange={event => edit(project.characters?.find(item => item.id === event.target.value))}>
      <option value="">New character</option>
      {project.characters?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select></label>
    {project.style === 'ai' && !busy && library.length === 0 && <p className="hint">No painted characters in the saved library.</p>}
    <form key={selectedId} className="project-form" onSubmit={submit}>
      <fieldset className="project-character-fields" disabled={busy}>
        <CharacterStep projectStyle={project.style} character={character} onChange={setCharacter} library={library} busy={busy} />
        <div className="fields">
          <label className="field">Character name <input name="name" required maxLength={100} defaultValue={selected?.name} /></label>
          <label className="field">Character ground anchor <input type="number" name="anchorY" min="0" max="1" step="0.01" required defaultValue={selected?.anchorY ?? 1} /></label>
        </div>
        <p className="hint">Anchor within the character box, from 0 at the top to 1 at the bottom. Set where it meets the stage in each episode.</p>
        <h3>Default voice</h3>
        <div className="fields">
          <label className="field">Provider <select name="provider" defaultValue={selected?.voice.provider ?? 'voicestudio'}>{TTS_PROVIDERS.map(value => <option key={value} value={value}>{TTS_PROVIDER_NAMES[value]}</option>)}</select></label>
          <label className="field">Voice <input name="voice" required maxLength={100} defaultValue={selected?.voice.voice ?? 'default'} /></label>
          <label className="field">Engine <input name="engine" maxLength={100} defaultValue={selected?.voice.engine ?? ''} /></label>
          <label className="field">Speaker <input name="speaker" maxLength={100} defaultValue={selected?.voice.speaker ?? DEFAULT_SPEAKER} /></label>
          <label className="field">Delivery <select name="variability" defaultValue={selected?.voice.variability ?? 'steady'}><option value="steady">Steady</option><option value="varied">Varied</option></select></label>
        </div>
        <button className="btn" disabled={busy || !character}>Save character</button>
      </fieldset>
    </form>
  </>;
}
