import { describe, expect, it } from 'vitest';
import { actionFor, parseAction } from '../../shared/actions';

const clip = (extra: Record<string, unknown> = {}) => ({ name: 'custom', label: 'Custom', duration: 1, keys: [{ t: 0, bones: { head: [0, 0, 0] } }], ...extra });

describe('action library', () => {
  it('keeps legacy ids and defaults old loop clips to loop', () => {
    expect(actionFor('wave')?.play).toBe('loop');
    expect(actionFor('lookDown')).toBeDefined();
  });
  it('parses metadata and play modes', () => {
    expect(parseAction(clip({ play: 'hold', tags: ['calm'], needs: ['legs'] }))).toMatchObject({ play: 'hold', tags: ['calm'], needs: ['legs'] });
  });
  it('rejects unknown bones with the bone name', () => {
    expect(() => parseAction(clip({ keys: [{ t: 0, bones: { antenna: [0, 0, 0] } }] }))).toThrow(/unknown bone "antenna"/);
  });
});
