import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHARACTERS_DIR } from '../../server/characters';
import { listVectorCharacters, readVectorMeta } from '../../server/vector';

const made: string[] = [];
const character = (vector: string | null) => {
  const id = randomUUID();
  const dir = join(CHARACTERS_DIR, id);
  mkdirSync(dir, { recursive: true });
  made.push(dir);
  writeFileSync(join(dir, 'meta.json'), JSON.stringify({ kind: 'vector', id, name: `Capabilities test ${id}` }));
  if (vector !== null) writeFileSync(join(dir, 'vector.json'), vector);
  return id;
};
afterEach(() => { for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe('vector character capabilities', () => {
  it('finds legs from the skeleton', async () => {
    const id = character(JSON.stringify({ skeleton: { hip_R: [0, 0], ankle_R: [0, 1] } }));
    expect((await readVectorMeta(id)).capabilities).toEqual(['legs']);
  });
  it('keeps a character whose vector.json is missing or damaged, with no capabilities', async () => {
    const damaged = character('{ not json');
    const missing = character(null);
    expect((await readVectorMeta(damaged)).capabilities).toEqual([]);
    expect((await readVectorMeta(missing)).capabilities).toEqual([]);
    const listed = (await listVectorCharacters()).map((c) => c.id);
    expect(listed).toContain(damaged);
    expect(listed).toContain(missing);
  });
});
