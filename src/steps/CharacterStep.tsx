import type { CharacterConfig, FrameState, StarterId } from '../../shared/types';
import { Character } from '../../shared/character/Character';
import { OPTIONS, STARTERS } from '../../shared/character/starters';

const REST: FrameState = { expression: 'neutral', mouth: 'X', gesture: 'none', gestureProgress: 0, blink: false, bob: 0 };

interface Props { character: CharacterConfig; onChange: (c: CharacterConfig) => void }

export function CharacterStep({ character, onChange }: Props) {
  const set = (patch: Partial<CharacterConfig>) => onChange({ ...character, ...patch });
  const pickStarter = (id: StarterId) => {
    const { name: _name, ...config } = STARTERS[id];
    onChange(config);
  };
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
      <h2>Pick a character</h2>
      <div className="tiles">
        {(Object.keys(STARTERS) as StarterId[]).map((id) => (
          <button key={id} className={`tile${character.starter === id ? ' selected' : ''}`} aria-pressed={character.starter === id} onClick={() => pickStarter(id)}>
            <Character config={STARTERS[id]} frame={REST} width={84} height={84} />
            <span>{STARTERS[id].name}</span>
          </button>
        ))}
      </div>
      <h3>Customize</h3>
      <div className="fields">
        {colour('Skin colour', 'skin')}
        {colour('Hair colour', 'hairColor')}
        {colour('Outfit colour', 'outfitColor')}
        {select('Hair style', 'hairStyle', OPTIONS.hairStyles)}
        {select('Eyes', 'eyeStyle', OPTIONS.eyeStyles)}
        {select('Outfit', 'outfit', OPTIONS.outfits)}
      </div>
    </div>
  );
}
