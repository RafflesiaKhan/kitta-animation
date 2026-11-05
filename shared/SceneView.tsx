import { STAGE_W, STAGE_H, cameraAt, type Scene } from './scene';
import { frameAt } from './timeline';
import { CharacterView } from './character/CharacterView';
import { isArt } from './types';

export interface SceneViewProps { scene: Scene; ms: number; width?: number; height?: number; resolve?: (characterId: string, file: string) => string }

/** Draws a whole scene at one millisecond: the set, then every actor, inside the current shot's camera. Shared by preview and export. */
export function SceneView({ scene, ms, width = STAGE_W, height = STAGE_H, resolve }: SceneViewProps) {
  const cam = cameraAt(scene, ms);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${STAGE_W} ${STAGE_H}`} width={width} height={height}>
      <g data-part="camera" transform={`translate(${cam.x} ${cam.y}) scale(${cam.zoom})`}>
        <image data-part="set" href={scene.background} width={STAGE_W} height={STAGE_H} />
        {scene.actors.map((a) => {
          const box = Math.round(STAGE_H * 0.8 * a.scale);
          const place = `translate(${a.x * STAGE_W - box / 2} ${STAGE_H - box})${a.flip ? ` translate(${box} 0) scale(-1 1)` : ''}`;
          const c = a.character;
          const pick = resolve && isArt(c) ? (file: string) => resolve(c.id, file) : undefined;
          return (
            <g key={a.id} data-actor={a.id} transform={place}>
              <CharacterView config={a.character} frame={frameAt(a.timeline, ms, a.idleOffsetMs)} width={box} height={box} resolve={pick} />
            </g>
          );
        })}
      </g>
    </svg>
  );
}
