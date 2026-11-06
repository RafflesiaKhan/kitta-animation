import { useEffect, useRef, useState } from 'react';
import { cameraAt, type Scene } from '../shared/scene';
import { SceneView } from '../shared/SceneView';
import { getScene } from './api';

// Plays a saved scene with its sound. As in Preview, the <audio> element is the only clock, read every animation
// frame; unlike Preview, a paused scene holds still, so it can be compared with a frame of the exported video.
export function ScenePreview({ name }: { name: string }) {
  const [scene, setScene] = useState<Scene | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getScene(name).then(setScene, (e: Error) => setError(e.message));
  }, [name]);

  if (error) return <div className="preview" role="alert">{error}</div>;
  if (!scene) return <div className="preview">Loading scene…</div>;
  return <ScenePlayer scene={scene} audioUrl={'/api/audio/' + scene.audioId} />;
}

export function ScenePlayer({ scene, audioUrl }: { scene: Scene; audioUrl: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [ms, setMs] = useState(0);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setMs((audioRef.current?.currentTime ?? 0) * 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scene]);

  return (
    <div className="preview">
      <div className="preview-head"><span>{scene.title}</span><span className="ready">{cameraAt(scene, ms).name}</span></div>
      <SceneView scene={scene} ms={ms} width={960} height={540} />
      <audio ref={audioRef} src={audioUrl} controls />
    </div>
  );
}
