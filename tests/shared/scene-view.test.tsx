import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SceneView } from '../../shared/SceneView';
import type { Scene, SceneActor } from '../../shared/scene';
import type { ArtCharacter, Timeline } from '../../shared/types';
import { STARTERS } from '../../shared/character/starters';

const timeline = (shape: 'D' | 'X', from: number, to: number): Timeline => ({
  durationMs: 2000, cues: [{ startMs: from, endMs: to, shape }], lines: [], marks: { expressions: [], actions: [] },
} as never);
const actor = (over: Partial<SceneActor> & { id: string }): SceneActor =>
  ({ character: STARTERS.kit, x: 0.5, scale: 1, idleOffsetMs: 0, timeline: timeline('X', 0, 2000), ...over });
const shot = { startMs: 0, name: 'wide', zoom: 1, focusX: 0.5, focusY: 0.5 };
const scene = (actors: SceneActor[], shots = [shot]): Scene =>
  ({ title: 'T', audioId: 'a', durationMs: 2000, background: 'data:image/png;base64,AA', actors, shots });
const render = (s: Scene, ms = 500, resolve?: (id: string, file: string) => string) =>
  renderToStaticMarkup(<SceneView scene={s} ms={ms} resolve={resolve} />);

const art = (id: string): ArtCharacter => ({
  kind: 'art', id, name: id, prompt: 'p', style: 's',
  images: { neutral: { file: 'neutral-a.png', mouth: { x: 0.5, y: 0.6, w: 0.1, skin: '#ffcc99' } } },
});

describe('SceneView', () => {
  it("moves only the speaker's mouth", () => {
    const s = scene([actor({ id: 'mina', timeline: timeline('D', 0, 1000) }), actor({ id: 'rafi', x: 0.75 })]);
    const html = render(s, 500);
    const part = (id: string) => html.slice(html.indexOf(`data-actor="${id}"`)).match(/data-part="mouth"[^>]*data-shape="(\w)"/)![1];
    expect(part('mina')).toBe('D');
    expect(part('rafi')).toBe('X');
  });
  it('draws the set behind the actors, inside the camera', () => {
    const html = render(scene([actor({ id: 'mina' })]));
    const [cam, set, mina] = ['data-part="camera"', 'data-part="set"', 'data-actor="mina"'].map((k) => html.indexOf(k));
    expect(cam).toBeGreaterThan(-1);
    expect(cam).toBeLessThan(set);
    expect(set).toBeLessThan(mina);
  });
  it("applies the shot's camera", () => {
    const html = render(scene([actor({ id: 'mina' })], [{ ...shot, zoom: 2, focusX: 0.25, focusY: 0.5 }]));
    expect(html).toContain('transform="translate(0 -540) scale(2)"');
  });
  it('places an actor by x and scale, bottom-anchored', () => {
    expect(render(scene([actor({ id: 'mina', x: 0.25 })]))).toContain('data-actor="mina" transform="translate(48 216)"');
  });
  it('mirrors a flipped actor', () => {
    expect(render(scene([actor({ id: 'mina', x: 0.25, flip: true })]))).toContain('translate(864 0) scale(-1 1)');
  });
  it('resolves pictures per character', () => {
    const html = render(scene([actor({ id: 'a', character: art('a') }), actor({ id: 'b', character: art('b') })]), 500, (id, file) => `${id}/${file}`);
    expect(html).toContain('a/neutral-a.png');
    expect(html).toContain('b/neutral-a.png');
  });
  it('draws the same markup for the same millisecond', () => {
    const s = scene([actor({ id: 'mina', timeline: timeline('D', 0, 1000) })]);
    expect(render(s, 700)).toBe(render(s, 700));
  });
});
