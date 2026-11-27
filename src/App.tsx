import { useCallback, useEffect, useRef, useState } from 'react';
import { isArt, isVector } from '../shared/types';
import type { AnyCharacter, ArtCharacter, VectorCharacter, ArtPose, ImageProvider, Line, Marks, ScriptLineInput, Timeline, StudioComposition } from '../shared/types';
import { DEFAULT_COMPOSITION } from '../shared/types';
import { VOICES, type TtsProvider } from '../shared/voices';
import { STARTERS } from '../shared/character/starters';
import { marksOf } from '../shared/marks';
import * as api from './api';
import { Preview } from './Preview';
import { CharacterStep } from './steps/CharacterStep';
import { VoiceoverStep } from './steps/VoiceoverStep';
import { AnimateStep } from './steps/AnimateStep';
import { ExportStep } from './steps/ExportStep';
import { UsagePanel } from './UsagePanel';
import { RUNNING_STAGES, type VectorJob } from '../shared/vector-job';

export interface State { character: AnyCharacter; timeline: Timeline | null; audioId: string | null; source: 'upload' | 'script' | null; composition?: StudioComposition }

const NEW_LINE: ScriptLineInput = { text: '', voice: VOICES[0], expression: 'neutral', gesture: 'none' };
const STEPS = ['Character', 'Voiceover', 'Animate', 'Export'];
const { name: _name, ...KIT } = STARTERS.kit;

/**
 * Applies tagged lines only if the timeline still belongs to the audio the request started with.
 * The new tags replace every line's, so any hand-placed animation starts again from them.
 */
export function withTaggedLines(s: State, startedAudioId: string, lines: Line[]): State {
  if (s.audioId !== startedAudioId || !s.timeline) return s;
  const { marks: _marks, ...timeline } = s.timeline;
  return { ...s, timeline: { ...timeline, lines } };
}

export function App() {
  const [step, setStep] = useState(0);
  const [aspect, setAspect] = useState<'16:9' | '9:16'>('16:9');
  const audioRef = useRef<HTMLAudioElement>(null); // the preview's audio, shared with the Animate timeline
  const [state, setState] = useState<State>({ character: KIT, timeline: null, audioId: null, source: null, composition: DEFAULT_COMPOSITION });
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null); // how a directed script's directions were matched
  const [scriptLines, setScriptLines] = useState<ScriptLineInput[]>([NEW_LINE]); // draft survives step switches
  const busy = status !== '';
  const [library, setLibrary] = useState<ArtCharacter[]>([]); // saved AI characters
  const [vectors, setVectors] = useState<VectorCharacter[]>([]); // saved vector-avator characters
  const [vectorJobs, setVectorJobs] = useState<VectorJob[]>([]); // vector characters being created (or stopped)
  const [vectorDraw, setVectorDraw] = useState<{ ok: boolean; by: 'anthropic' | 'openai' }>({ ok: false, by: 'openai' });
  // Fetched once, shared by the Character and Voiceover steps.
  const [geminiOk, setGeminiOk] = useState(true);
  const [imageProviders, setImageProviders] = useState<ImageProvider[]>(['gemini']);
  const [ttsProviders, setTtsProviders] = useState<TtsProvider[]>(['gemini']);
  const [ttsProvider, setTtsProvider] = useState<TtsProvider>('gemini'); // who speaks the script
  const [ttsEngine, setTtsEngine] = useState(''); // VoiceStudio engine; '' = its active engine
  useEffect(() => {
    Promise.resolve(api.listCharacters()).then((l) => setLibrary(l ?? []), () => {});
    Promise.resolve(api.listVectorCharacters()).then((l) => setVectors(l ?? []), () => {});
    Promise.resolve(api.listVectorJobs()).then((l) => setVectorJobs(l ?? []), () => {});
    Promise.resolve(api.health()).then((h) => {
      setVectorDraw({ ok: h?.vectorDraw === true, by: h?.vectorDrawProvider ?? 'openai' });
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

  // Hand-placed animation from the Animate step.
  const editMarks = useCallback((edit: (m: Marks) => Marks) => setState((s) => (s.timeline ? { ...s, timeline: { ...s.timeline, marks: edit(marksOf(s.timeline)) } } : s)), []);

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

  const setMouth = (id: string, x: number, y: number) => run('Setting mouth position…', async () => {
    putArt(await api.setMouthPoint(id, x, y));
  });

  const deleteArt = (id: string) => run('Deleting…', async () => {
    await api.deleteCharacter(id);
    setLibrary((l) => l.filter((x) => x.id !== id));
    setState((s) => (isArt(s.character) && s.character.id === id ? { ...s, character: KIT } : s));
  });

  const addVector = () => run('Adding the sample character…', async () => {
    const c = await api.addVectorSample();
    setVectors((v) => [...v.filter((x) => x.id !== c.id), c]);
    setState((s) => ({ ...s, character: c }));
  });

  const deleteVector = (id: string) => run('Removing…', async () => {
    await api.deleteVectorCharacter(id);
    setVectors((v) => v.filter((x) => x.id !== id));
    setState((s) => (isVector(s.character) && s.character.id === id ? { ...s, character: KIT } : s));
  });

  // ---------- vector characters created in the background ----------
  // While a job runs, ask about it every few seconds. A finished one leaves the list and becomes the character in use.
  const runningJobs = vectorJobs.filter((j) => RUNNING_STAGES.includes(j.stage)).map((j) => j.id).join(',');
  useEffect(() => {
    if (!runningJobs) return;
    const timer = setInterval(async () => {
      for (const id of runningJobs.split(',')) {
        const job = await api.getVectorJob(id).catch(() => null);
        if (!job) continue;
        if (job.stage === 'done') {
          setVectorJobs((js) => js.filter((x) => x.id !== id));
          const list = await api.listVectorCharacters();
          setVectors(list);
          const made = list.find((c) => c.id === id);
          if (made) setState((s) => ({ ...s, character: made }));
        } else setVectorJobs((js) => js.map((x) => (x.id === id ? job : x)));
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [runningJobs]);

  const createVector = (input: api.CreateVectorInput) => run('Starting…', async () => {
    const job = await api.startVectorJob(input);
    setVectorJobs((js) => [job, ...js]);
  });

  const vectorJob = (id: string, action: 'cancel' | 'resume' | 'discard') => run(action === 'cancel' ? 'Cancelling…' : action === 'resume' ? 'Resuming…' : 'Discarding…', async () => {
    if (action === 'discard') {
      await api.discardVectorJob(id);
      setVectorJobs((js) => js.filter((x) => x.id !== id));
      return;
    }
    const job = await (action === 'cancel' ? api.cancelVectorJob(id) : api.resumeVectorJob(id));
    setVectorJobs((js) => js.map((x) => (x.id === id ? job : x)));
  });

  const generate = async () => {
    setError(null);
    try {
      setStatus('Generating voice…');
      setNotice(null);
      const { audioId, durationMs, cues, lines, marks, directedBy } = await api.tts(scriptLines.map((l) => (l.note?.trim() ? l : { ...l, note: undefined })), ttsProvider, ttsProvider === 'voicestudio' ? ttsEngine : undefined);
      setState((s) => ({ ...s, audioId, timeline: { durationMs, cues, lines, ...(marks && { marks }) }, source: 'script' }));
      if (directedBy) setNotice(directedBy === 'keywords'
        ? 'Animated from the directions, matched with the built-in word list (no AI available). Fine-tune them in the Animate step.'
        : 'Animated from the directions. Fine-tune them in the Animate step.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStatus('');
    }
  };

  const audioUrl = state.audioId ? `/api/audio/${state.audioId}` : null;
  const composition = state.composition ?? DEFAULT_COMPOSITION;
  return (
    <div className="app">
      <header>
        <a className="pill" href="/?projects" title="Projects is still being built: scenes, episodes and sets may change.">Projects <span className="beta">Beta</span></a>
        <a className="pill" href="/?settings">Settings</a>
        <span className="logo" aria-hidden="true">K</span>
        <div className="brand">
          <h1>Kitta Animation</h1>
          <span className="tagline">Lip-synced cartoon videos from your voice</span>
        </div>
        <nav className="pills">
          {STEPS.map((label, i) => (
            <button key={label} className={`pill${i === step ? ' active' : ''}`} aria-current={i === step ? 'step' : undefined} onClick={() => setStep(i)}><span className="step-n">{i + 1}</span> {label}</button>
          ))}
        </nav>
        <UsagePanel refreshKey={busy} />
      </header>
      {step === 2 ? (
        <main className="animate">
          <Preview character={state.character} timeline={state.timeline} audioUrl={audioUrl} status={status} audioRef={audioRef} composition={composition} aspect={aspect} onComposition={(next) => setState((s) => ({ ...s, composition: next }))} />
          <AnimateStep character={state.character} timeline={state.timeline} audioUrl={audioUrl} audioRef={audioRef} onMarks={editMarks} composition={composition} onComposition={(next) => setState((s) => ({ ...s, composition: next }))} />
        </main>
      ) : (
        <main className={step === 3 ? 'export' : undefined}>
          <section className="panel">
            {step === 0 && <CharacterStep character={state.character} onChange={(character) => setState((s) => ({ ...s, character }))}
              library={library} vectors={vectors} onImportVector={addVector} onDeleteVector={deleteVector} imageProviders={imageProviders} busy={busy} error={error} onCreate={createArt} onDraw={drawPoses} onFindMouths={findMouths} onSetMouth={setMouth} onDelete={deleteArt}
              vectorJobs={vectorJobs} vectorDraw={vectorDraw.ok} vectorDrawBy={vectorDraw.by} onCreateVector={createVector} onJob={vectorJob} />}
            {step === 1 && <VoiceoverStep geminiOk={geminiOk} ttsProviders={ttsProviders} ttsProvider={ttsProvider} onTtsProvider={setTtsProvider} ttsEngine={ttsEngine} onTtsEngine={setTtsEngine} busy={busy} error={error} onUpload={upload} scriptLines={scriptLines} onScriptLines={setScriptLines} onGenerate={generate} onAutoTag={autoTagScript} onAddExpressions={addExpressions} uploadLines={state.source === 'upload' ? state.timeline?.lines ?? null : null} onEditUploadLine={editUploadLine} handAnimated={!!state.timeline?.marks} notice={notice} />}
            {step === 3 && <ExportStep character={state.character} timeline={state.timeline} audioId={state.audioId} composition={composition} aspect={aspect} onAspect={setAspect} />}
          </section>
          <Preview character={state.character} timeline={state.timeline} audioUrl={audioUrl} status={status} audioRef={audioRef} composition={composition} aspect={aspect} onComposition={(next) => setState((s) => ({ ...s, composition: next }))} />
        </main>
      )}
    </div>
  );
}
