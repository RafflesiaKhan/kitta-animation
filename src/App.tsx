import { useState } from 'react';
import type { CharacterConfig, Timeline } from '../shared/types';
import { STARTERS } from '../shared/character/starters';
import { Preview } from './Preview';
import { CharacterStep } from './steps/CharacterStep';
import { VoiceoverStep } from './steps/VoiceoverStep';

interface State { character: CharacterConfig; timeline: Timeline | null; audioId: string | null }

const STEPS = ['1 Character', '2 Voiceover', '3 Export'];
const { name: _name, ...KIT } = STARTERS.kit;

export function App() {
  const [step, setStep] = useState(0);
  const [state, setState] = useState<State>({ character: KIT, timeline: null, audioId: null });
  const [status, setStatus] = useState('');

  return (
    <div className="app">
      <header>
        <h1>Kitta Animation</h1>
        <nav className="pills">
          {STEPS.map((label, i) => (
            <button key={label} className={`pill${i === step ? ' active' : ''}`} onClick={() => setStep(i)}>{label}</button>
          ))}
        </nav>
      </header>
      <main>
        <section className="panel">
          {step === 0 && <CharacterStep character={state.character} onChange={(character) => setState((s) => ({ ...s, character }))} />}
          {step === 1 && <VoiceoverStep onStatus={setStatus} onReady={({ audioId, timeline }) => setState((s) => ({ ...s, audioId, timeline }))} />}
          {step === 2 && <div><h2>Export</h2><p className="hint">Export comes next.</p></div>}
        </section>
        <Preview character={state.character} timeline={state.timeline} audioUrl={state.audioId ? `/api/audio/${state.audioId}` : null} status={status} />
      </main>
    </div>
  );
}
