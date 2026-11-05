import { STARTERS } from './character/starters';
import { CharacterView } from './character/CharacterView';
import { frameAt } from './timeline';
import type { Timeline } from './types';

export interface SceneSample {
  durationMs: number;
  reactionStartMs: number;
  speakerStartMs: number;
  mina: Timeline;
  rafi: Timeline;
}

export function SceneView({ scene, ms, width = 960, height = 540 }: {
  scene: SceneSample;
  ms: number;
  width?: number;
  height?: number;
}) {
  const shot = ms >= scene.reactionStartMs ? '145 135 480 270'
    : ms >= scene.speakerStartMs ? '355 135 480 270' : '0 0 960 540';

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox={shot}
      role="img" aria-label="Mina and Rafi at the mango stall">
      <rect width="960" height="540" fill="#f7d29a" />
      <circle cx="784" cy="100" r="47" fill="#fff1bf" />
      <path d="M0 296 Q150 114 341 272 Q525 121 710 252 Q848 152 960 232 V540H0Z" fill="#a3a97e" />
      <path d="M0 365 Q475 312 960 357V540H0Z" fill="#dbad7d" />
      <path d="M131 439V194H829V439" fill="#cc9871" stroke="#6b433b" strokeWidth="10" />
      <path d="M93 196 159 103H799L866 196Z" fill="#a54e45" />
      <path d="M212 103h61l-40 93h-72zm155 0h60l-12 93h-73zm158 0h62l29 93h-72zm159 0h59l58 93h-73z" fill="#f3d3a2" />
      <path d="M93 196H866V217H93Z" fill="#7e3a3a" />
      <g transform="translate(215 195)">
        <CharacterView config={STARTERS.pip} frame={frameAt(scene.mina, ms)} width={320} height={320} />
      </g>
      <g transform="translate(455 195)">
        <CharacterView config={STARTERS.milo} frame={frameAt(scene.rafi, ms, 1730)} width={320} height={320} />
      </g>
      <path d="M132 430H830V540H132Z" fill="#9b614c" />
      <path d="M119 420H843V439H119Z" fill="#734638" />
      <path d="M452 395h78l-12 25h-54z" fill="#d9aa69" stroke="#6b433b" strokeWidth="4" />
      <path d="M462 404h57m-53 8h49" stroke="#9e6a45" strokeWidth="3" />
    </svg>
  );
}
