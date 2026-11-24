import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { actionRecords, loadActionLibrary } from '../../server/actions';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('server action library', () => {
  it('loads a custom action and reports invalid files without dropping built-ins', () => {
    const root = mkdtempSync(join(tmpdir(), 'kitta-actions-')); roots.push(root);
    writeFileSync(join(root, 'custom.json'), JSON.stringify({ name: 'custom', label: 'Custom', play: 'hold', duration: 1, keys: [{ t: 0, bones: { head: [0, 0, 0] } }] }));
    writeFileSync(join(root, 'bad.json'), JSON.stringify({ name: 'bad', label: 'Bad', duration: 1, keys: [{ t: 0, bones: { antenna: [0, 0, 0] } }] }));
    expect(actionRecords(root).some((a) => a.name === 'custom')).toBe(true);
    expect(loadActionLibrary(root).some((a) => a.name === 'wave')).toBe(true);
  });
});
