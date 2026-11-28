import type { AnyCharacter, FrameState } from '../types';
import { isArt, isSvgRig, isVector } from '../types';
import { Character } from './Character';
import { ArtCharacterView } from './ArtCharacter';
import { VectorCharacterView } from './VectorCharacter';
import { SvgRigCharacterView } from './SvgRigCharacter';
import type { FrameSource } from '../vector-avator/stage';

export interface CharacterViewProps {
  config: AnyCharacter; frame: FrameState; width?: number; height?: number; resolve?: (file: string) => string;
  /** Vector characters only: the actor's idle clock in ms, and (export) the picture already drawn for this frame. */
  clockMs?: number; picture?: string;
  /** Vector characters in the browser: the frame at any idle-clock time, so a scrub replays the motion before it. */
  frameSource?: FrameSource;
  /** Vector characters in browser tiles: `face` shows the head close up. */
  framing?: 'body' | 'face';
}

/** Draws any kind of character: the customisable SVG rig, an AI-painted one or a vector-avator one. */
export function CharacterView({ config, resolve, clockMs, picture, frameSource, framing, ...rest }: CharacterViewProps) {
  if (isSvgRig(config)) return <SvgRigCharacterView character={config} {...rest} />;
  if (isVector(config)) return <VectorCharacterView character={config} clockMs={clockMs} frameSource={frameSource} picture={picture} framing={framing} {...rest} />;
  return isArt(config) ? <ArtCharacterView character={config} resolve={resolve} {...rest} /> : <Character config={config} {...rest} />;
}
