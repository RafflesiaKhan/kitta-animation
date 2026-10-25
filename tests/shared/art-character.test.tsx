import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArtCharacterView } from '../../shared/character/ArtCharacter';
import { CharacterView } from '../../shared/character/CharacterView';
import { basePrompt, posePrompt } from '../../shared/character/art';
import { ART_POSES, type ArtCharacter, type FrameState } from '../../shared/types';

const mouth = { x: 0.5, y: 0.6, w: 0.1, skin: '#ffcc99' };
const art: ArtCharacter = {
  kind: 'art', id: '11111111-2222-3333-4444-555555555555', name: 'Robo', prompt: 'a robot', style: 'flat cartoon',
  images: {
    neutral: { file: 'neutral-a.png', mouth }, happy: { file: 'happy-a.png', mouth: { ...mouth, y: 0.4 } },
    blink: { file: 'blink-a.png', mouth }, wave: { file: 'wave-a.png', mouth: null },
    lookDown: { file: 'lookDown-a.png', mouth: { ...mouth, y: 0.7 } },
  },
};
const frame = (over: Partial<FrameState> = {}): FrameState => ({ expression: 'neutral', mouth: 'X', gesture: 'none', gestureProgress: 0, blink: false, bob: 0, ...over });
const render = (f = frame(), c = art) => renderToStaticMarkup(<ArtCharacterView character={c} frame={f} resolve={(file) => `img/${file}`} />);

describe('ArtCharacterView', () => {
  it('shows the image for the expression, falling back to neutral', () => {
    expect(render(frame({ expression: 'happy' }))).toContain('href="img/happy-a.png"');
    expect(render(frame({ expression: 'sad' }))).toContain('href="img/neutral-a.png"');
  });
  it('uses the API route when no resolver is given', () => {
    expect(renderToStaticMarkup(<CharacterView config={art} frame={frame()} />)).toContain(`/api/characters/${art.id}/neutral-a.png`);
  });
  it('crossfades from the previous expression', () => {
    const html = render(frame({ fromExpression: 'neutral', expression: 'happy', blend: 0.4 }));
    expect(html).toMatch(/data-part="from" href="img\/neutral-a.png"/);
    expect(html).toMatch(/data-part="pose" href="img\/happy-a.png"[^>]*opacity="0.4"/);
    expect(render(frame({ fromExpression: 'neutral', expression: 'happy', blend: 1 }))).not.toContain('data-part="from"');
  });
  it('shows the blink frame during blinks, except when winking', () => {
    expect(render(frame({ blink: true }))).toContain('img/blink-a.png');
    expect(render(frame({ blink: true, expression: 'wink' }))).not.toContain('img/blink-a.png');
  });
  it('fades an action pose in and out around its gesture', () => {
    expect(render(frame({ gesture: 'wave', gestureProgress: 0.5 }))).toMatch(/data-part="action" href="img\/wave-a.png"/);
    expect(render(frame({ gesture: 'wave', gestureProgress: 0.03 }))).toMatch(/data-part="action"[^>]*opacity="0.5"/);
    expect(render(frame({ gesture: 'wave', gestureProgress: 0.03 }))).not.toMatch(/data-part="under" opacity/); // picture under it still solid
  });
  it('hides the picture under a fully shown action pose, so it does not show through', () => {
    expect(render(frame({ gesture: 'wave', gestureProgress: 0.09 }))).toMatch(/data-part="under" opacity="0.5"/);
    const html = render(frame({ gesture: 'wave', gestureProgress: 0.5 }));
    expect(html).not.toContain('data-part="under"');
    expect(html).not.toContain('img/neutral-a.png');
    expect(render(frame({ gesture: 'shrug', gestureProgress: 0.5 }))).not.toContain('data-part="action"'); // not drawn yet
  });
  it('draws a talking mouth over the painted one only for open shapes', () => {
    expect(render(frame({ mouth: 'X' }))).not.toContain('data-part="talk"');
    const html = render(frame({ mouth: 'D' }));
    expect(html).toContain('data-part="talk"');
    expect(html).toContain('fill="#ffcc99"');
    expect(html).toMatch(/data-part="mouth"[^>]*translate\(500 600\)/);
  });
  it("talks at the neutral picture's mouth in every pose, and not while looking down", () => {
    // happy's own box is off and wave has none: both talk where the neutral mouth is
    expect(render(frame({ mouth: 'D', expression: 'happy' }))).toMatch(/data-part="mouth"[^>]*translate\(500 600\)/);
    expect(render(frame({ mouth: 'D', gesture: 'wave', gestureProgress: 0.5 }))).toMatch(/data-part="mouth"[^>]*translate\(500 600\)/);
    expect(render(frame({ mouth: 'D', gesture: 'lookDown', gestureProgress: 0.5 }))).not.toContain('data-part="talk"');
  });
});

describe('art prompts', () => {
  it('asks for a keyable magenta backdrop and the chosen style', () => {
    const p = basePrompt('a round robot', 'pixel art', false);
    expect(p).toContain('a round robot');
    expect(p).toContain('pixel art');
    expect(p).toContain('#FF00FF');
    expect(basePrompt('', 'anime', true)).toContain('Redraw the character in the attached picture');
  });
  it('has an edit prompt for every pose but neutral, all keeping the mouth closed', () => {
    for (const pose of ART_POSES.filter((x) => x !== 'neutral')) {
      expect(posePrompt(pose)).toContain('Same character');
      expect(posePrompt(pose)).toMatch(/mouth closed/);
    }
    expect(posePrompt('wink')).toContain('winking');
    expect(posePrompt('celebrate')).toContain('arms raised');
  });
});
