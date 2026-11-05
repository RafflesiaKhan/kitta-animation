import type { SceneSample } from './SceneView';

export interface SavedSample {
  scene: SceneSample;
  audioUrl: string;
  videoUrl: string;
  renderMs: number;
}

export interface ProjectAsset {
  id: string;
  name: string;
  kind: 'image' | 'svg' | 'audio' | 'character';
  mime?: string;
  characterId?: string;
}

export interface Episode {
  id: string;
  title: string;
  scene?: { id: string; sample: SavedSample };
}

export interface Project {
  id: string;
  name: string;
  premise: string;
  assets: ProjectAsset[];
  episodes: Episode[];
}
