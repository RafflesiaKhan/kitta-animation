import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ScenePreview } from '../../src/ScenePreview';
import { STARTERS } from '../../shared/character/starters';
import type { Scene, SceneActor } from '../../shared/scene';

const { name: _a, ...kit } = STARTERS.kit;
const { name: _b, ...milo } = STARTERS.milo;
const line = { text: '', startMs: 0, endMs: 1000, expression: 'neutral' as const, gesture: 'none' as const };
const actor = (id: string, character: typeof kit, shape: string): SceneActor => ({
  id, character, x: 0.5, scale: 1, idleOffsetMs: 0,
  timeline: { durationMs: 1000, cues: [{ startMs: 0, endMs: 1000, shape: shape as 'D' }], lines: [line] },
});
const scene: Scene = {
  title: 'T', audioId: '11111111-1111-4111-8111-111111111111', durationMs: 1000, background: 'data:image/svg+xml;base64,',
  actors: [actor('mina', kit, 'D'), actor('rafi', milo, 'X')],
  shots: [{ startMs: 0, name: 'wide', zoom: 1, focusX: 0.5, focusY: 0.5 }, { startMs: 600, name: 'close-mina', zoom: 2, focusX: 0.3, focusY: 0.5 }],
};

const mockFetch = (res: { ok: boolean; status: number; body: unknown }) =>
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: res.ok, status: res.status, json: async () => res.body }));
const mouth = (container: HTMLElement, id: string) => container.querySelector(`[data-actor=${id}] [data-part=mouth]`)!.getAttribute('data-shape');

beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

async function loaded() {
  mockFetch({ ok: true, status: 200, body: scene });
  const view = render(<ScenePreview name="first-scene" />);
  await act(async () => { await vi.advanceTimersByTimeAsync(50); });
  return view;
}

it('draws the scene at audio.currentTime', async () => {
  const { container } = await loaded();
  const audio = container.querySelector('audio')!;
  expect(audio.getAttribute('src')).toBe(`/api/audio/${scene.audioId}`);
  audio.currentTime = 0.5;
  act(() => { vi.advanceTimersByTime(50); });
  expect(mouth(container, 'mina')).toBe('D');
  expect(mouth(container, 'rafi')).toBe('X');
});

it('shows the current shot name', async () => {
  const { container } = await loaded();
  expect(screen.getByText('wide')).toBeTruthy();
  container.querySelector('audio')!.currentTime = 0.7;
  act(() => { vi.advanceTimersByTime(50); });
  expect(screen.getByText('close-mina')).toBeTruthy();
});

it('shows the error when the scene is missing', async () => {
  mockFetch({ ok: false, status: 404, body: { error: 'Scene not found. Run npm run scene first.' } });
  render(<ScenePreview name="nope" />);
  await act(async () => { await vi.advanceTimersByTimeAsync(50); });
  expect(screen.getByRole('alert').textContent).toContain('Scene not found. Run npm run scene first.');
});
