import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { AUDIO_DIR } from './audio';
import { ensureVoiceStudio } from './launch';
import { renderScene } from './render';
import { SCENES_DIR, SceneError, buildScene, loadScene, saveScene, captureScene, validSceneName } from './scene';
import { speakLine } from './speech';
import type { SceneSource } from '../shared/scene';

// npm run scene -- <sourceDir> [--rebuild] [--art <characterId>]

const fail = (lines: string[]): never => {
  console.error(lines.join('\n'));
  process.exit(1);
};

async function main() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const args = process.argv.slice(2);
  const rebuild = args.includes('--rebuild');
  const artAt = args.indexOf('--art');
  const artId = artAt >= 0 ? args[artAt + 1] : undefined;
  if (artAt >= 0 && !artId) fail(['--art needs a character id']);
  const sourceDir = args.find((a, i) => !a.startsWith('--') && (artAt < 0 || i !== artAt + 1));
  if (!sourceDir) fail(['Usage: npm run scene -- <sourceDir> [--rebuild] [--art <characterId>]']);

  let source: SceneSource;
  try {
    source = JSON.parse(await readFile(join(sourceDir!, 'scene.json'), 'utf8'));
  } catch (e) {
    throw new SceneError([`Can't read ${join(sourceDir!, 'scene.json')}: ${(e as Error).message}`]);
  }
  let name = basename(resolve(sourceDir!));
  if (artId) {
    source = { ...source, actors: source.actors.map((a, i) => (i === 0 ? { ...a, character: { artId } } : a)) };
    name += '-art';
  }
  if (!validSceneName(name)) fail([`Scene folder name must use only lowercase letters, numbers and dashes: ${name}`]);

  let scene = rebuild ? null : await loadScene(name);
  if (!scene) {
    if (!process.env.VOICESTUDIO_URL) fail(['Set VOICESTUDIO_URL in .env']);
    if (!(await ensureVoiceStudio())) fail(["VoiceStudio isn't running"]);
    scene = await buildScene(source, sourceDir!, (line) => speakLine('voicestudio', line));
    await saveScene(name, scene);
  }

  const outPath = join(SCENES_DIR, name, `${name}.mp4`);
  const started = Date.now();
  let frames = 0;
  await renderScene({
    ...await captureScene(scene), audioPath: join(AUDIO_DIR, `${scene.audioId}.wav`), outPath,
    onProgress: (f, total) => { frames = total; process.stdout.write(`\rFrame ${f}/${total}`); },
  });
  const seconds = (Date.now() - started) / 1000;
  console.log(`\nRendered ${frames} frames in ${seconds.toFixed(1)} s (${(scene.durationMs / 1000 / seconds).toFixed(1)}× realtime)`);
  console.log(outPath);
}

main().catch((e) => {
  if (e instanceof SceneError) fail(e.problems);
  fail([e instanceof Error ? e.message : String(e)]);
});
