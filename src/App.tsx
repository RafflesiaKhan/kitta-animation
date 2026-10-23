import { useState } from 'react';
import type { CharacterConfig, Line, ScriptLineInput, Timeline } from '../shared/types';
import { VOICES } from '../shared/voices';
import { STARTERS } from '../shared/character/starters';
import * as api from './api';
import { Preview } from './Preview';
import { CharacterStep } from './steps/CharacterStep';
import { VoiceoverStep } from './steps/VoiceoverStep';
import { ExportStep } from './steps/ExportStep';

export interface State { character: CharacterConfig; timeline: Timeline | null; audioId: string | null }

const NEW_LINE: ScriptLineInput = { text: '', voice: VOICES[0], expression: 'neutral', gesture: 'none' };
const STEPS = ['1 Character', '2 Voiceover', '3 Export'];
const { name: _name, ...KIT } = STARTERS.kit;

/** Applies tagged lines only if the timeline still belongs to the audio the request started with. */
export function withTaggedLines(s: State, startedAudioId: string, lines: Line[]): State {
  return s.audioId === startedAudioId && s.timeline ? { ...s, timeline: { ...s.timeline, lines } } : s;
}

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

  const run = async (label: string, job: () => Promise<void>) => {
    setError(null);
    try {
      setStatus(label);
      await job();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStatus('');
    }
  };

  // Auto-tag the script draft; empty lines are kept as they are and not sent.
  const autoTagScript = () => run('Tagging expressions…', async () => {
    const idx = scriptLines.flatMap((l, i) => (l.text.trim() ? [i] : []));
    if (!idx.length) return;
    const tags = await api.autoTag(idx.map((i) => scriptLines[i].text));
    setScriptLines((cur) => cur.map((l, i) => {
      const t = tags[idx.indexOf(i)];
      return t && idx.includes(i) ? { ...l, expression: t.expression, gesture: t.gesture } : l;
    }));
  });

  // Transcribe the uploaded audio, then tag each sentence; same cues, audioId and duration.
  const addExpressions = () => run('Listening…', async () => {
    const { audioId } = state;
    if (!audioId || !state.timeline) return;
    const heard = await api.transcribe(audioId);
    if (!heard.length) throw new Error("Couldn't find any speech to tag.");
    setStatus('Tagging expressions…');
    const tags = await api.autoTag(heard.map((l) => l.text));
    const lines = heard.map((l, i) => ({ ...l, expression: tags[i].expression, gesture: tags[i].gesture }));
    setState((s) => withTaggedLines(s, audioId, lines));
  });

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
          {step === 1 && <VoiceoverStep busy={busy} error={error} onUpload={upload} scriptLines={scriptLines} onScriptLines={setScriptLines} onGenerate={generate} onAutoTag={autoTagScript} onAddExpressions={addExpressions} canTag={Boolean(state.timeline && state.audioId)} />}
          {step === 2 && <ExportStep character={state.character} timeline={state.timeline} audioId={state.audioId} />}
        </section>
        <Preview character={state.character} timeline={state.timeline} audioUrl={state.audioId ? `/api/audio/${state.audioId}` : null} status={status} />
      </main>
    </div>
  );
}
