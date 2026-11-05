import { randomUUID } from 'node:crypto';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import type { MediaAsset, Project, ProjectAsset, ProjectScene } from '../shared/projects';
import type { Scene } from '../shared/scene';
import { isArt } from '../shared/types';
import { AUDIO_DIR } from './audio';
import { renderScene } from './render';
import { hydrateScene, loadScene, sceneImages, snapshotScene } from './scene';
import { getCharacter } from './characters';

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const mediaTypes: Record<string, MediaAsset['kind']> = {
  'image/png': 'image', 'image/jpeg': 'image', 'image/webp': 'image', 'image/svg+xml': 'svg',
  'audio/wav': 'audio', 'audio/x-wav': 'audio', 'audio/mpeg': 'audio', 'audio/mp4': 'audio', 'audio/ogg': 'audio',
};
const clean = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';

// shortcut: check common signatures at import, decode when an editor consumes the asset.
function matchesMedia(mime: string, bytes: Buffer): boolean {
  const tag = (start: number, end: number) => bytes.toString('latin1', start, end);
  switch (mime) {
    case 'image/png': return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    case 'image/jpeg': return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    case 'image/webp': return tag(0, 4) === 'RIFF' && tag(8, 12) === 'WEBP';
    case 'image/svg+xml': return /^(?:\s|<\?xml[^?]*\?>|<!--[\s\S]*?-->)*<svg(?:\s|\/>|>)/.test(bytes.toString('utf8'));
    case 'audio/wav':
    case 'audio/x-wav': return tag(0, 4) === 'RIFF' && tag(8, 12) === 'WAVE';
    case 'audio/mpeg': return tag(0, 3) === 'ID3' || (bytes[0] === 255 && (bytes[1] & 224) === 224);
    case 'audio/mp4': return tag(4, 8) === 'ftyp';
    case 'audio/ogg': return tag(0, 4) === 'OggS';
    default: return false;
  }
}

export function projectRoutes(root = resolve('data/projects'), {
  loadSample = () => loadScene('first-scene'), audioDir = AUDIO_DIR,
}: { loadSample?: () => Promise<Scene | null>; audioDir?: string } = {}) {
  const router = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 1 } });
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
    writeFileSync(path, bytes, { flag: 'wx' });
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
    res.json(projects);
  });
  router.post('/', (req, res) => {
    const name = clean(req.body?.name, 100);
    if (!name) return res.status(400).json({ error: 'Enter a project name.' });
    const style = req.body?.style;
    if (style !== 'svg' && style !== 'ai') return res.status(400).json({ error: 'Choose SVG or AI for this project.' });
    const project: Project = { id: randomUUID(), name, style, premise: clean(req.body?.premise, 2000), assets: [], episodes: [] };
    save(project);
    res.status(201).json(project);
  });
  router.get('/:id', (req, res) => {
    const project = read(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    res.json(project);
  });
  router.post('/:id/assets', upload.single('media'), async (req, res) => {
    let project = read(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    let asset: ProjectAsset;
    let mediaPath: string | undefined;
    if (req.file) {
      const mime = req.file.mimetype;
      const kind = Object.hasOwn(mediaTypes, mime) ? mediaTypes[mime] : undefined;
      if (!kind || !matchesMedia(mime, req.file.buffer)) return res.status(400).json({ error: 'Choose a supported image, SVG or audio file.' });
      const id = randomUUID();
      const name = clean(basename(req.file.originalname.replaceAll('\\', '/')), 140) || 'Imported media';
      asset = { id, name, kind, mime, location: 'media/' + id, provenance: 'imported' };
      mediaPath = writeMedia(project, asset, req.file.buffer);
    } else {
      if (project.style !== 'ai') return res.status(400).json({ error: 'Saved AI characters require an AI project.' });
      const characterId = req.body?.characterId;
      if (typeof characterId !== 'string' || !uuid.test(characterId)) return res.status(400).json({ error: 'Select a saved character.' });
      let character;
      try { character = await getCharacter(characterId); }
      catch { return res.status(404).json({ error: 'Character not found.' }); }
      project = read(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found.' });
      if (project.assets.some(item => item.kind === 'character' && item.characterId === characterId)) return res.json(project);
      asset = { id: randomUUID(), name: character.name, kind: 'character', characterId, provenance: 'saved-character' };
    }
    project.assets.push(asset);
    try { save(project); }
    catch (error) {
      if (mediaPath) rmSync(mediaPath, { force: true });
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
  const episodeFor = (project: Project | undefined, episodeId: string) =>
    project?.episodes.find(episode => episode.id === episodeId);
  const readProjectScene = async (project: Project, record: ProjectScene) => {
    const audio = project.assets.find(asset => asset.id === record.audioAssetId);
    const background = project.assets.find(asset => asset.id === record.backgroundAssetId);
    if (audio?.kind !== 'audio' || (background?.kind !== 'svg' && background?.kind !== 'image')) return;
    const audioPath = assetPath(project, audio);
    const backgroundPath = assetPath(project, background);
    if (!audioPath || !backgroundPath) return;
    const { title, durationMs, actors, shots } = record;
    const scene = await hydrateScene({ title, durationMs, actors, shots, audioId: audio.id,
      background: 'data:' + background.mime + ';base64,' + readFileSync(backgroundPath).toString('base64') });
    return { scene, audioPath, audioUrl: '/api/projects/' + project.id + '/assets/' + audio.id };
  };

  router.post('/:id/episodes/:episodeId/sample', async (req, res) => {
    const initial = read(req.params.id);
    const oldEpisode = episodeFor(initial, req.params.episodeId);
    if (!initial || !oldEpisode) return res.status(404).json({ error: 'Episode not found.' });
    if (oldEpisode.projectScene) return res.json(oldEpisode.projectScene);
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
    if (episode.projectScene) return res.json(episode.projectScene);
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
    const record = episodeFor(project, req.params.episodeId)?.projectScene;
    const loaded = project && record && await readProjectScene(project, record);
    if (!loaded) return res.status(404).json({ error: 'Saved scene or media not found.' });
    res.json({ scene: loaded.scene, audioUrl: loaded.audioUrl });
  });

  router.post('/:id/episodes/:episodeId/render', async (req, res, next) => {
    const project = read(req.params.id);
    const record = episodeFor(project, req.params.episodeId)?.projectScene;
    const loaded = project && record && await readProjectScene(project, record);
    if (!loaded) return res.status(404).json({ error: 'Saved scene or media not found.' });
    const temp = mkdtempSync(join(tmpdir(), 'kitta-project-render-'));
    const outPath = join(temp, 'scene.mp4');
    try {
      await renderScene({ scene: loaded.scene, images: await sceneImages(loaded.scene), audioPath: loaded.audioPath, outPath });
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
    if (error instanceof multer.MulterError) return res.status(400).json({ error: 'Upload one media file up to 25 MB.' });
    next(error);
  });
  return router;
}
