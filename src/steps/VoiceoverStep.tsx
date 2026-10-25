import { useEffect, useState } from 'react';
import { EXPRESSIONS, GESTURES } from '../../shared/types';
import type { Expression, Gesture, Line, ScriptLineInput } from '../../shared/types';
import { OPENAI_VOICES, TTS_PROVIDER_NAMES, VOICES, type TtsProvider } from '../../shared/voices';
import * as api from '../api';

interface Props {
  geminiOk: boolean; // auto-tag and transcription
  ttsProviders: TtsProvider[]; // voice providers set up on the server
  ttsProvider: TtsProvider;
  onTtsProvider: (p: TtsProvider) => void;
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

function UploadTab({ busy, error, onUpload, onAddExpressions, uploadLines, onEditUploadLine, geminiOk }: TabProps) {
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
          <button className="btn" disabled={busy || !geminiOk} title={geminiOk ? undefined : NEEDS_KEY} onClick={onAddExpressions}>✨ Add expressions</button>
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

/** The voices a provider offers; VoiceStudio's are read from the running app. */
function useVoices(provider: TtsProvider): string[] | null {
  const [studio, setStudio] = useState<string[] | null>(null);
  useEffect(() => {
    if (provider !== 'voicestudio' || studio) return;
    let live = true;
    Promise.resolve(api.voiceStudioVoices()).then((v) => { if (live) setStudio(v ?? []); }, () => { if (live) setStudio([]); });
    return () => { live = false; };
  }, [provider, studio]);
  if (provider === 'openai') return OPENAI_VOICES;
  if (provider === 'voicestudio') return studio;
  return VOICES;
}

function ScriptTab({ busy, error, scriptLines: lines, onScriptLines: setLines, onGenerate, onAutoTag, geminiOk, ttsProviders, ttsProvider, onTtsProvider }: TabProps) {
  const voiceOk = ttsProviders.length > 0;
  const loaded = useVoices(ttsProvider);
  // A VoiceStudio that lists nothing still gets one voice to try (its OpenAI-compatible default).
  const voices = loaded === null ? [] : loaded.length ? loaded : ['alloy'];
  const update = (i: number, patch: Partial<ScriptLineInput>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const move = (i: number, d: number) => {
    const next = [...lines];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setLines(next);
  };
  const voice = lines[0]?.voice && voices.includes(lines[0].voice) ? lines[0].voice : voices[0] ?? VOICES[0];
  // Switching provider (or VoiceStudio's list arriving) moves every line to a voice that provider has.
  useEffect(() => {
    if (voices.length && lines.some((l) => l.voice !== voice)) setLines(lines.map((l) => ({ ...l, voice })));
  }, [voice, voices.length]);

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
      {ttsProvider === 'voicestudio' && loaded !== null && loaded.length === 0 && (
        <p className="hint">Couldn't list VoiceStudio's voices. Is it running? Trying its default voice.</p>
      )}
      <label className="field">Voice{' '}
        <select aria-label="Voice" disabled={busy} value={voice} onChange={(e) => setLines(lines.map((l) => ({ ...l, voice: e.target.value })))}>
          {voices.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </label>
      {lines.map((l, i) => (
        <div key={i} className="line-card" data-testid="script-line">
          <div className="line-chips">
            <TagSelects busy={busy} expression={l.expression} gesture={l.gesture}
              onExpression={(expression) => update(i, { expression })} onGesture={(gesture) => update(i, { gesture })} />
            <input aria-label="Delivery note" disabled={busy} maxLength={200} placeholder="Delivery note (optional)" value={l.note ?? ''} onChange={(e) => update(i, { note: e.target.value })} />
            <button aria-label="Move up" disabled={busy || i === 0} onClick={() => move(i, -1)}>↑</button>
            <button aria-label="Move down" disabled={busy || i === lines.length - 1} onClick={() => move(i, 1)}>↓</button>
            <button aria-label="Delete line" disabled={busy || lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))}>✕</button>
          </div>
          <textarea aria-label="Line text" disabled={busy} rows={2} maxLength={500} placeholder="What should the character say?" value={l.text} onChange={(e) => update(i, { text: e.target.value })} />
        </div>
      ))}
      <div className="line-actions">
        <button className="btn" disabled={busy || lines.length >= 50} onClick={() => setLines([...lines, { text: '', voice, expression: 'neutral', gesture: 'none' }])}>+ Line</button>
        <button className="btn" disabled={busy || !voiceOk || !voices.length} title={voiceOk ? undefined : NEEDS_VOICE} onClick={onGenerate}>▶ Generate voice</button>
        <button className="btn" disabled={busy || !geminiOk} title={geminiOk ? undefined : NEEDS_KEY} onClick={onAutoTag}>✨ Auto-tag expressions</button>
      </div>
      <p className="hint">Tip: add tags like &lt;short pause&gt; inside a line. Powered by {TTS_PROVIDER_NAMES[ttsProvider]}{ttsProvider === 'gemini' ? ' TTS' : ''}.</p>
      {error && <p role="alert" className="error">{error}</p>}
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
