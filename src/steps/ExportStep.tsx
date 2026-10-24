import { useState } from 'react';
import type { AnyCharacter, ExportFormat, Timeline } from '../../shared/types';
import * as api from '../api';

interface Props { character: AnyCharacter; timeline: Timeline | null; audioId: string | null }

export function ExportStep({ character, timeline, audioId }: Props) {
  const [aspect, setAspect] = useState<ExportFormat['aspect']>('16:9');
  const [transparent, setTransparent] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const exporting = progress !== null;
  const ready = timeline !== null && audioId !== null;

  const start = async () => {
    if (!timeline || !audioId) return;
    setError(null);
    setUrl(null);
    setProgress(0);
    try {
      setUrl(await api.exportVideo({ character, timeline, audioId, format: { aspect, transparent } }, setProgress));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  };

  return (
    <div>
      <h2>Export</h2>
      <div className="tabs" role="group" aria-label="Aspect ratio">
        <button className={`tab${aspect === '16:9' ? ' active' : ''}`} aria-pressed={aspect === '16:9'} onClick={() => setAspect('16:9')}>Landscape 16:9</button>
        <button className={`tab${aspect === '9:16' ? ' active' : ''}`} aria-pressed={aspect === '9:16'} onClick={() => setAspect('9:16')}>Vertical 9:16</button>
      </div>
      <label>
        <input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} /> Transparent background (WebM)
      </label>
      <p>
        <button className="btn" disabled={!ready || exporting} onClick={start}>Export video</button>
        {!ready && <span className="hint"> Add a voiceover first</span>}
      </p>
      {exporting && <progress value={Math.round(progress * 100)} max={100} aria-label="Export progress" />}
      {exporting && <span> {Math.round(progress * 100)}%</span>}
      {url && <p><a className="btn" href={url} download>⬇ Download video</a></p>}
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  );
}
