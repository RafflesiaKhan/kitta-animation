import { useState } from 'react';
import type { CharacterConfig, ScriptLineInput, Timeline } from '../shared/types';
import { VOICES } from '../shared/voices';
import { STARTERS } from '../shared/character/starters';
import * as api from './api';
import { Preview } from './Preview';
import { CharacterStep } from './steps/CharacterStep';
import { VoiceoverStep } from './steps/VoiceoverStep';
import { ExportStep } from './steps/ExportStep';

interface State { character: CharacterConfig; timeline: Timeline | null; audioId: string | null }

const NEW_LINE: ScriptLineInput = { text: '', voice: VOICES[0], expression: 'neutral', gesture: 'none' };
const STEPS = ['1 Character', '2 Voiceover', '3 Export'];
const { name: _name, ...KIT } = STARTERS.kit;

export function App() {
  const [step, setStep] = useState(0);
  const [state, setState] = useState<State>({ character: KIT, timeline: null, audioId: null });
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [scriptLines, setScriptLines] = useState<ScriptLineInput[]>([NEW_LINE]); // draft survives step switches
  const busy = status !== '';

  // Upload state lives here (not in the tab) so it survives switching steps.
  const upload = async (file: File) => {
    setError(null);
    try {
      setStatus('Uploading…');
      const { audioId, durationMs } = await api.uploadAudio(file);
      setStatus('Matching lips…');
      const cues = await api.lipsync(audioId);
      const timeline: Timeline = { durationMs, cues, lines: [{ text: '', startMs: 0, endMs: durationMs, expression: 'neutral', gesture: 'none' }] };
      setState((s) => ({ ...s, audioId, timeline }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStatus('');
    }
  };

  const generate = async () => {
    setError(null);
    try {
      setStatus('Generating voice…');
      const { audioId, durationMs, cues, lines } = await api.tts(scriptLines.map((l) => (l.note?.trim() ? l : { ...l, note: undefined })));
      setState((s) => ({ ...s, audioId, timeline: { durationMs, cues, lines } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStatus('');
    }
  };

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
          {step === 1 && <VoiceoverStep busy={busy} error={error} onUpload={upload} scriptLines={scriptLines} onScriptLines={setScriptLines} onGenerate={generate} />}
          {step === 2 && <ExportStep character={state.character} timeline={state.timeline} audioId={state.audioId} />}
        </section>
        <Preview character={state.character} timeline={state.timeline} audioUrl={state.audioId ? `/api/audio/${state.audioId}` : null} status={status} />
      </main>
    </div>
  );
}
