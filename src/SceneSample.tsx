import { useEffect, useRef, useState } from 'react';
import { SceneView } from '../shared/SceneView';
import type { SavedSample } from '../shared/projects';
import script from '../shared/scene-sample.json';

export function SceneSample({ endpoint = '/api/scene-sample', initialSample, episodeTitle, onBack }: {
  endpoint?: string;
  initialSample?: SavedSample;
  episodeTitle?: string;
  onBack?: () => void;
}) {
  const [sample, setSample] = useState<SavedSample | null>(initialSample ?? null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [ms, setMs] = useState(0);
  const audio = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (!sample) return;
    let raf = 0;
    const tick = () => {
      setMs((audio.current?.currentTime ?? 0) * 1000);
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [sample]);

  async function generate() {
    setBusy(true);
    setStatus('Recording with VoiceStudio and rendering the MP4…');
    try {
      const response = await fetch(endpoint, { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Unable to create the scene');
      setMs(0);
      setSample(result);
      setStatus('MP4 rendered in ' + (result.renderMs / 1000).toFixed(1) + ' seconds.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to create the scene');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <header><div className="brand"><h1>{episodeTitle ?? script.title}</h1><span className="tagline">Two-character scene sample</span></div>{onBack ? <button className="pill" onClick={onBack}>Back to episode list</button> : <a className="pill" href="/">Back to projects</a>}</header>
      <main>
        <section className="panel">
          <h2>Dialogue</h2>
          <ol>{script.lines.map(line => <li key={line.text}><strong>{line.actor === 'mina' ? 'Mina' : 'Rafi'}</strong> · {line.text}</li>)}</ol>
          <p>Wide shot, Rafi close-up, then Mina’s reaction.</p>
          {(!episodeTitle || !sample) && <button type="button" disabled={busy} onClick={generate}>{episodeTitle ? "Generate and save scene with VoiceStudio" : "Generate scene with VoiceStudio"}</button>}
          <p role="status">{status || (initialSample ? "Saved scene · " + script.title : "")}</p>
          {sample && <a href={sample.videoUrl} download>Download MP4</a>}
        </section>
        {sample && (
          <section className="preview">
            <div className="preview-head"><span>Scene preview</span></div>
            <div className="stage"><SceneView scene={sample.scene} ms={ms} width={960} height={540} /></div>
            <audio ref={audio} src={sample.audioUrl} controls />
            <h2>Rendered MP4</h2>
            <video controls src={sample.videoUrl} style={{ width: '100%' }} />
          </section>
        )}
      </main>
    </div>
  );
}
