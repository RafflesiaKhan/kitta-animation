import { createElement, type ReactNode } from 'react';
import { CharacterView } from './character/CharacterView';
import type { AnyCharacter, CharacterPlacement, FrameState, StudioBackground } from './types';

export interface StudioFrameProps {
  character: AnyCharacter;
  frame: FrameState;
  width: number;
  height: number;
  placement: CharacterPlacement;
  background: StudioBackground;
  picture?: string;
  characterPicture?: string;
  resolve?: (file: string) => string;
  clockMs?: number;
  frameSource?: (ms: number) => FrameState;
}

/** The single studio composition path used by browser preview and server export. */
export function StudioFrame({ character, frame, width, height, placement, background, picture, characterPicture, resolve, clockMs, frameSource }: StudioFrameProps) {
  const size = Math.round(height * 0.8 * placement.scale);
  const x = Math.round(width * placement.x - size / 2);
  const y = Math.round(height - placement.bottom * height - size);
  const bg: ReactNode = background.kind === 'color'
    ? createElement('rect', { 'data-part': 'background', width, height, fill: background.color })
    : background.kind === 'picture' && picture
      ? createElement('image', { 'data-part': 'background', width, height, href: picture, preserveAspectRatio: 'xMidYMid slice' })
      : createElement('rect', { 'data-part': 'background', width, height, fill: background.kind === 'picture' ? '#fbe6e7' : 'transparent', 'data-background-missing': background.kind === 'picture' ? 'true' : undefined });
  const child = createElement(CharacterView, {
    config: character, frame, width: size, height: size, resolve, picture: characterPicture, clockMs, frameSource,
  });
  return createElement('svg', { xmlns: 'http://www.w3.org/2000/svg', width, height, viewBox: `0 0 ${width} ${height}`, 'data-part': 'studio-frame' },
    bg,
    createElement('g', { transform: placement.flip ? `translate(${x + size} ${y}) scale(-1 1)` : `translate(${x} ${y})`, 'data-part': 'placed-character' }, child));
}
