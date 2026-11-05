export type ProjectStyle = 'svg' | 'ai';

export interface MediaAsset {
  id: string;
  name: string;
  kind: 'image' | 'svg' | 'audio';
  mime: string;
  location: string;
  provenance: 'imported';
}

export interface CharacterAsset {
  id: string;
  name: string;
  kind: 'character';
  characterId: string;
  provenance: 'saved-character';
}

export type ProjectAsset = MediaAsset | CharacterAsset;

export interface Episode {
  id: string;
  title: string;
}

export interface Project {
  id: string;
  name: string;
  premise: string;
  style: ProjectStyle;
  assets: ProjectAsset[];
  episodes: Episode[];
}
