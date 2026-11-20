import type { AnyCharacter, FrameState } from '../types';
import { isArt } from '../types';
import { Character } from './Character';
import { ArtCharacterView } from './ArtCharacter';

export interface CharacterViewProps { config: AnyCharacter; frame: FrameState; width?: number; height?: number; resolve?: (file: string) => string }

/** Draws either kind of character: the customisable SVG rig or an AI-painted one. */
export function CharacterView({ config, resolve, ...rest }: CharacterViewProps) {
  return isArt(config) ? <ArtCharacterView character={config} resolve={resolve} {...rest} /> : <Character config={config} {...rest} />;
}
