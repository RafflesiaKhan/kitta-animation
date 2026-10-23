import express from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizeAudio, AudioError, AUDIO_DIR } from './audio';
import { runRhubarb, rhubarbAvailable } from './rhubarb';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UPLOAD_DIR = join('data', 'uploads');

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  const upload = multer({ dest: UPLOAD_DIR, limits: { fileSize: 100 * 1024 * 1024 } });

  const audioPath = (id: unknown) =>
    typeof id === 'string' && UUID_RE.test(id) ? join(AUDIO_DIR, `${id}.wav`) : null;

  app.get('/api/health', async (_req, res) => {
    res.json({ rhubarb: await rhubarbAvailable(), gemini: Boolean(process.env.GEMINI_API_KEY) });
  });

  app.post('/api/audio', async (req, res) => {
    await mkdir(UPLOAD_DIR, { recursive: true });
    upload.single('file')(req, res, async (err) => {
      const file = req.file;
      try {
        if (err || !file) throw new AudioError('unreadable');
        const id = randomUUID();
        const { durationMs } = await normalizeAudio(file.path, id);
        res.json({ audioId: id, durationMs });
      } catch (e) {
        if (e instanceof AudioError && e.code === 'too_long') {
          res.status(400).json({ error: 'Audio is longer than 3 minutes. Please trim it and try again.' });
        } else if (e instanceof AudioError || err) {
          res.status(400).json({ error: "Sorry, we couldn't read this audio file. Try MP3, WAV or M4A." });
        } else {
          console.error('upload failed', e);
          res.status(500).json({ error: 'Upload failed. Please try again.' });
        }
      } finally {
        if (file) await rm(file.path, { force: true });
      }
    });
  });

  app.get('/api/audio/:id', (req, res) => {
    const p = audioPath(req.params.id);
    if (!p || !existsSync(p)) return res.status(404).json({ error: 'Audio not found' });
    res.type('audio/wav').sendFile(p, { root: process.cwd() });
  });

  app.post('/api/lipsync', async (req, res) => {
    const p = audioPath(req.body?.audioId);
    if (!p || !existsSync(p)) return res.status(404).json({ error: 'Audio not found' });
    const dialog = typeof req.body.dialog === 'string' && req.body.dialog.trim() ? req.body.dialog : undefined;
    try {
      res.json({ cues: await runRhubarb(p, dialog) });
    } catch (e) {
      console.error('lipsync failed', e);
      res.status(500).json({ error: 'Lip sync failed. Please try again.' });
    }
  });

  app.use((err: { type?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('request error', err);
    if (err?.type?.startsWith('entity.')) return res.status(400).json({ error: 'Invalid request' });
    res.status(500).json({ error: 'Something went wrong' });
  });

  return app;
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
  if (existsSync('.env')) process.loadEnvFile('.env');
  createApp().listen(5175, () => console.log('Kitta API on http://localhost:5175'));
}
