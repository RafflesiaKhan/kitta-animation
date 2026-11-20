import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { drawVector } from './vector-draw';
import { importVectorCharacter } from './vector';

// npm run vector:draw -- --front front.png --face sheet_face.png --name Pearl --out work/pearl
//   [--provider anthropic|openai] [--model <id>] [--notes "..."] [--rounds 4] [--import]
// Runs the drawing loop on fixed pictures, saving each round's doc and check picture, and a log of time, tokens and cost.

async function main() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const { values: a } = parseArgs({ options: {
    front: { type: 'string' }, face: { type: 'string' }, name: { type: 'string' }, out: { type: 'string' },
    provider: { type: 'string' }, model: { type: 'string' }, notes: { type: 'string' }, rounds: { type: 'string' }, import: { type: 'boolean' },
  } });
  if (!a.front || !a.face || !a.name || !a.out || (a.provider && a.provider !== 'anthropic' && a.provider !== 'openai')) {
    console.error('Usage: npm run vector:draw -- --front <png> --face <png> --name <name> --out <dir> [--provider anthropic|openai] [--model <id>] [--notes <text>] [--rounds 4] [--import]');
    process.exit(1);
  }
  await mkdir(a.out, { recursive: true });
  const started = Date.now();
  const log: object[] = [];
  const result = await drawVector({
    name: a.name, front: await readFile(a.front), faceSheet: await readFile(a.face), notes: a.notes, maxRounds: a.rounds ? Number(a.rounds) : undefined,
    provider: a.provider as 'anthropic' | 'openai' | undefined, model: a.model,
    onRound: async (r) => {
      if (r.doc !== undefined) await writeFile(join(a.out!, `round-${r.round}.vector.json`), JSON.stringify(r.doc, null, 1));
      if (r.sheet) await writeFile(join(a.out!, `round-${r.round}.check.png`), r.sheet);
      log.push({ round: r.round, seconds: Math.round(r.seconds), done: r.done, errors: r.errors, warnings: r.warnings, notes: r.notes, usage: r.usage });
      await writeFile(join(a.out!, 'log.json'), JSON.stringify(log, null, 2));
      console.log(`round ${r.round}: ${Math.round(r.seconds)} s, ${r.done ? 'done' : `${r.errors.length} errors, ${r.warnings.length} warnings`}, ` +
        `${r.usage.input} in, ${r.usage.output} out, ${r.usage.cost == null ? 'no price' : `$${r.usage.cost.toFixed(3)}`}`);
      for (const e of r.errors.slice(0, 10)) console.log(`  error: ${e}`);
    },
  });
  const sum = (f: (u: typeof result.rounds[number]['usage']) => number | null | undefined) => result.rounds.reduce((s, r) => s + (f(r.usage) ?? 0), 0);
  const summary = {
    provider: result.provider, model: result.model,
    minutes: +((Date.now() - started) / 60000).toFixed(1), rounds: result.rounds.length, errors: result.errors.length,
    tokens: { input: sum((u) => u.input), output: sum((u) => u.output) },
    cost: +sum((u) => u.cost).toFixed(3),
  };
  console.log(JSON.stringify(summary));
  await writeFile(join(a.out, 'summary.json'), JSON.stringify(summary, null, 2));
  if (!result.doc) process.exit(1);
  await writeFile(join(a.out, 'vector.json'), JSON.stringify(result.doc));
  if (a.import) console.log('imported as', (await importVectorCharacter(a.name, result.doc)).id);
}

main().catch((e) => { console.error(e); process.exit(1); });
