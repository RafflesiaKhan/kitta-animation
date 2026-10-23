import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { parseRhubarbJson, runRhubarb } from '../../server/rhubarb';

describe('parseRhubarbJson', () => {
  it('maps seconds to ms cues', () => {
    expect(parseRhubarbJson(JSON.stringify({ mouthCues: [{ start: 0, end: 0.12, value: 'X' }] }))).toEqual([
      { startMs: 0, endMs: 120, shape: 'X' },
    ]);
  });
});

describe('runRhubarb concurrency', () => {
  it('overlapping calls leave console and stdout restored', async () => {
    const { log, error } = console;
    const write = process.stdout.write;
    const fixture = join(__dirname, '../fixtures/hello.wav');
    const [a, b] = await Promise.all([runRhubarb(fixture), runRhubarb(fixture)]);
    expect(a.length).toBeGreaterThan(0);
    expect(b).toEqual(a);
    expect(console.log).toBe(log);
    expect(console.error).toBe(error);
    expect(process.stdout.write).toBe(write);
  }, 30000);
});
