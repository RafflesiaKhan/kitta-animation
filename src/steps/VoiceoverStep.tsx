import { useState } from 'react';
import type { Timeline } from '../../shared/types';
import * as api from '../api';

interface Props {
  onReady: (r: { audioId: string; timeline: Timeline }) => void;
  onStatus: (s: string) => void;
}

function UploadTab({ onReady, onStatus }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      onStatus('Uploading…');
      const { audioId, durationMs } = await api.uploadAudio(file);
      onStatus('Matching lips…');
      const cues = await api.lipsync(audioId);
      onReady({
        audioId,
        timeline: { durationMs, cues, lines: [{ text: '', startMs: 0, endMs: durationMs, expression: 'neutral', gesture: 'none' }] },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      onStatus('');
    }
  };

  return (
    <div>
      <label className="upload">
        <span className="btn">⬆ Upload voiceover</span>
        <input type="file" accept="audio/*" aria-label="Upload voiceover" disabled={busy} onChange={(e) => pick(e.target.files?.[0])} />
      </label>
      <p className="hint">WAV, MP3, M4A… up to 3 minutes. Your character will lip-sync to it.</p>
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  );
}

export function VoiceoverStep(props: Props) {
  return (
    <div>
      <h2>Add a voiceover</h2>
      <div className="tabs">
        <button className="tab active">⬆ Upload</button>
        <button className="tab" disabled title="Coming soon">✍ Write script</button>
      </div>
      <UploadTab {...props} />
    </div>
  );
}
