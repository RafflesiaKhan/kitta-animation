import { useEffect, useState } from 'react';
import { EXPRESSIONS, GESTURES } from '../../shared/types';
import type { ScriptLineInput } from '../../shared/types';
import { VOICES } from '../../shared/voices';
import * as api from '../api';

interface Props {
  busy: boolean;
  error: string | null;
  onUpload: (file: File) => void;
  scriptLines: ScriptLineInput[];
  onScriptLines: (lines: ScriptLineInput[]) => void;
  onGenerate: () => void;
}

function UploadTab({ busy, error, onUpload }: Props) {
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
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  );
}

function ScriptTab({ busy, error, scriptLines: lines, onScriptLines: setLines, onGenerate }: Props) {
  const [geminiOk, setGeminiOk] = useState(true);
  useEffect(() => {
    Promise.resolve(api.health()).then((h) => setGeminiOk(h?.gemini !== false), () => {});
  }, []);

  const update = (i: number, patch: Partial<ScriptLineInput>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const move = (i: number, d: number) => {
    const next = [...lines];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setLines(next);
  };
  const voice = lines[0]?.voice ?? VOICES[0];

  return (
    <div>
      {!geminiOk && <p className="hint">Add GEMINI_API_KEY to .env to generate voices.</p>}
      <label className="field">Voice{' '}
        <select aria-label="Voice" value={voice} onChange={(e) => setLines(lines.map((l) => ({ ...l, voice: e.target.value })))}>
          {VOICES.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </label>
      {lines.map((l, i) => (
        <div key={i} className="line-card" data-testid="script-line">
          <div className="line-chips">
            <select aria-label="Expression" value={l.expression} onChange={(e) => update(i, { expression: e.target.value as ScriptLineInput['expression'] })}>
              {EXPRESSIONS.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
            <select aria-label="Gesture" value={l.gesture} onChange={(e) => update(i, { gesture: e.target.value as ScriptLineInput['gesture'] })}>
              {GESTURES.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
            <input aria-label="Delivery note" placeholder="Delivery note (optional)" value={l.note ?? ''} onChange={(e) => update(i, { note: e.target.value })} />
            <button aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
            <button aria-label="Move down" disabled={i === lines.length - 1} onClick={() => move(i, 1)}>↓</button>
            <button aria-label="Delete line" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))}>✕</button>
          </div>
          <textarea aria-label="Line text" rows={2} maxLength={500} placeholder="What should the character say?" value={l.text} onChange={(e) => update(i, { text: e.target.value })} />
        </div>
      ))}
      <div className="line-actions">
        <button className="btn" disabled={lines.length >= 50} onClick={() => setLines([...lines, { text: '', voice, expression: 'neutral', gesture: 'none' }])}>+ Line</button>
        <button className="btn" disabled={busy} onClick={onGenerate}>▶ Generate voice</button>
      </div>
      <p className="hint">Tip: add tags like &lt;short pause&gt; inside a line. Powered by Gemini TTS.</p>
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
