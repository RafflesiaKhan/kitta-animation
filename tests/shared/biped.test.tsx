import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { entrancePose } from '../../shared/character/Biped';
import { Character } from '../../shared/character/Character';
import { STARTERS } from '../../shared/character/starters';

describe('Ira entrance', () => {
  it('plants the support foot throughout each step', () => {
    for (const [start, side] of [[120, 'left'], [770, 'right']] as const) {
      const first = entrancePose(start, true);
      for (let ms = start; ms <= start + 650; ms += 25) {
        const pose = entrancePose(ms, true);
        expect(pose.root + pose[side].x).toBeCloseTo(first.root + first[side].x);
        expect(pose[side].lift).toBeCloseTo(0);
      }
    }
    expect(entrancePose(1500, true)).toEqual(entrancePose(5000, true));
  });

  it('frames the same speaking, waving pose in both shots', () => {
    const frame = { timeMs: 800, expression: 'happy', mouth: 'D', gesture: 'wave', gestureProgress: .4, blink: false, bob: 0 } as const;
    const draw = (framing: 'full' | 'waist') => renderToStaticMarkup(
      <Character config={{ ...STARTERS.ira, framing, walkIn: true }} frame={frame}/>);
    expect(draw('full')).toContain('data-part="legs"');
    expect(draw('full').replace('-225 100 1450 1450', '0 0 1000 1000')).toEqual(draw('waist'));
  });
});
