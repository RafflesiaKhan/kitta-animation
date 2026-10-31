import { useEffect, useRef, useState } from 'react';
import { EXPRESSIONS, GESTURES } from '../../shared/types';
import type { Expression, Gesture, Line, ScriptLineInput } from '../../shared/types';
import { CUES, DEFAULT_SPEAKER, LANGUAGES, OPENAI_VOICES, PAUSES, PITCH_RANGE, SOUND_TAGS, SPEAKERS, SPEED_RANGE, TTS_PROVIDER_NAMES, VOICES, type TtsProvider, type VoiceStudioInfo } from '../../shared/voices';
import * as api from '../api';
import { splitScript } from '../../shared/direction';

interface Props {
  geminiOk: boolean; // auto-tag and transcription
  ttsProviders: TtsProvider[]; // voice providers set up on the server
  ttsProvider: TtsProvider;
  onTtsProvider: (p: TtsProvider) => void;
  ttsEngine: string; // VoiceStudio engine id; '' = its active engine
  onTtsEngine: (e: string) => void;
  busy: boolean;
  error: string | null;
  onUpload: (file: File) => void;
  scriptLines: ScriptLineInput[];
  onScriptLines: (lines: ScriptLineInput[]) => void;
  onGenerate: () => void;
  onAutoTag: () => void;
  onAddExpressions: () => void;
  uploadLines: Line[] | null; // lines of the uploaded timeline; null unless the current audio was uploaded
  onEditUploadLine: (i: number, patch: Pick<Line, 'expression'> | Pick<Line, 'gesture'>) => void;
  handAnimated?: boolean; // the Animate step now drives the animation, not these lines' tags
  notice?: string | null; // after generating a directed script: how its directions were matched
}

type TabProps = Props;
const NEEDS_KEY = 'Needs GEMINI_API_KEY';
const NEEDS_VOICE = 'Needs GEMINI_API_KEY, OPENAI_API_KEY or VOICESTUDIO_URL';

const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

/** The expression and gesture selects shared by script lines and uploaded-audio lines. */
function TagSelects({ busy, expression, gesture, onExpression, onGesture }: {
  busy: boolean; expression: Expression; gesture: Gesture;
  onExpression: (x: Expression) => void; onGesture: (g: Gesture) => void;
}) {
  return (
    <>
      <select aria-label="Expression" disabled={busy} value={expression} onChange={(e) => onExpression(e.target.value as Expression)}>
        {EXPRESSIONS.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
      <select aria-label="Gesture" disabled={busy} value={gesture} onChange={(e) => onGesture(e.target.value as Gesture)}>
        {GESTURES.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
    </>
  );
}

function UploadTab({ busy, error, onUpload, onAddExpressions, uploadLines, onEditUploadLine, geminiOk, ttsProviders, handAnimated }: TabProps) {
  // Transcription works with Gemini or a local VoiceStudio (then the lines come untagged).
  const canListen = geminiOk || ttsProviders.includes('voicestudio');
  return (
    <div>
      <label className="upload">
        <span className="btn">⬆ Upload voiceover</span>
        <input
          type="file"
          accept="audio/*"
          aria-label="Upload voiceover"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = ''; // so picking the same file again still fires onChange
            if (file) onUpload(file);
          }}
        />
      </label>
      <p className="hint">WAV, MP3, M4A… up to 3 minutes. Your character will lip-sync to it.</p>
      {uploadLines && (
        <>
          <button className="btn" disabled={busy || !canListen} title={canListen ? undefined : NEEDS_KEY} onClick={onAddExpressions}>✨ Add expressions</button>
          {handAnimated && <p className="hint">Animated in the Animate step: the expressions and gestures below no longer change the video.</p>}
          {uploadLines.map((l, i) => (
            <div key={i} className="line-card" data-testid="upload-line">
              <div className="line-chips">
                <span>{mmss(l.startMs)}–{mmss(l.endMs)}</span>
                <TagSelects busy={busy} expression={l.expression} gesture={l.gesture}
                  onExpression={(expression) => onEditUploadLine(i, { expression })} onGesture={(gesture) => onEditUploadLine(i, { gesture })} />
              </div>
              <p className="hint">{l.text || '(whole clip)'}</p>
            </div>
          ))}
        </>
      )}
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  );
}

interface VoiceOption { id: string; label: string; kind?: 'profile' | 'persona' | 'default'; icon?: string }
/** A persona's icon, else the voice's initial. */
const avatar = (v?: VoiceOption) => v?.icon ?? (v?.label ?? '?').charAt(0).toUpperCase();
const clamp = (v: number, r: number) => Math.max(-r, Math.min(r, Math.round(v) || 0));
/** Controls a new line takes over from the line above it. */
const carried = (l?: ScriptLineInput): Partial<ScriptLineInput> =>
  l ? { language: l.language, style: l.style, pitch: l.pitch, speed: l.speed, variability: l.variability, speaker: l.speaker } : {};
const named = (ids: string[]): VoiceOption[] => ids.map((id) => ({ id, label: id }));

/** VoiceStudio's status, engines and voices, read from the running app (refreshable). */
function useVoiceStudio(active: boolean): [VoiceStudioInfo | null, () => void] {
  const [info, setInfo] = useState<VoiceStudioInfo | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    let live = true;
    Promise.resolve(api.voiceStudio()).then((v) => { if (live) setInfo(v ?? null); }, () => {});
    return () => { live = false; };
  }, [active, tick]);
  return [info, () => setTick((t) => t + 1)];
}

function ScriptTab({ busy, error, scriptLines: lines, onScriptLines: setLines, onGenerate, onAutoTag, geminiOk, ttsProviders, ttsProvider, onTtsProvider, ttsEngine, onTtsEngine, notice }: TabProps) {
  const [pasted, setPasted] = useState<string | null>(null); // the Paste-script box, open while not null
  const voiceOk = ttsProviders.length > 0;
  const studioOn = ttsProvider === 'voicestudio';
  const [studio, refreshStudio] = useVoiceStudio(studioOn);
  // VoiceStudio: wait for its list (so a saved voice is picked first); one that lists nothing still gets its default.
  const voices: VoiceOption[] = ttsProvider === 'openai' ? named(OPENAI_VOICES)
    : studioOn ? (studio === null ? [] : studio.voices.length ? studio.voices : [{ id: 'alloy', label: "Engine's default voice", kind: 'default' }])
    : named(VOICES);
  const ids = voices.map((v) => v.id);
  const engine = studio?.engines.find((e) => e.id === ttsEngine);
  const update = (i: number, patch: Partial<ScriptLineInput>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const move = (i: number, d: number) => {
    const next = [...lines];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setLines(next);
  };
  const voice = lines[0]?.voice && ids.includes(lines[0].voice) ? lines[0].voice : ids[0] ?? VOICES[0];
  const cloneOnPlainEngine = engine && !engine.cloning && voices.find((v) => v.id === voice)?.kind === 'profile';
  // Switching provider (or VoiceStudio's list arriving) moves lines to a voice that provider has.
  useEffect(() => {
    if (voices.length && lines.some((l) => !ids.includes(l.voice))) setLines(lines.map((l) => (ids.includes(l.voice) ? l : { ...l, voice })));
  }, [voice, voices.length]);
  // VoiceStudio's reaction sounds only work on its default engine (OmniVoice); others would read them out.
  const soundsOk = studioOn && (!ttsEngine || ttsEngine.startsWith('omnivoice'));
  const boxes = useRef<(HTMLTextAreaElement | null)[]>([]);
  /** Puts a tag at the cursor of line i; with a closing tag, wraps the selected words instead. */
  const insert = (i: number, tag: string, close?: string) => {
    const t = lines[i].text, box = boxes.current[i];
    const a = box?.selectionStart ?? t.length, b = box?.selectionEnd ?? t.length;
    const pre = t.slice(0, a), post = t.slice(b);
    const mid = close && b > a ? `${tag}${t.slice(a, b)}${close}` : tag;
    update(i, { text: `${pre}${pre && !/\s$/.test(pre) ? ' ' : ''}${mid}${post && !/^\s/.test(post) ? ' ' : ''}${post}` });
  };
  const [previewing, setPreviewing] = useState<number | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const preview = async (i: number) => {
    setPreviewing(i);
    setPreviewError(null);
    try {
      const url = URL.createObjectURL(await api.previewLine(lines[i], ttsProvider, studioOn ? ttsEngine : undefined));
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
    } catch (e) {
      setPreviewError((e as Error).message);
    } finally {
      setPreviewing(null);
    }
  };

  return (
    <div>
      {!voiceOk && <p className="hint">Add GEMINI_API_KEY, OPENAI_API_KEY or VOICESTUDIO_URL to .env to generate voices.</p>}
      {ttsProviders.length > 1 && (
        <label className="field">Voice by{' '}
          <select aria-label="Voice by" disabled={busy} value={ttsProvider} onChange={(e) => onTtsProvider(e.target.value as TtsProvider)}>
            {ttsProviders.map((p) => <option key={p} value={p}>{TTS_PROVIDER_NAMES[p]}</option>)}
          </select>
        </label>
      )}
      {studioOn && (
        <div className="studio">
          <p className="hint" data-testid="studio-status">
            {studio === null ? 'Checking VoiceStudio…'
              : studio.running ? <><span className="ok">●</span>{` VoiceStudio ${studio.version ?? ''} running${studio.device ? ` on ${studio.device}` : ''}`}</>
              : `VoiceStudio isn't running at ${studio.url}. Start it, then `}
            {studio !== null && !studio.running && <button className="mini" onClick={refreshStudio}>check again</button>}
          </p>
          {studio?.running && studio.engines.length > 0 && (
            <label className="field">Engine{' '}
              <select aria-label="Engine" disabled={busy} value={ttsEngine} onChange={(e) => onTtsEngine(e.target.value)}>
                <option value="">Active engine (set in VoiceStudio)</option>
                {studio.engines.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
              </select>
            </label>
          )}
        </div>
      )}
      <label className="field">Voice{' '}
        <select aria-label="Voice" disabled={busy} value={voice} onChange={(e) => setLines(lines.map((l) => ({ ...l, voice: e.target.value })))}>
          {voices.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>
      </label>
      {studioOn && voices.find((v) => v.id === voice)?.kind === 'default' && (
        <label className="field">Speaker{' '}
          <select aria-label="Speaker" disabled={busy} value={lines[0]?.speaker ?? DEFAULT_SPEAKER} onChange={(e) => setLines(lines.map((l) => ({ ...l, speaker: e.target.value })))}>
            {SPEAKERS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
      )}
      {cloneOnPlainEngine && <p className="hint">{engine!.label.split(' (')[0]} can't use saved or cloned voices, so it will speak in its own voice.</p>}
      {pasted === null ? (
        <button className="btn secondary paste" disabled={busy} onClick={() => setPasted('')}>📋 Paste script</button>
      ) : (
        <div className="line-card">
          <textarea aria-label="Whole script" rows={6} value={pasted} onChange={(e) => setPasted(e.target.value)}
            placeholder="Paste a whole script. Stage directions like [expression: warm smile] or [action: waves hand gently] animate the character; they are not spoken." />
          <p className="hint">Replaces the lines below with one line per sentence, each in the voice above.</p>
          <div className="line-actions">
            <button className="btn" disabled={!pasted.trim()} onClick={() => {
              setLines(splitScript(pasted).map((text) => ({ text, voice, expression: 'neutral', gesture: 'none', ...carried(lines[0]) })));
              setPasted(null);
            }}>Use this script</button>
            <button className="btn secondary" onClick={() => setPasted(null)}>Cancel</button>
          </div>
        </div>
      )}
      {lines.map((l, i) => (
        <div key={i} className="line-card" data-testid="script-line">
          <div className="voice-bar">
            <span className="avatar" aria-hidden="true">{avatar(voices.find((v) => v.id === l.voice))}</span>
            <select aria-label="Line voice" disabled={busy} value={ids.includes(l.voice) ? l.voice : voice} onChange={(e) => update(i, { voice: e.target.value })}>
              {voices.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
            <select aria-label="Language" disabled={busy} value={l.language ?? 'auto'} onChange={(e) => update(i, { language: e.target.value === 'auto' ? undefined : e.target.value })}>
              {LANGUAGES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
            <select aria-label="Style" disabled={busy} value={l.style ?? 'normal'} onChange={(e) => update(i, { style: e.target.value === 'whisper' ? 'whisper' : undefined })}>
              <option value="normal">Normal</option>
              <option value="whisper">Whisper</option>
            </select>
            <label className="chip">Pitch <input type="number" aria-label="Pitch %" disabled={busy} min={-PITCH_RANGE} max={PITCH_RANGE} step={5} value={l.pitch ?? 0} onChange={(e) => update(i, { pitch: clamp(Number(e.target.value), PITCH_RANGE) })} />%</label>
            <label className="chip">Speed <input type="number" aria-label="Speed %" disabled={busy} min={-SPEED_RANGE} max={SPEED_RANGE} step={5} value={l.speed ?? 0} onChange={(e) => update(i, { speed: clamp(Number(e.target.value), SPEED_RANGE) })} />%</label>
            <select aria-label="Add pause" disabled={busy} value="" onChange={(e) => insert(i, e.target.value)}>
              <option value="">Add pause</option>
              {PAUSES.map((p) => <option key={p} value={p}>{p.slice(7, -1)}</option>)}
            </select>
            <select aria-label="Insert cue" disabled={busy} value="" onChange={(e) => (e.target.value in CUES ? insert(i, `[${e.target.value}]`, `[/${e.target.value}]`) : insert(i, e.target.value))}>
              <option value="">✦ Cue</option>
              <optgroup label="Delivery">{Object.keys(CUES).map((c) => <option key={c} value={c}>{c}</option>)}</optgroup>
              {soundsOk && <optgroup label="Sounds">{SOUND_TAGS.map((t) => <option key={t} value={`[${t}]`}>{t}</option>)}</optgroup>}
            </select>
            {studioOn && (
              <select aria-label="Variability" disabled={busy} value={l.variability ?? 'steady'} onChange={(e) => update(i, { variability: e.target.value === 'varied' ? 'varied' : undefined })}>
                <option value="steady">Steady takes</option>
                <option value="varied">Varied takes</option>
              </select>
            )}
            <button className="mini" aria-label="Preview line" disabled={busy || previewing !== null || !voiceOk || !l.text.trim() || (studioOn && studio?.running === false)} onClick={() => preview(i)}>{previewing === i ? '…' : '▶'}</button>
          </div>
          <div className="line-chips">
            <TagSelects busy={busy} expression={l.expression} gesture={l.gesture}
              onExpression={(expression) => update(i, { expression })} onGesture={(gesture) => update(i, { gesture })} />
            <input aria-label="Delivery note" disabled={busy} maxLength={200} placeholder="Delivery note (optional)" value={l.note ?? ''} onChange={(e) => update(i, { note: e.target.value })} />
            <button aria-label="Move up" disabled={busy || i === 0} onClick={() => move(i, -1)}>↑</button>
            <button aria-label="Move down" disabled={busy || i === lines.length - 1} onClick={() => move(i, 1)}>↓</button>
            <button aria-label="Delete line" disabled={busy || lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))}>✕</button>
          </div>
          <textarea ref={(el) => { boxes.current[i] = el; }} aria-label="Line text" disabled={busy} rows={2} maxLength={500} placeholder="What should the character say?" value={l.text} onChange={(e) => update(i, { text: e.target.value })} />
        </div>
      ))}
      <div className="line-actions">
        <button className="btn secondary" disabled={busy || lines.length >= 50} onClick={() => setLines([...lines, { text: '', voice, expression: 'neutral', gesture: 'none', ...carried(lines[lines.length - 1]) }])}>+ Line</button>
        <button className="btn" disabled={busy || !voiceOk || !ids.length || (studioOn && studio?.running === false)} title={voiceOk ? undefined : NEEDS_VOICE} onClick={onGenerate}>▶ Generate voice</button>
        <button className="btn secondary" disabled={busy || !geminiOk} title={geminiOk ? undefined : NEEDS_KEY} onClick={onAutoTag}>✨ Auto-tag expressions</button>
      </div>
      <p className="hint">
        Tip: "Add pause" and "✦ Cue" put tags in the line at the cursor, e.g. [pause 1s] or [excited]…[/excited] around selected words{soundsOk ? ', and sounds like [laughter] and [sigh]' : ''}.
        {studioOn ? ' VoiceStudio whispers for real; it has no emotions, so other cues are approximated with a little speed and pitch.' : ''}
        {' '}Powered by {TTS_PROVIDER_NAMES[ttsProvider]}{ttsProvider === 'gemini' ? ' TTS' : ''}.
      </p>
      {notice && !error && <p className="hint">{notice}</p>}
      {error && <p role="alert" className="error">{error}</p>}
      {previewError && <p role="alert" className="error">{previewError}</p>}
    </div>
  );
}

export function VoiceoverStep(props: Props) {
  const [tab, setTab] = useState<'upload' | 'script'>('upload');
  return (
    <div>
      <h2>Add a voiceover</h2>
      <div className="tabs">
        <button className={`tab${tab === 'upload' ? ' active' : ''}`} onClick={() => setTab('upload')}>⬆ Upload</button>
        <button className={`tab${tab === 'script' ? ' active' : ''}`} onClick={() => setTab('script')}>✍ Write script</button>
      </div>
      {tab === 'upload' ? <UploadTab {...props} /> : <ScriptTab {...props} />}
    </div>
  );
}
