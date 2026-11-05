import { describe, it, expect } from 'vitest';
import { cameraAt, resolveScene, sceneProblems, type Scene, type SceneSource } from '../../shared/scene';
import { frameAt } from '../../shared/timeline';
import { STARTERS } from '../../shared/character/starters';

const spans = [{ startMs: 0, endMs: 1000 }, { startMs: 1250, endMs: 2000 }];
const cues = [
  { startMs: 0, endMs: 900, shape: 'D' as const },
  { startMs: 900, endMs: 1100, shape: 'C' as const },
  { startMs: 1100, endMs: 1250, shape: 'X' as const },
  { startMs: 1250, endMs: 2000, shape: 'B' as const },
];
const character = { starter: 'kitta', skin: 'a', hairStyle: 'b', hairColor: 'c', eyeStyle: 'd', outfit: 'e', outfitColor: 'f' } as never;
const line = { actor: 'mina', text: 'Hello', expression: 'neutral' as const, gesture: 'none' as const };
const shot = { name: 'wide', line: 0, at: 0, zoom: 1, focusX: 0.5, focusY: 0.5 };
const good: SceneSource = {
  title: 'T',
  background: 'bg.png',
  actors: [
    { id: 'mina', character, voice: 'v1', x: 500, scale: 1, idleOffsetMs: 0 },
    { id: 'rafi', character, voice: 'v2', x: 1400, scale: 1, flip: true, idleOffsetMs: 700 },
  ],
  lines: [line, { ...line, actor: 'rafi', text: 'Hi' }],
  shots: [shot],
  reactions: [],
};
const build = (source: SceneSource): Scene =>
  resolveScene(source, { audioId: 'a', durationMs: 2000, spans, cues, background: 'data:image/png;base64,AA', characters: { mina: STARTERS.kit, rafi: STARTERS.kit } });
const actorOf = (s: Scene, id: string) => s.actors.find((a) => a.id === id)!;

describe('resolveScene', () => {
  const scene = build(good);
  const actor = (id: string) => actorOf(scene, id);
  it('gives each actor only its own lines and cues, cut at the line end', () => {
    expect(actor('mina').timeline.cues).toEqual([{ startMs: 0, endMs: 900, shape: 'D' }, { startMs: 900, endMs: 1000, shape: 'C' }]);
    expect(actor('rafi').timeline.cues).toEqual([{ startMs: 1250, endMs: 2000, shape: 'B' }]);
    expect(frameAt(actor('rafi').timeline, 500).mouth).toBe('X');
    expect(frameAt(actor('mina').timeline, 1500).mouth).toBe('X');
  });
  it('places a listener reaction by its line and position', () => {
    const t = actorOf(build({ ...good, reactions: [{ actor: 'rafi', line: 0, at: 0.5, expression: 'worried', gesture: 'nod' }] }), 'rafi').timeline;
    expect(frameAt(t, 400).expression).toBe('neutral');
    expect(frameAt(t, 600).expression).toBe('worried');
    expect(frameAt(t, 600).gesture).toBe('nod');
  });
  it('skips an action with no room, keeping the rest of the scene', () => {
    const r = { actor: 'rafi', line: 0, at: 0.5, expression: 'worried' as const, gesture: 'nod' as const };
    const s = build({ ...good, reactions: [r, { ...r, gesture: 'shrug' }] });
    const marks = actorOf(s, 'rafi').timeline.marks!;
    expect(marks.actions).toHaveLength(1);
    expect(marks.actions[0]).toMatchObject({ startMs: 500, gesture: 'nod' });
    expect(marks.expressions).toEqual([{ startMs: 0, expression: 'neutral' }, { startMs: 500, expression: 'worried' }, { startMs: 1250, expression: 'neutral' }]);
    expect(s.actors.map((a) => a.id)).toEqual(['mina', 'rafi']);
    expect(actorOf(s, 'mina').timeline.cues).toHaveLength(2);
  });
  it('starts a shot at its line position', () => {
    const s = build({ ...good, shots: [{ ...shot, line: 1, at: 0.5, name: 'close' }, shot] });
    expect(cameraAt(s, 1624).name).toBe('wide');
    expect(cameraAt(s, 1625).name).toBe('close');
  });
  it('aims the camera and stops it at the edges of the set', () => {
    const cam = (zoom: number, focusX: number, focusY: number) => cameraAt(build({ ...good, shots: [{ ...shot, zoom, focusX, focusY }] }), 0);
    expect(cam(1, 0.5, 0.5)).toMatchObject({ zoom: 1, x: 0, y: 0 });
    expect(cam(2, 0.25, 0.5)).toMatchObject({ x: 0, y: -540 });
    expect(cam(2, 0, 0)).toMatchObject({ x: 0, y: 0 });
    expect(cam(2, 1, 1)).toMatchObject({ x: -1920, y: -1080 });
  });
});

describe('sceneProblems', () => {
  it('names every problem in a bad source', () => {
    expect(sceneProblems(good)).toEqual([]);
    expect(sceneProblems({ ...good, lines: [{ ...line, actor: 'nobody' }] })).toContain('Line 1: unknown actor "nobody"');
    expect(sceneProblems({ ...good, shots: [{ ...shot, line: 9 }] })).toContain('Shot "wide": no line 9');
    expect(sceneProblems({ ...good, shots: [{ ...shot, at: 0.5 }] })).toContain('The first shot must start at line 0, at 0');
    expect(sceneProblems({ ...good, shots: [{ ...shot, zoom: 0.5 }] })).toContain('Shot "wide": zoom must be at least 1');
    expect(sceneProblems({ ...good, reactions: [{ actor: 'mina', line: 0, at: 2 }] })).toContain('Reaction 1: at must be 0..1');
    expect(sceneProblems({ ...good, lines: [] })).toContain('The scene has no lines');
  });
});
