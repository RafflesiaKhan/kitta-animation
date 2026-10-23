import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Preview } from '../../src/Preview';
import { STARTERS } from '../../shared/character/starters';
import type { Timeline } from '../../shared/types';

const { name: _n, ...kit } = STARTERS.kit;
const timeline: Timeline = {
  durationMs: 1000,
  cues: [{ startMs: 0, endMs: 400, shape: 'X' }, { startMs: 400, endMs: 800, shape: 'C' }, { startMs: 800, endMs: 1000, shape: 'X' }],
  lines: [{ text: '', startMs: 0, endMs: 1000, expression: 'neutral', gesture: 'none' }],
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });

it('draws the mouth shape of the cue at audio.currentTime', () => {
  const { container } = render(<Preview character={kit} timeline={timeline} audioUrl="/a.wav" />);
  const audio = container.querySelector('audio')!;
  audio.currentTime = 0.5;
  act(() => { vi.advanceTimersByTime(50); });
  expect(container.querySelector('[data-part=mouth]')!.getAttribute('data-shape')).toBe('C');
  audio.currentTime = 0.1;
  act(() => { vi.advanceTimersByTime(50); });
  expect(container.querySelector('[data-part=mouth]')!.getAttribute('data-shape')).toBe('X');
});

it('idles with a closed mouth when there is no timeline', () => {
  const { container } = render(<Preview character={kit} timeline={null} audioUrl={null} />);
  act(() => { vi.advanceTimersByTime(50); });
  expect(container.querySelector('[data-part=mouth]')!.getAttribute('data-shape')).toBe('X');
  expect(container.querySelector('audio')).toBeNull();
});

it('keeps blinking/breathing on the wall clock while the audio is paused', () => {
  const { container } = render(<Preview character={kit} timeline={timeline} audioUrl="/a.wav" />);
  const bob = () => container.querySelector('[data-part=character]')!.getAttribute('transform');
  act(() => { vi.advanceTimersByTime(50); });
  const first = bob();
  act(() => { vi.advanceTimersByTime(600); });
  expect(bob()).not.toBe(first);
});
