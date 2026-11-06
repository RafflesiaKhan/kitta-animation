import type { SavedActor, SavedScene, Scene } from './scene';
import type { Expression, Gesture, MouthCue, Timeline } from './types';

import type { TtsProvider } from './voices';

export type ProjectStyle = 'svg' | 'ai';

export interface MediaAsset {
  id: string;
  name: string;
  kind: 'image' | 'svg' | 'audio';
  mime: string;
  location: string;
  provenance: 'imported' | 'first-scene';
}

export interface CharacterAsset {
  id: string;
  name: string;
  kind: 'character';
  characterId: string;
  provenance: 'saved-character';
}

export type ProjectAsset = MediaAsset | CharacterAsset;

export interface ProjectScene extends Omit<SavedScene, 'audioId' | 'background' | 'actors'> {
  id: string;
  audioAssetId: string;
  backgroundAssetId: string;
  actors: (Omit<SavedActor, 'timeline'> & { timeline: Omit<Timeline, 'cues'> & { cues: (MouthCue & { id: string })[] } })[];
}

export interface ProjectVoice {
  provider: TtsProvider;
  voice: string;
  engine: string;
  speaker: string;
  variability: 'steady' | 'varied';
}

export interface ProjectCharacterInput {
  name: string;
  anchorY: number;
  voice: ProjectVoice;
  character: SavedActor['character'];
}

export interface ProjectCharacter extends ProjectCharacterInput {
  id: string;
}

export interface EpisodeSceneInput {
  characterId: string;
  backgroundAssetId: string;
  expression: Expression;
  gesture: Gesture;
  x: number;
  scale: number;
  groundY: number;
}

export interface EpisodeScene extends EpisodeSceneInput {
  id: string;
}

export interface ProjectScenePreview {
  scene: Scene;
  audioUrl: string | null;
}

export interface Episode {
  id: string;
  title: string;
  projectScene?: ProjectScene | EpisodeScene;
}

export interface Project {
  id: string;
  name: string;
  premise: string;
  style: ProjectStyle;
  createdAt?: string;
  assets: ProjectAsset[];
  characters?: ProjectCharacter[];
  episodes: Episode[];
}
