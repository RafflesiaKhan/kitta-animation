import type { AnyCharacter, FrameState } from '../types';
import { isArt, isVector } from '../types';
import { Character } from './Character';
import { ArtCharacterView } from './ArtCharacter';
import { VectorCharacterView } from './VectorCharacter';
import type { FrameSource } from '../vector-avator/stage';

export interface CharacterViewProps {
  config: AnyCharacter; frame: FrameState; width?: number; height?: number; resolve?: (file: string) => string;
  /** Vector characters only: the actor's idle clock in ms, and (export) the picture already drawn for this frame. */
  clockMs?: number; picture?: string;
  /** Vector characters in the browser: the frame at any idle-clock time, so a scrub replays the motion before it. */
  frameSource?: FrameSource;
}

/** Draws any kind of character: the customisable SVG rig, an AI-painted one or a vector-avator one. */
export function CharacterView({ config, resolve, clockMs, picture, frameSource, ...rest }: CharacterViewProps) {
  if (isVector(config)) return <VectorCharacterView character={config} clockMs={clockMs} frameSource={frameSource} picture={picture} {...rest} />;
  return isArt(config) ? <ArtCharacterView character={config} resolve={resolve} {...rest} /> : <Character config={config} {...rest} />;
}
