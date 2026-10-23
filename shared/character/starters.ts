import type { CharacterConfig, StarterId } from '../types';

export const STARTERS: Record<StarterId, CharacterConfig & { name: string }> = {
  kit: { name: 'Kit', starter: 'kit', skin: '#ffd23f', hairStyle: 'spiky', hairColor: '#4a2c2a', eyeStyle: 'dot', outfit: 'tshirt', outfitColor: '#3a86ff' },
  milo: { name: 'Milo', starter: 'milo', skin: '#e0ac69', hairStyle: 'curly', hairColor: '#2b2b2b', eyeStyle: 'glasses', outfit: 'hoodie', outfitColor: '#2a9d8f' },
  pip: { name: 'Pip', starter: 'pip', skin: '#f4a259', hairStyle: 'spiky', hairColor: '#c8553d', eyeStyle: 'round', outfit: 'overalls', outfitColor: '#8e7dbe' },
};

export const OPTIONS = {
  hairStyles: ['spiky', 'bob', 'curly'],
  eyeStyles: ['dot', 'round', 'glasses'],
  outfits: ['tshirt', 'hoodie', 'overalls'],
};
