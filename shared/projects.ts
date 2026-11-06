import type { SavedActor, SavedScene, Scene } from './scene';
import type { MouthCue, Timeline } from './types';

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

export interface ProjectScenePreview {
  scene: Scene;
  audioUrl: string;
}

export interface Episode {
  id: string;
  title: string;
  projectScene?: ProjectScene;
}

export interface Project {
  id: string;
  name: string;
  premise: string;
  style: ProjectStyle;
  createdAt?: string;
  assets: ProjectAsset[];
  episodes: Episode[];
}
