import { useEffect, useState } from 'react';
import { isArt } from '../shared/types';
import type { AnyCharacter, ArtCharacter, ArtPose, ImageProvider, Line, ScriptLineInput, Timeline } from '../shared/types';
import { VOICES, type TtsProvider } from '../shared/voices';
import { STARTERS } from '../shared/character/starters';
import * as api from './api';
import { Preview } from './Preview';
import { CharacterStep } from './steps/CharacterStep';
import { VoiceoverStep } from './steps/VoiceoverStep';
import { ExportStep } from './steps/ExportStep';
import { UsagePanel } from './UsagePanel';

export interface State { character: AnyCharacter; timeline: Timeline | null; audioId: string | null; source: 'upload' | 'script' | null }

const NEW_LINE: ScriptLineInput = { text: '', voice: VOICES[0], expression: 'neutral', gesture: 'none' };
const STEPS = ['1 Character', '2 Voiceover', '3 Export'];
const { name: _name, ...KIT } = STARTERS.kit;

/** Applies tagged lines only if the timeline still belongs to the audio the request started with. */
export function withTaggedLines(s: State, startedAudioId: string, lines: Line[]): State {
  return s.audioId === startedAudioId && s.timeline ? { ...s, timeline: { ...s.timeline, lines } } : s;
}

export function App() {
  const [step, setStep] = useState(0);
  const [state, setState] = useState<State>({ character: KIT, timeline: null, audioId: null, source: null });
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [scriptLines, setScriptLines] = useState<ScriptLineInput[]>([NEW_LINE]); // draft survives step switches
  const busy = status !== '';
  const [library, setLibrary] = useState<ArtCharacter[]>([]); // saved AI characters
  // Fetched once, shared by the Character and Voiceover steps.
  const [geminiOk, setGeminiOk] = useState(true);
  const [imageProviders, setImageProviders] = useState<ImageProvider[]>(['gemini']);
  const [ttsProviders, setTtsProviders] = useState<TtsProvider[]>(['gemini']);
  const [ttsProvider, setTtsProvider] = useState<TtsProvider>('gemini'); // who speaks the script
  const [ttsEngine, setTtsEngine] = useState(''); // VoiceStudio engine; '' = its active engine
  useEffect(() => {
    Promise.resolve(api.listCharacters()).then((l) => setLibrary(l ?? []), () => {});
    Promise.resolve(api.health()).then((h) => {
      setGeminiOk(h?.gemini !== false);
      setImageProviders(h?.imageProviders ?? (h?.gemini === false ? [] : ['gemini'])); // older servers only report gemini
      const voices = h?.ttsProviders ?? (h?.gemini === false ? [] : ['gemini']);
      setTtsProviders(voices);
      if (voices.length) setTtsProvider(voices[0]);
    }, () => {});
  }, []);

  // Upload state lives here (not in the tab) so it survives switching steps.
  const upload = async (file: File) => {
    setError(null);
    try {
      setStatus('Uploading…');
      const { audioId, durationMs } = await api.uploadAudio(file);
      setStatus('Matching lips…');
      const cues = await api.lipsync(audioId);
      const timeline: Timeline = { durationMs, cues, lines: [{ text: '', startMs: 0, endMs: durationMs, expression: 'neutral', gesture: 'none' }] };
      setState((s) => ({ ...s, audioId, timeline, source: 'upload' }));
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
    // Without Gemini (transcribed by a local VoiceStudio) the lines arrive untagged, ready to tag by hand.
    let tags = heard.map(() => ({ expression: 'neutral' as const, gesture: 'none' as const })) as Awaited<ReturnType<typeof api.autoTag>>;
    if (geminiOk) {
      setStatus('Tagging expressions…');
      tags = await api.autoTag(heard.map((l) => l.text));
    }
    const lines = heard.map((l, i) => ({ ...l, expression: tags[i].expression, gesture: tags[i].gesture }));
    setState((s) => withTaggedLines(s, audioId, lines));
  });

  // Hand-edit one line of the uploaded timeline; no TTS or lipsync re-run.
  const editUploadLine = (i: number, patch: Pick<Line, 'expression'> | Pick<Line, 'gesture'>) =>
    setState((s) => (s.timeline ? { ...s, timeline: { ...s.timeline, lines: s.timeline.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) } } : s));

  // ---------- AI characters ----------
  // Stores a created/updated AI character in the library and, if it is the one in use, in the state too.
  const putArt = (c: ArtCharacter) => {
    setLibrary((l) => [...l.filter((x) => x.id !== c.id), c].sort((a, b) => a.name.localeCompare(b.name)));
    setState((s) => (isArt(s.character) && s.character.id === c.id ? { ...s, character: c } : s));
  };

  const createArt = (input: api.CreateCharacterInput) => run('Drawing your character…', async () => {
    const c = await api.createCharacter(input);
    putArt(c);
    setState((s) => ({ ...s, character: c }));
  });

  // One pose at a time (kinder to rate limits); each is saved as it arrives, so a failure keeps the rest.
  const drawPoses = (id: string, poses: ArtPose[]) => run('Drawing…', async () => {
    for (const [i, pose] of poses.entries()) {
      setStatus(`Drawing ${pose}${poses.length > 1 ? ` (${i + 1}/${poses.length})` : ''}…`);
      putArt(await api.generatePose(id, pose));
    }
  });

  const findMouths = (id: string) => run('Finding mouths…', async () => {
    putArt(await api.measureMouths(id));
  });

  const deleteArt = (id: string) => run('Deleting…', async () => {
    await api.deleteCharacter(id);
    setLibrary((l) => l.filter((x) => x.id !== id));
    setState((s) => (isArt(s.character) && s.character.id === id ? { ...s, character: KIT } : s));
  });

  const generate = async () => {
    setError(null);
    try {
      setStatus('Generating voice…');
      const { audioId, durationMs, cues, lines } = await api.tts(scriptLines.map((l) => (l.note?.trim() ? l : { ...l, note: undefined })), ttsProvider, ttsProvider === 'voicestudio' ? ttsEngine : undefined);
      setState((s) => ({ ...s, audioId, timeline: { durationMs, cues, lines }, source: 'script' }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStatus('');
    }
  };

  return (
    <div className="app">
      <header>
        <div className="brand">
          <h1>Kitta Animation</h1>
          <span className="tagline">Lip-synced cartoon videos from your voice</span>
        </div>
        <nav className="pills">
          {STEPS.map((label, i) => (
            <button key={label} className={`pill${i === step ? ' active' : ''}`} onClick={() => setStep(i)}>{label}</button>
          ))}
        </nav>
        <UsagePanel refreshKey={busy} />
      </header>
      <main>
        <section className="panel">
          {step === 0 && <CharacterStep character={state.character} onChange={(character) => setState((s) => ({ ...s, character }))}
            library={library} imageProviders={imageProviders} busy={busy} error={error} onCreate={createArt} onDraw={drawPoses} onFindMouths={findMouths} onDelete={deleteArt} />}
          {step === 1 && <VoiceoverStep geminiOk={geminiOk} ttsProviders={ttsProviders} ttsProvider={ttsProvider} onTtsProvider={setTtsProvider} ttsEngine={ttsEngine} onTtsEngine={setTtsEngine} busy={busy} error={error} onUpload={upload} scriptLines={scriptLines} onScriptLines={setScriptLines} onGenerate={generate} onAutoTag={autoTagScript} onAddExpressions={addExpressions} uploadLines={state.source === 'upload' ? state.timeline?.lines ?? null : null} onEditUploadLine={editUploadLine} />}
          {step === 2 && <ExportStep character={state.character} timeline={state.timeline} audioId={state.audioId} />}
        </section>
        <Preview character={state.character} timeline={state.timeline} audioUrl={state.audioId ? `/api/audio/${state.audioId}` : null} status={status} />
      </main>
    </div>
  );
}
