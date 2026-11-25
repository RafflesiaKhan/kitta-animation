import { useState } from 'react';
import type { AnyCharacter, ExportFormat, StudioComposition, Timeline } from '../../shared/types';
import { isArt, isVector } from '../../shared/types';
import { STARTERS } from '../../shared/character/starters';
import * as api from '../api';
import { Icon } from '../Icon';

interface Props { character: AnyCharacter; timeline: Timeline | null; audioId: string | null; composition?: StudioComposition; aspect?: ExportFormat['aspect']; onAspect?: (aspect: ExportFormat['aspect']) => void }

export function ExportStep({ character, timeline, audioId, composition: supplied, aspect: controlledAspect, onAspect }: Props) {
  const composition = supplied ?? { background: { kind: 'transparent' } as const, placement: { x: .5, bottom: 0, scale: 1, flip: false } };
  const [localAspect, setLocalAspect] = useState<ExportFormat['aspect']>('16:9');
  const aspect = controlledAspect ?? localAspect;
  const setAspect = onAspect ?? setLocalAspect;
  const [transparent, setTransparent] = useState(false);
  const [container, setContainer] = useState<NonNullable<ExportFormat['container']>>('webm');
  const [progress, setProgress] = useState<number | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const exporting = progress !== null;
  const missingPicture = composition.background.kind === 'picture' && !composition.background.id;
  const ready = timeline !== null && audioId !== null && !missingPicture;
  const effectiveTransparent = composition.background.kind === 'transparent' && transparent;

  const start = async () => {
    if (!timeline || !audioId) return;
    setError(null);
    setUrl(null);
    setProgress(0);
    try {
      const legacy = composition.background.kind === 'transparent' && composition.placement.x === .5 && composition.placement.bottom === 0 && composition.placement.scale === 1 && !composition.placement.flip;
      setUrl(await api.exportVideo({ character, timeline, audioId, format: { aspect, transparent: effectiveTransparent, ...(effectiveTransparent && container !== 'webm' ? { container } : {}) }, ...(legacy && container === 'webm' ? {} : { composition }) }, setProgress));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  };

  return (
    <div>
      <p className="eyebrow">Step 4</p>
      <h2>Export</h2>
      <div className="formats" role="group" aria-label="Aspect ratio">
        <button className={`format${aspect === '16:9' ? ' active' : ''}`} aria-pressed={aspect === '16:9'} onClick={() => setAspect('16:9')}>
          <span className="shape wide" /><span><strong>Landscape</strong> <span className="hint">16:9</span></span>
        </button>
        <button className={`format${aspect === '9:16' ? ' active' : ''}`} aria-pressed={aspect === '9:16'} onClick={() => setAspect('9:16')}>
          <span className="shape tall" /><span><strong>Vertical</strong> <span className="hint">9:16</span></span>
        </button>
      </div>
      <label className="check-card">
        <input type="checkbox" disabled={composition.background.kind !== 'transparent'} checked={transparent && composition.background.kind === 'transparent'} onChange={(e) => setTransparent(e.target.checked)} /> Transparent background
      </label>
      {transparent && composition.background.kind === 'transparent' && <div className="formats" role="group" aria-label="Transparent container">
        <button className={`format${container === 'webm' ? ' active' : ''}`} onClick={() => setContainer('webm')}><span><strong>WebM</strong><span className="hint"> Browsers, CapCut, DaVinci Resolve</span></span></button>
        <button className={`format${container === 'mov' ? ' active' : ''}`} onClick={() => setContainer('mov')}><span><strong>MOV, ProRes 4444</strong><span className="hint"> Premiere, Final Cut, After Effects</span></span></button>
      </div>}
      {composition.background.kind !== 'transparent' && <p className="hint">Transparent export is unavailable while a colour or picture is selected.</p>}
      <dl className="facts">
        <div><dt>Character</dt><dd>{isArt(character) || isVector(character) ? character.name : STARTERS[character.starter].name}</dd></div>
        <div><dt>Length</dt><dd>{timeline ? `${Math.round(timeline.durationMs / 1000)} s` : 'No voiceover yet'}</dd></div>
        <div><dt>Size</dt><dd>{aspect === '16:9' ? '1920 × 1080' : '1080 × 1920'}</dd></div>
        <div><dt>File</dt><dd>{effectiveTransparent ? (container === 'mov' ? 'MOV' : 'WebM') : 'MP4'}</dd></div>
      </dl>
      <p>
        <button className="btn" disabled={!ready || exporting} onClick={start}>Export video</button>
        {!ready && (missingPicture ? <span className="hint"> Upload a picture first</span> : <span className="hint"> Add a voiceover first</span>)}
      </p>
      {exporting && (
        <div className="progress-card">
          <div><span>Rendering…</span> <span>{Math.round(progress * 100)}%</span></div>
          <progress value={Math.round(progress * 100)} max={100} aria-label="Export progress" />
        </div>
      )}
      {url && <p><a className="btn" href={url} download><Icon name="download" /> Download video</a></p>}
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  );
}
