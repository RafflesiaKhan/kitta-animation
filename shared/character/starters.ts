import type { CharacterConfig, StarterId } from '../types';

export const STARTERS: Record<StarterId, CharacterConfig & { name: string }> = {
  kit: { name: 'Kit', starter: 'kit', skin: '#ffd23f', hairStyle: 'spiky', hairColor: '#4a2c2a', eyeStyle: 'dot', outfit: 'tshirt', outfitColor: '#3a86ff' },
  milo: { name: 'Milo', starter: 'milo', skin: '#e0ac69', hairStyle: 'curly', hairColor: '#2b2b2b', eyeStyle: 'glasses', outfit: 'hoodie', outfitColor: '#2a9d8f' },
  pip: { name: 'Pip', starter: 'pip', skin: '#f4a259', hairStyle: 'spiky', hairColor: '#c8553d', eyeStyle: 'round', outfit: 'overalls', outfitColor: '#8e7dbe' },
  kai: { name: 'Kai', starter: 'kai', skin: '#ffc485', hairStyle: 'spiky', hairColor: '#302b32', eyeStyle: 'round', outfit: 'hoodie', outfitColor: '#eb8026' },
  ira: { name: 'Ira', starter: 'ira', skin: '#f8bf83', hairStyle: 'bob', hairColor: '#fff0d0', eyeStyle: 'round', outfit: 'hoodie', outfitColor: '#36343a' },
  rohan: { name: 'Rohan', starter: 'rohan', skin: '#f3bf8c', hairStyle: 'curly', hairColor: '#3d3532', eyeStyle: 'round', outfit: 'hoodie', outfitColor: '#267e80' },
  baba: { name: 'Baba', starter: 'baba', skin: '#dba266', hairStyle: 'curly', hairColor: '#453127', eyeStyle: 'glasses', outfit: 'tshirt', outfitColor: '#454449' },
  mochi: { name: 'Mochi', starter: 'mochi', skin: '#ffb539', hairStyle: 'spiky', hairColor: '#c77d27', eyeStyle: 'round', outfit: 'tshirt', outfitColor: '#ffb539' },
};

export const OPTIONS = {
  hairStyles: ['spiky', 'bob', 'curly'],
  eyeStyles: ['dot', 'round', 'glasses'],
  outfits: ['tshirt', 'hoodie', 'overalls'],
};
