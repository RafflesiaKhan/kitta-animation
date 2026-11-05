import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { resolveScene, sceneProblems } from '../shared/scene';
import type { Scene, SceneSource } from '../shared/scene';
import { isArt } from '../shared/types';
import type { AnyCharacter, ScriptLineInput } from '../shared/types';
import { concatWithGaps } from './audio';
import { CharacterError, getCharacter, imageDataUris } from './characters';
import { runRhubarb } from './rhubarb';
import { plainText } from './speech';

// Builds a scene from its source (voicing every line), saves the resolved Scene, and loads it back for export.

export const SCENES_DIR = join('data', 'scenes');
const NAME_RE = /^[a-z0-9-]{1,64}$/;
export const validSceneName = (name: string): boolean => NAME_RE.test(name);
const BACKGROUND_TYPES: Record<string, string> = { '.svg': 'image/svg+xml', '.png': 'image/png' };

export class SceneError extends Error {
  constructor(public problems: string[]) {
    super(problems.join('\n'));
    this.name = 'SceneError';
  }
}

async function readBackground(sourceDir: string, file: string): Promise<string> {
  const type = BACKGROUND_TYPES[extname(file).toLowerCase()];
  if (!type) throw new SceneError([`Background "${file}" must be an .svg or .png file`]);
  try {
    return `data:${type};base64,${(await readFile(join(sourceDir, basename(file)))).toString('base64')}`;
  } catch {
    throw new SceneError([`Background "${file}" not found in ${sourceDir}`]);
  }
}

async function loadCharacters(source: SceneSource): Promise<Record<string, AnyCharacter>> {
  const out: Record<string, AnyCharacter> = {};
  for (const a of source.actors) {
    if (!('artId' in a.character)) { out[a.id] = a.character; continue; }
    try {
      out[a.id] = await getCharacter(a.character.artId);
    } catch (e) {
      if (e instanceof CharacterError) throw new SceneError([`Actor "${a.id}": character ${a.character.artId} not found`]);
      throw e;
    }
  }
  return out;
}

export async function buildScene(source: SceneSource, sourceDir: string, speak: (line: ScriptLineInput) => Promise<Buffer>): Promise<Scene> {
  const problems = sceneProblems(source);
  if (problems.length) throw new SceneError(problems);
  const background = await readBackground(sourceDir, source.background);
  const characters = await loadCharacters(source);

  const wavs: Buffer[] = [];
  for (const l of source.lines) { // one at a time: kinder to a local voice app
    const actor = source.actors.find((a) => a.id === l.actor)!;
    wavs.push(await speak({ text: l.text, voice: actor.voice, speaker: actor.speaker, expression: l.expression, gesture: l.gesture, variability: 'steady' }));
  }
  const { path, durationMs, spans } = await concatWithGaps(wavs);
  const cues = await runRhubarb(path, source.lines.map((l) => plainText(l.text)).join(' '));
  const audioId = basename(path, '.wav');
  return resolveScene(source, { audioId, durationMs, spans, cues, background, characters });
}

const builtPath = (name: string) => join(SCENES_DIR, name, 'built.json');

export async function saveScene(name: string, scene: Scene): Promise<void> {
  if (!NAME_RE.test(name)) throw new SceneError([`Scene name "${name}" must be lowercase letters, digits and dashes (up to 64)`]);
  await mkdir(join(SCENES_DIR, name), { recursive: true });
  await writeFile(builtPath(name), JSON.stringify(scene));
}

export async function loadScene(name: string): Promise<Scene | null> {
  if (!NAME_RE.test(name)) return null;
  try {
    return JSON.parse(await readFile(builtPath(name), 'utf8')) as Scene;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

/** Images of the scene's art actors as data URIs, keyed by character id, then file name. */
export async function sceneImages(scene: Scene): Promise<Record<string, Record<string, string>>> {
  const out: Record<string, Record<string, string>> = {};
  for (const a of scene.actors) if (isArt(a.character)) out[a.character.id] = await imageDataUris(a.character);
  return out;
}
