import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import type { Project, ProjectAsset } from '../shared/projects';
import { getCharacter } from './characters';
import { createSceneSample } from './scene-sample';

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const mediaTypes: Record<string, ProjectAsset['kind']> = {
  'image/png': 'image', 'image/jpeg': 'image', 'image/webp': 'image', 'image/svg+xml': 'svg',
  'audio/wav': 'audio', 'audio/x-wav': 'audio', 'audio/mpeg': 'audio', 'audio/mp4': 'audio', 'audio/ogg': 'audio',
};
const clean = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';

export function projectRoutes(exportDir: string, root = resolve('data', 'projects')) {
  const router = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 1 } });
  const jsonPath = (id: string) => join(root, id, 'project.json');
  const read = (id: string | string[]): Project | undefined => {
    if (typeof id === 'string' && uuid.test(id) && existsSync(jsonPath(id))) return JSON.parse(readFileSync(jsonPath(id), 'utf8'));
  };
  const save = (project: Project) => {
    const path = jsonPath(project.id);
    mkdirSync(join(root, project.id), { recursive: true });
    const temp = path + '.tmp';
    writeFileSync(temp, JSON.stringify(project, null, 2) + '\n');
    renameSync(temp, path);
  };

  router.get('/', (_req, res) => {
    const projects = existsSync(root) ? readdirSync(root).map(read).filter(Boolean) : [];
    res.json(projects);
  });
  router.post('/', (req, res) => {
    const name = clean(req.body?.name, 100);
    if (!name) return res.status(400).json({ error: 'Enter a project name.' });
    const project: Project = { id: randomUUID(), name, premise: clean(req.body?.premise, 2000), assets: [], episodes: [] };
    save(project);
    res.status(201).json(project);
  });
  router.get('/:id', (req, res) => {
    const project = read(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    res.json(project);
  });
  router.post('/:id/assets', upload.single('media'), async (req, res) => {
    if (!read(req.params.id)) return res.status(404).json({ error: 'Project not found.' });
    let asset: ProjectAsset;
    if (req.file) {
      const mime = req.file.mimetype;
      const kind = Object.hasOwn(mediaTypes, mime) ? mediaTypes[mime] : undefined;
      if (!kind || !req.file.size) return res.status(400).json({ error: 'Choose a supported image, SVG or audio file.' });
      asset = { id: randomUUID(), name: clean(req.file.originalname, 140) || 'Imported media', kind, mime };
    } else {
      const characterId = clean(req.body?.characterId, 36);
      if (!uuid.test(characterId)) return res.status(400).json({ error: 'Select a saved character.' });
      let character;
      try { character = await getCharacter(characterId); }
      catch { return res.status(404).json({ error: 'Character not found.' }); }
      asset = { id: randomUUID(), name: character.name, kind: 'character', characterId };
    }
    const project = read(req.params.id)!;
    if (asset.characterId && project.assets.some(item => item.characterId === asset.characterId)) return res.json(project);
    const mediaPath = join(root, project.id, asset.id);
    if (req.file) writeFileSync(mediaPath, req.file.buffer, { flag: 'wx' });
    project.assets.push(asset);
    try { save(project); }
    catch (error) {
      if (req.file) rmSync(mediaPath, { force: true });
      throw error;
    }
    res.status(201).json(project);
  });
  router.get('/:id/assets/:assetId', (req, res) => {
    const project = read(req.params.id);
    const asset = project?.assets.find(item => item.id === req.params.assetId);
    if (!project || !asset?.mime) return res.status(404).end();
    res.set({ 'Content-Security-Policy': "sandbox; default-src 'none'", 'X-Content-Type-Options': 'nosniff' });
    res.type(asset.mime).sendFile(join(root, project.id, asset.id));
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
  const pending = new Set<string>();
  router.post('/:id/episodes/:episodeId/sample', async (req, res) => {
    const episode = read(req.params.id)?.episodes.find(item => item.id === req.params.episodeId);
    if (!episode) return res.status(404).json({ error: 'Episode not found.' });
    if (episode.scene) return res.json(episode.scene.sample);
    if (pending.has(episode.id)) return res.status(409).json({ error: 'This episode’s scene is already rendering.' });
    pending.add(episode.id);
    try {
      const sample = await createSceneSample(exportDir);
      const project = read(req.params.id)!;
      project.episodes.find(item => item.id === episode.id)!.scene = { id: randomUUID(), sample };
      save(project);
      res.json(sample);
    } catch (error) {
      console.error('Project scene generation failed:', error);
      res.status(500).json({ error: 'Could not save the scene. Check VoiceStudio and FFmpeg.' });
    } finally {
      pending.delete(episode.id);
    }
  });
  router.use((error: unknown, _req: unknown, res: import('express').Response, next: import('express').NextFunction) => {
    if (error instanceof multer.MulterError) return res.status(400).json({ error: 'Upload one media file up to 25 MB.' });
    next(error);
  });
  return router;
}
