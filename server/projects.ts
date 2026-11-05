import { randomUUID } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import type { MediaAsset, Project, ProjectAsset } from '../shared/projects';
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

export function projectRoutes(root = resolve('data/projects')) {
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
      const mediaDir = join(dir(project.id), 'media');
      mkdirSync(mediaDir, { recursive: true });
      if (!lstatSync(mediaDir).isDirectory()) throw new Error('Invalid project media directory');
      mediaPath = join(dir(project.id), asset.location);
      writeFileSync(mediaPath, req.file.buffer, { flag: 'wx' });
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
    if (!project || !asset || asset.kind === 'character' || !Object.hasOwn(mediaTypes, asset.mime)) return res.status(404).end();
    const expected = 'media/' + asset.id;
    // Draft uploads used UUID filenames directly in the project directory.
    if (asset.location !== undefined && (asset.location !== expected || !lstatSync(join(dir(project.id), 'media'), { throwIfNoEntry: false })?.isDirectory())) return res.status(404).end();
    const path = join(dir(project.id), asset.location ?? asset.id);
    if (!lstatSync(path, { throwIfNoEntry: false })?.isFile()) return res.status(404).end();
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
  router.use((error: unknown, _req: unknown, res: import('express').Response, next: import('express').NextFunction) => {
    if (error instanceof multer.MulterError) return res.status(400).json({ error: 'Upload one media file up to 25 MB.' });
    next(error);
  });
  return router;
}
