import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AnimateStep } from '../../src/steps/AnimateStep';
import { STARTERS } from '../../shared/character/starters';
import type { Marks, Timeline } from '../../shared/types';

const { name: _n, ...kit } = STARTERS.kit;
const timeline: Timeline = {
  durationMs: 4000,
  cues: [],
  lines: [
    { text: 'one', startMs: 100, endMs: 1000, expression: 'happy', gesture: 'wave' },
    { text: 'two', startMs: 2000, endMs: 3000, expression: 'sad', gesture: 'nod' },
  ],
};

let audio: HTMLAudioElement;
const setup = (t: Timeline | null = timeline) => {
  const audioRef = createRef<HTMLAudioElement>() as { current: HTMLAudioElement };
  audioRef.current = audio;
  const onMarks = vi.fn<(m: Marks) => void>();
  render(<AnimateStep character={kit} timeline={t} audioUrl={t ? '/api/audio/a' : null} audioRef={audioRef} onMarks={onMarks} />);
  return onMarks;
};

beforeEach(() => {
  audio = document.createElement('audio');
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline')))); // waveform falls back to a flat bar
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('starts from the lines: script, expression blocks and action clips', () => {
  setup();
  expect(screen.getByTestId('row-script').textContent).toContain('one');
  expect(screen.getByTestId('row-script').textContent).toContain('two');
  expect(screen.getByTestId('row-expression').querySelectorAll('[data-mark]')).toHaveLength(3);
  expect(screen.getByTestId('row-actions').querySelectorAll('[data-mark]')).toHaveLength(2);
  expect(screen.getByRole('button', { name: 'sad at 0:02.0' })).toBeTruthy();
});

it('clicking a palette expression adds it at the playhead', () => {
  const onMarks = setup();
  audio.currentTime = 1.5;
  fireEvent.click(screen.getByRole('button', { name: 'Add angry' }));
  expect(onMarks.mock.calls[0][0].expressions).toContainEqual({ startMs: 1500, expression: 'angry' });
});

it('clicking a palette action adds a clip at the playhead, cut short by the next one', () => {
  const onMarks = setup();
  audio.currentTime = 1.5;
  fireEvent.click(screen.getByRole('button', { name: 'Add shrug' }));
  expect(onMarks.mock.calls[0][0].actions).toContainEqual({ startMs: 1500, endMs: 2000, gesture: 'shrug' });
});

it('deletes the selected block with the Delete key, but never the first expression', () => {
  const onMarks = setup();
  const sad = screen.getByRole('button', { name: 'sad at 0:02.0' });
  fireEvent.pointerDown(sad, { clientX: 0 });
  fireEvent.keyDown(sad, { key: 'Delete' });
  expect(onMarks.mock.calls.at(-1)![0].expressions.map((e) => e.expression)).toEqual(['neutral', 'happy']);
  const first = screen.getByRole('button', { name: 'neutral at 0:00.0' });
  fireEvent.pointerDown(first, { clientX: 0 });
  const calls = onMarks.mock.calls.length;
  fireEvent.keyDown(first, { key: 'Delete' });
  expect(onMarks.mock.calls.length).toBe(calls);
});

it('dropping an action on the timeline places it where it was dropped', () => {
  const onMarks = setup();
  const row = screen.getByTestId('row-actions');
  vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 400, top: 0, height: 20, right: 400, bottom: 20, x: 0, y: 0, toJSON: () => ({}) });
  const ev = createEvent.drop(row, { dataTransfer: { getData: () => 'action:point', types: ['text/plain'] } });
  Object.defineProperty(ev, 'clientX', { value: 350 }); // jsdom has no DragEvent, so it drops clientX
  fireEvent(row, ev);
  expect(onMarks.mock.calls[0][0].actions).toContainEqual({ startMs: 3500, endMs: 4000, gesture: 'point' });
});

it('asks for a voiceover first', () => {
  setup(null);
  expect(screen.getByText(/Add a voiceover first/)).toBeTruthy();
});
