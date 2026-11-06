import { randomUUID } from 'node:crypto';
import { closeSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import type { Episode, EpisodeScene, EpisodeSceneInput, MediaAsset, Project, ProjectCharacterInput, ProjectScene } from '../shared/projects';
import type { Scene } from '../shared/scene';
import { EXPRESSIONS, GESTURES, isArt, type CharacterConfig } from '../shared/types';
import { OPTIONS, STARTERS } from '../shared/character/starters';
import { TTS_PROVIDERS } from '../shared/voices';
import { addAction } from '../shared/marks';
import { preparedSet, SetError } from './sets';
import { AUDIO_DIR } from './audio';
import { renderScene } from './render';
import { hydrateScene, loadScene, captureScene, snapshotScene, MissingSceneCharacterError } from './scene';
import { CharacterError, getCharacter } from './characters';

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const mediaTypes: Record<string, MediaAsset['kind']> = {
  'image/png': 'image', 'image/jpeg': 'image', 'image/webp': 'image', 'image/svg+xml': 'svg',
  'audio/wav': 'audio', 'audio/x-wav': 'audio', 'audio/mpeg': 'audio', 'audio/mp4': 'audio', 'audio/ogg': 'audio',
};
const clean = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';

function hasSvgRoot(source: string): boolean {
  let offset = source.charCodeAt(0) === 0xfeff ? 1 : 0;
  for (;;) {
    while (/[\t\n\r ]/.test(source[offset] ?? '')) offset++;
    const comment = source.startsWith('<!--', offset);
    if (comment || source.startsWith('<?', offset)) {
      const marker = comment ? '-->' : '?>';
      const end = source.indexOf(marker, offset + (comment ? 4 : 2));
      if (end === -1) return false;
      offset = end + marker.length;
      continue;
    }
    if (!source.startsWith('<!DOCTYPE', offset) || !/[\t\n\r ]/.test(source[offset + 9] ?? '')) break;
    offset += 9;
    let subset = false;
    while (offset < source.length) {
      const comment = source.startsWith('<!--', offset);
      if (comment || source.startsWith('<?', offset)) {
        const marker = comment ? '-->' : '?>';
        const end = source.indexOf(marker, offset + (comment ? 4 : 2));
        if (end === -1) return false;
        offset = end + marker.length;
        continue;
      }
      const char = source[offset++];
      if (char === '"' || char === "'") {
        const end = source.indexOf(char, offset);
        if (end === -1) return false;
        offset = end + 1;
      } else if (char === '[') subset = true;
      else if (char === ']') subset = false;
      else if (char === '>' && !subset) break;
    }
  }
  const root = /<(?:[\p{L}_\u200c\u200d][\p{L}\p{N}\p{M}_.·‿⁀\u200c\u200d-]*:)?svg(?=[\t\n\r >]|\/>)/uy;
  root.lastIndex = offset;
  return root.test(source);
}

// shortcut: check common signatures at import, decode when an editor consumes the asset.
function matchesMedia(mime: string, bytes: Buffer): boolean {
  const tag = (start: number, end: number) => bytes.toString('latin1', start, end);
  switch (mime) {
    case 'image/png': return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    case 'image/jpeg': return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    case 'image/webp': return tag(0, 4) === 'RIFF' && tag(8, 12) === 'WEBP';
    case 'image/svg+xml': return hasSvgRoot(bytes.toString('utf8'));
    case 'audio/wav':
    case 'audio/x-wav': return tag(0, 4) === 'RIFF' && tag(8, 12) === 'WAVE';
    case 'audio/mpeg': return tag(0, 3) === 'ID3' || (bytes[0] === 255 && (bytes[1] & 224) === 224);
    case 'audio/mp4': return tag(4, 8) === 'ftyp';
    case 'audio/ogg': return tag(0, 4) === 'OggS';
    default: return false;
  }
}

const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const inRange = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && v >= min && v <= max;
const idString = (v: unknown): v is string => typeof v === 'string' && uuid.test(v);
const color = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

function characterInput(body: unknown, style: Project['style']): ProjectCharacterInput | undefined {
  if (!object(body)) return;
  const { anchorY, voice, character } = body;
  const name = clean(body.name, 100);
  if (!name || !inRange(anchorY, 0, 1) || !object(voice) || !object(character)) return;
  const provider = TTS_PROVIDERS.find(value => value === voice.provider);
  const variability = voice.variability;
  if (!provider || (variability !== 'steady' && variability !== 'varied')) return;
  const voiceName = clean(voice.voice, 100);
  if (!voiceName || typeof voice.engine !== 'string' || typeof voice.speaker !== 'string') return;
  const defaults = { name, anchorY, voice: { provider, voice: voiceName, engine: clean(voice.engine, 100), speaker: clean(voice.speaker, 100), variability } } as const;
  if (style === 'ai') return idString(character.artId) ? { ...defaults, character: { artId: character.artId } } : undefined;
  const { starter, skin, hairStyle, hairColor, eyeStyle, outfit, outfitColor } = character;
  if (typeof starter !== 'string' || !Object.hasOwn(STARTERS, starter) || !color(skin) || !color(hairColor) || !color(outfitColor)
    || typeof hairStyle !== 'string' || !OPTIONS.hairStyles.includes(hairStyle) || typeof eyeStyle !== 'string' || !OPTIONS.eyeStyles.includes(eyeStyle)
    || typeof outfit !== 'string' || !OPTIONS.outfits.includes(outfit)) return;
  return { ...defaults, character: { starter: starter as CharacterConfig['starter'], skin, hairStyle, hairColor, eyeStyle, outfit, outfitColor } };
}

function episodeSceneInput(body: unknown): EpisodeSceneInput | undefined {
  if (!object(body)) return;
  const { characterId, backgroundAssetId, x, scale, groundY } = body;
  const expression = EXPRESSIONS.find(value => value === body.expression);
  const gesture = GESTURES.find(value => value === body.gesture);
  if (!idString(characterId) || !idString(backgroundAssetId) || !expression || !gesture
    || !inRange(x, 0, 1) || !inRange(scale, .1, 2) || !inRange(groundY, 0, 1)) return;
  return { characterId, backgroundAssetId, expression, gesture, x, scale, groundY };
}

export function projectRoutes(root = resolve('data/projects'), {
  loadSample = () => loadScene('first-scene'), audioDir = AUDIO_DIR,
}: { loadSample?: () => Promise<Scene | null>; audioDir?: string } = {}) {
  const router = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024, files: 1 } });
  const dir = (id: string) => join(root, id);
  const jsonPath = (id: string) => join(dir(id), 'project.json');
  const read = (id: string | string[]): Project | undefined => {
    if (typeof id !== 'string' || !uuid.test(id) || !lstatSync(root, { throwIfNoEntry: false })?.isDirectory()
      || !lstatSync(dir(id), { throwIfNoEntry: false })?.isDirectory()
      || !lstatSync(jsonPath(id), { throwIfNoEntry: false })?.isFile()) return;
    const project = JSON.parse(readFileSync(jsonPath(id), 'utf8')) as Project;
    if (!project || project.id !== id || typeof project.name !== 'string' || typeof project.premise !== 'string'
      || !Array.isArray(project.assets) || !Array.isArray(project.episodes)
      || (project.style !== undefined && project.style !== 'svg' && project.style !== 'ai')) return;
    return { ...project, style: project.style ?? 'svg' };
  };
  const save = (project: Project) => {
    mkdirSync(root, { recursive: true });
    if (!lstatSync(root).isDirectory()) throw new Error('Invalid projects directory');
    const path = jsonPath(project.id);
    mkdirSync(dir(project.id), { recursive: true });
    if (!lstatSync(dir(project.id)).isDirectory()) throw new Error('Invalid project directory');
    const temp = join(dir(project.id), randomUUID() + '.tmp');
    try {
      writeFileSync(temp, JSON.stringify(project, null, 2) + '\n', { flag: 'wx' });
      renameSync(temp, path);
    } finally {
      rmSync(temp, { force: true });
    }
  };

  const assetPath = (project: Project, asset: MediaAsset): string | undefined => {
    if (!uuid.test(asset.id) || !Object.hasOwn(mediaTypes, asset.mime)) return;
    const expected = 'media/' + asset.id;
    // Draft uploads used UUID filenames directly in the project directory.
    if (asset.location !== undefined && (asset.location !== expected || !lstatSync(join(dir(project.id), 'media'), { throwIfNoEntry: false })?.isDirectory())) return;
    const path = join(dir(project.id), asset.location ?? asset.id);
    if (lstatSync(path, { throwIfNoEntry: false })?.isFile()) return path;
  };
  const writeMedia = (project: Project, asset: MediaAsset, bytes: Buffer): string => {
    const mediaDir = join(dir(project.id), 'media');
    mkdirSync(mediaDir, { recursive: true });
    if (!lstatSync(mediaDir).isDirectory()) throw new Error('Invalid project media directory');
    const path = join(dir(project.id), asset.location);
    const file = openSync(path, 'wx');
    try {
      try { writeFileSync(file, bytes); }
      finally { closeSync(file); }
    } catch (error) {
      rmSync(path, { force: true });
      throw error;
    }
    return path;
  };

  router.get('/', (_req, res) => {
    const ids = lstatSync(root, { throwIfNoEntry: false })?.isDirectory() ? readdirSync(root) : [];
    const projects: Project[] = [];
    for (const id of ids) {
      try {
        const project = read(id);
        if (project) projects.push(project);
      } catch {
        console.warn('Skipping unreadable project', id);
      }
    }
    projects.sort((a, b) => (typeof b.createdAt === 'string' ? b.createdAt : '').localeCompare(typeof a.createdAt === 'string' ? a.createdAt : ''));
    res.json(projects);
  });
  router.post('/', (req, res) => {
    const name = clean(req.body?.name, 100);
    if (!name) return res.status(400).json({ error: 'Enter a project name.' });
    const style = req.body?.style;
    if (style !== 'svg' && style !== 'ai') return res.status(400).json({ error: 'Choose SVG or AI for this project.' });
    const project: Project = { id: randomUUID(), name, style, createdAt: new Date().toISOString(), premise: clean(req.body?.premise, 2000), assets: [], episodes: [] };
    save(project);
    res.status(201).json(project);
  });
  router.get('/:id', (req, res) => {
    const project = read(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    res.json(project);
  });
  router.post('/:id/assets', (req, res, next) => {
    if (!read(req.params.id)) return res.status(404).json({ error: 'Project not found.' });
    next();
  }, upload.single('media'), (req, res) => {
    const project = read(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Choose a supported image, SVG or audio file.' });
    const mime = file.mimetype === 'audio/x-m4a' ? 'audio/mp4' : file.mimetype;
    const kind = Object.hasOwn(mediaTypes, mime) ? mediaTypes[mime] : undefined;
    if (!kind || !matchesMedia(mime, file.buffer)) return res.status(400).json({ error: 'Choose a supported image, SVG or audio file.' });
    const id = randomUUID();
    const name = clean(basename(file.originalname.replaceAll('\\', '/')), 140) || 'Imported media';
    const asset: MediaAsset = { id, name, kind, mime, location: 'media/' + id, provenance: 'imported' };
    const mediaPath = writeMedia(project, asset, file.buffer);
    project.assets.push(asset);
    try { save(project); }
    catch (error) {
      rmSync(mediaPath, { force: true });
      throw error;
    }
    res.status(201).json(project);
  });
  router.get('/:id/assets/:assetId', (req, res) => {
    if (!uuid.test(req.params.assetId)) return res.status(404).end();
    const project = read(req.params.id);
    const asset = project?.assets.find(item => item.id === req.params.assetId);
    const path = project && asset && asset.kind !== 'character' ? assetPath(project, asset) : undefined;
    if (!path || !asset || asset.kind === 'character') return res.status(404).end();
    res.set({ 'Content-Security-Policy': "sandbox; default-src 'none'", 'X-Content-Type-Options': 'nosniff' });
    if (asset.kind === 'svg') res.attachment(asset.name);
    res.type(asset.mime).sendFile(resolve(path));
  });
  router.post('/:id/episodes', (req, res) => {
    const project = read(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    const title = clean(req.body?.title, 100);
    if (!title) return res.status(400).json({ error: 'Enter an episode title.' });
    const episode = { id: randomUUID(), title };
    project.episodes.push(episode);
    save(project);
    res.status(201).json(episode);
  });
  const writeCharacter = async (req: Request, res: Response) => {
    let project = read(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    const input = characterInput(req.body, project.style);
    if (!input) return res.status(400).json({ error: 'Choose a character matching this project’s style, a name, an anchor and default voice settings.' });
    if ('artId' in input.character) {
      const art = await getCharacter(input.character.artId).catch(error => {
        if (error instanceof CharacterError && error.code === 'not_found') return undefined;
        throw error;
      });
      if (!art?.images.neutral) return res.status(400).json({ error: 'Choose an available saved AI character.' });
      project = read(req.params.id);
      if (!project || project.style !== 'ai') return res.status(404).json({ error: 'Project not found.' });
    }
    const id = req.params.characterId;
    const characters = project.characters ?? [];
    const index = characters.findIndex(item => item.id === id);
    if (id !== undefined && index === -1) return res.status(404).json({ error: 'Project character not found.' });
    const item = { ...input, id: characters[index]?.id ?? randomUUID() };
    project.characters = index === -1 ? [...characters, item] : characters.map((current, i) => i === index ? item : current);
    save(project);
    res.status(index === -1 ? 201 : 200).json(project);
  };
  router.post('/:id/characters', writeCharacter);
  router.patch('/:id/characters/:characterId', writeCharacter);

  const episodeFor = (project: Project | undefined, episodeId: string) =>
    project?.episodes.find(episode => episode.id === episodeId);
  const backgroundFor = (project: Project, id: string) => {
    const asset = project.assets.find(item => item.id === id);
    if (asset?.kind !== 'svg' && asset?.kind !== 'image') return;
    const path = assetPath(project, asset);
    if (path) return { asset, path };
  };
  const setImage = ({ asset, path }: NonNullable<ReturnType<typeof backgroundFor>>) => preparedSet(asset.mime, path);
  const readProjectScene = async (project: Project, episode: Episode) => {
    const record = episode.projectScene;
    if (!record) return;
    const set = backgroundFor(project, record.backgroundAssetId);
    if (!set) return;
    if ('characterId' in record) {
      const cast = project.characters?.find(item => item.id === record.characterId);
      if (!cast) return;
      const { expression, gesture, x, scale, groundY } = record;
      const durationMs = 1500;
      const baseMarks = { expressions: [{ startMs: 0, expression }], actions: [] };
      const marks = gesture === 'none' ? baseMarks : addAction(baseMarks, 0, gesture, durationMs) ?? baseMarks;
      const scene = await hydrateScene({ title: episode.title, durationMs, audioId: '', background: await setImage(set),
        actors: [{ id: cast.id, character: cast.character, anchorY: cast.anchorY, x, scale, groundY, idleOffsetMs: 0,
          timeline: { durationMs, cues: [], lines: [], marks } }],
        shots: [{ startMs: 0, name: 'wide', zoom: 1, focusX: .5, focusY: .5 }],
      });
      return { scene, audioPath: undefined, audioUrl: null };
    }
    const audio = project.assets.find(asset => asset.id === record.audioAssetId);
    const audioPath = audio?.kind === 'audio' && assetPath(project, audio);
    if (!audio || !audioPath) return;
    const { title, durationMs, actors, shots } = record;
    // Preserve the trusted bundled sample's exact drawing path for older exports.
    const background = set.asset.provenance === 'first-scene'
      ? 'data:' + set.asset.mime + ';base64,' + readFileSync(set.path).toString('base64') : await setImage(set);
    const scene = await hydrateScene({ title, durationMs, actors, shots, audioId: audio.id, background });
    return { scene, audioPath, audioUrl: '/api/projects/' + project.id + '/assets/' + audio.id };
  };

  router.put('/:id/episodes/:episodeId/scene', async (req, res) => {
    let project = read(req.params.id);
    let episode = episodeFor(project, req.params.episodeId);
    if (!project || !episode) return res.status(404).json({ error: 'Episode not found.' });
    const input = episodeSceneInput(req.body);
    const cast = input && project.characters?.find(item => item.id === input.characterId);
    if (!input || !cast) return res.status(400).json({ error: 'Choose a project character and valid performance and placement settings.' });
    if (episode.projectScene && !('characterId' in episode.projectScene)) return res.status(409).json({ error: 'Use a new episode for a character and set scene.' });
    const set = backgroundFor(project, input.backgroundAssetId);
    if (!set) return res.status(400).json({ error: 'Choose an image or SVG from this project.' });
    await setImage(set);
    if ('artId' in cast.character) {
      const art = await getCharacter(cast.character.artId).catch(error => {
        if (error instanceof CharacterError && error.code === 'not_found') throw new MissingSceneCharacterError();
        throw error;
      });
      if (!art.images.neutral) return res.status(409).json({ error: 'The saved AI character has no neutral pose.' });
    }
    project = read(req.params.id);
    episode = episodeFor(project, req.params.episodeId);
    if (!project || !episode) return res.status(404).json({ error: 'Episode not found.' });
    const latestCast = project.characters?.find(item => item.id === input.characterId);
    const latestSet = backgroundFor(project, input.backgroundAssetId);
    if (!latestCast || JSON.stringify(latestCast.character) !== JSON.stringify(cast.character)
      || latestSet?.path !== set.path || latestSet.asset.mime !== set.asset.mime) {
      return res.status(409).json({ error: 'The character or set changed. Reopen the episode and try again.' });
    }
    if (episode.projectScene && !('characterId' in episode.projectScene)) return res.status(409).json({ error: 'Use a new episode for a character and set scene.' });
    const record: EpisodeScene = { ...input, id: episode.projectScene?.id ?? randomUUID() };
    episode.projectScene = record;
    save(project);
    res.json(episode);
  });

  router.post('/:id/episodes/:episodeId/sample', async (req, res) => {
    const initial = read(req.params.id);
    const oldEpisode = episodeFor(initial, req.params.episodeId);
    if (!initial || !oldEpisode) return res.status(404).json({ error: 'Episode not found.' });
    if (oldEpisode.projectScene) {
      if ('characterId' in oldEpisode.projectScene) return res.status(409).json({ error: 'This episode already has a character and set scene.' });
      return res.json(oldEpisode.projectScene);
    }
    if (initial.style !== 'svg') return res.status(400).json({ error: 'The first scene requires an SVG project.' });
    const sample = await loadSample();
    if (!sample || !uuid.test(sample.audioId)) return res.status(409).json({ error: 'Build the first scene with npm run scene -- samples/first-scene.' });
    const sourceAudio = join(audioDir, sample.audioId + '.wav');
    if (!lstatSync(sourceAudio, { throwIfNoEntry: false })?.isFile()) return res.status(409).json({ error: 'The sample audio is missing. Run npm run scene -- samples/first-scene --rebuild.' });
    const sourceBackground = /^data:(image\/(?:svg\+xml|png));base64,([A-Za-z0-9+/=]+)$/.exec(sample.background);
    if (!sourceBackground || sample.actors.some(actor => isArt(actor.character))) return res.status(409).json({ error: 'The built first scene must use SVG characters and a valid set.' });
    const project = read(req.params.id);
    const episode = episodeFor(project, req.params.episodeId);
    if (!project || !episode) return res.status(404).json({ error: 'Episode not found.' });
    if (episode.projectScene) {
      if ('characterId' in episode.projectScene) return res.status(409).json({ error: 'This episode already has a character and set scene.' });
      return res.json(episode.projectScene);
    }
    const audioId = randomUUID();
    const backgroundId = randomUUID();
    const [, mime, encoded] = sourceBackground;
    const audio: MediaAsset = { id: audioId, name: 'First scene dialogue.wav', kind: 'audio', mime: 'audio/wav', location: 'media/' + audioId, provenance: 'first-scene' };
    const background: MediaAsset = { id: backgroundId, name: 'First scene set', kind: mime === 'image/svg+xml' ? 'svg' : 'image', mime, location: 'media/' + backgroundId, provenance: 'first-scene' };
    const { title, durationMs, actors, shots } = snapshotScene(sample);
    const record: ProjectScene = { id: randomUUID(), title, durationMs, shots, audioAssetId: audioId, backgroundAssetId: backgroundId,
      actors: actors.map(actor => ({ ...actor, timeline: { ...actor.timeline, cues: actor.timeline.cues.map(cue => ({ ...cue, id: randomUUID() })) } })) };
    const written: string[] = [];
    try {
      written.push(writeMedia(project, audio, readFileSync(sourceAudio)));
      written.push(writeMedia(project, background, Buffer.from(encoded, 'base64')));
      project.assets.push(audio, background);
      episode.projectScene = record;
      save(project);
    } catch (error) {
      for (const path of written) rmSync(path, { force: true });
      throw error;
    }
    res.status(201).json(record);
  });

  router.get('/:id/episodes/:episodeId/scene', async (req, res) => {
    const project = read(req.params.id);
    const episode = episodeFor(project, req.params.episodeId);
    const loaded = project && episode && await readProjectScene(project, episode);
    if (!loaded) return res.status(404).json({ error: 'Saved scene or media not found.' });
    res.json({ scene: loaded.scene, audioUrl: loaded.audioUrl });
  });

  router.post('/:id/episodes/:episodeId/render', async (req, res, next) => {
    const project = read(req.params.id);
    const episode = episodeFor(project, req.params.episodeId);
    const loaded = project && episode && await readProjectScene(project, episode);
    if (!loaded) return res.status(404).json({ error: 'Saved scene or media not found.' });
    const temp = mkdtempSync(join(tmpdir(), 'kitta-project-render-'));
    const outPath = join(temp, 'scene.mp4');
    try {
      await renderScene({ ...await captureScene(loaded.scene), audioPath: loaded.audioPath, outPath });
      res.download(outPath, 'scene.mp4', error => {
        rmSync(temp, { recursive: true, force: true });
        if (error) next(error);
      });
    } catch (error) {
      rmSync(temp, { recursive: true, force: true });
      throw error;
    }
  });

  router.use((error: unknown, _req: unknown, res: import('express').Response, next: import('express').NextFunction) => {
    if (error instanceof SetError) return res.status(409).json({ error: error.message });
    if (error instanceof MissingSceneCharacterError) return res.status(409).json({ error: error.message });
    if (error instanceof multer.MulterError) return res.status(400).json({ error: 'Upload one media file up to 100 MB.' });
    next(error);
  });
  return router;
}
