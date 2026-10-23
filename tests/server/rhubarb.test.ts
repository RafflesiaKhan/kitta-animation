import { describe, it, expect } from 'vitest';
import { parseRhubarbJson } from '../../server/rhubarb';

describe('parseRhubarbJson', () => {
  it('maps seconds to ms cues', () => {
    expect(parseRhubarbJson(JSON.stringify({ mouthCues: [{ start: 0, end: 0.12, value: 'X' }] }))).toEqual([
      { startMs: 0, endMs: 120, shape: 'X' },
    ]);
  });
});
