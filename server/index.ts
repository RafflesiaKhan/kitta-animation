import express from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizeAudio, concatWithGaps, AudioError, AUDIO_DIR } from './audio';
import { autoTag, transcribe, GeminiError } from './gemini';
import { OpenAIError, voiceStudioUrl, voiceStudioVoices } from './openai';
import { isTransient, speakLine, ttsProviders } from './speech';
import { resetUsage, usageReport } from './usage';
import { TTS_PROVIDERS, TTS_PROVIDER_NAMES, type TtsProvider } from '../shared/voices';
import { imageProviders } from './images';
import { EXPRESSIONS, GESTURES } from '../shared/types';
import type { Line, ScriptLineInput } from '../shared/types';
import { runRhubarb, rhubarbAvailable } from './rhubarb';
import { renderVideo } from './render';
import { validateExport } from './validate';
import { CharacterError, createCharacter, deleteCharacter, generatePose, getCharacter, imageDataUris, imagePath, listCharacters } from './characters';
import { ART_STYLES } from '../shared/character/art';
import { isArt, type ArtPose } from '../shared/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UPLOAD_DIR = join('data', 'uploads');
const EXPORT_DIR = join('data', 'exports');
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const EXPORT_FILE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp4|webm)$/i;

/** Sends the standard JSON error for an OpenAI failure; `failed` is the 502 message. */
function sendOpenAIError(res: express.Response, e: OpenAIError, failed: string) {
  const who = e.service;
  if (e.code === 'no_key' && who === 'VoiceStudio') res.status(400).json({ error: 'VoiceStudio asked for an API key: set VOICESTUDIO_API_KEY in .env' });
  else if (e.code === 'no_key') res.status(400).json({ error: 'OpenAI key missing: add OPENAI_API_KEY to .env' });
  else if (e.code === 'bad_key') res.status(400).json({ error: 'OpenAI key looks invalid: check OPENAI_API_KEY in .env' });
  else if (e.code === 'unreachable') res.status(503).json({ error: `VoiceStudio isn't running at ${voiceStudioUrl()}. Start it, then try again.` });
  else if (e.code === 'rate_limited') res.status(429).json({ error: `${who} limit or quota reached, try again later` });
  else if (e.code === 'busy') res.status(503).json({ error: `${who} is busy right now. Please try again in a minute.` });
  else if (e.code === 'timed_out') res.status(504).json({ error: `${who} took too long to answer. Please try again.` });
  else if (e.code === 'no_image') res.status(422).json({ error: `${who} didn't draw a picture for that. Try rewording the description.` });
  else res.status(502).json({ error: failed });
}

/** Sends the standard JSON error for a Gemini (or OpenAI) failure; `failed` is the 502 message. */
function sendGeminiError(res: express.Response, e: unknown, failed: string): boolean {
  if (e instanceof OpenAIError) { sendOpenAIError(res, e, failed); return true; }
  if (!(e instanceof GeminiError)) return false;
  if (e.code === 'no_key') res.status(400).json({ error: 'Gemini key missing — add GEMINI_API_KEY to .env' });
  else if (e.code === 'bad_key') res.status(400).json({ error: 'Gemini key looks invalid — check GEMINI_API_KEY in .env' });
  else if (e.code === 'rate_limited') res.status(429).json({ error: 'Free Gemini limit reached, try again later' });
  else if (e.code === 'busy') res.status(503).json({ error: 'Gemini is busy right now. Please try again in a minute.' });
  else if (e.code === 'timed_out') res.status(504).json({ error: 'Gemini took too long to answer. Please try again.' });
  else if (e.code === 'no_image') res.status(422).json({ error: "Gemini didn't draw a picture for that. Try rewording the description." });
  else res.status(502).json({ error: failed });
  return true;
}

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  const upload = multer({ dest: UPLOAD_DIR, limits: { fileSize: 100 * 1024 * 1024 } });
  const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

  /** Standard replies for character-library failures; false when e is something else. */
  const sendCharacterError = (res: express.Response, e: unknown, failed: string) => {
    if (e instanceof CharacterError) {
      if (e.code === 'not_found') res.status(404).json({ error: 'Character not found' });
      else if (e.code === 'bad_pose') res.status(400).json({ error: 'Invalid request' });
      else res.status(502).json({ error: failed });
      return true;
    }
    return sendGeminiError(res, e, failed);
  };

  const audioPath = (id: unknown) =>
    typeof id === 'string' && UUID_RE.test(id) ? join(AUDIO_DIR, `${id}.wav`) : null;

  app.get('/api/health', async (_req, res) => {
    res.json({ rhubarb: await rhubarbAvailable(), gemini: Boolean(process.env.GEMINI_API_KEY), imageProviders: imageProviders(), ttsProviders: ttsProviders() });
  });

  // Token telemetry for the usage panel.
  app.get('/api/usage', async (_req, res) => {
    res.json(await usageReport());
  });
  app.delete('/api/usage', async (_req, res) => {
    await resetUsage();
    res.status(204).end();
  });

  // VoiceStudio's voices come from the running app (its saved and built-in voices).
  app.get('/api/voices/voicestudio', async (_req, res) => {
    res.json({ voices: await voiceStudioVoices() });
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

  app.post('/api/tts', async (req, res) => {
    const raw = req.body?.lines;
    const isLine = (l: any) =>
      l && typeof l.text === 'string' && l.text.length <= 500 && typeof l.voice === 'string' && l.voice &&
      EXPRESSIONS.includes(l.expression) && GESTURES.includes(l.gesture) && (l.note === undefined || (typeof l.note === 'string' && l.note.length <= 200));
    const provider: TtsProvider = req.body?.provider ?? ttsProviders()[0] ?? 'gemini';
    if (!Array.isArray(raw) || raw.length < 1 || raw.length > 50 || !raw.every(isLine) || !TTS_PROVIDERS.includes(provider)) return res.status(400).json({ error: 'Invalid request' });
    const lines = raw as ScriptLineInput[];
    const emptyAt = lines.findIndex((l) => !l.text.trim());
    if (emptyAt >= 0) return res.status(400).json({ error: `Line ${emptyAt + 1} is empty` });
    try {
      const wavs: Buffer[] = [];
      for (const l of lines) wavs.push(await speakLine(provider, l)); // sequential: kinder to free-tier limits
      const { path, durationMs, spans } = await concatWithGaps(wavs);
      const dialog = lines.map((l) => l.text.replace(/<[^>]*>/g, ' ')).join(' ').replace(/\s+/g, ' ').trim();
      const cues = await runRhubarb(path, dialog || undefined);
      const out: Line[] = lines.map((l, i) => ({ text: l.text, expression: l.expression, gesture: l.gesture, ...spans[i] }));
      res.json({ audioId: basename(path, '.wav'), durationMs, lines: out, cues });
    } catch (e) {
      // Still busy after the retries: point at the other voice providers that are set up.
      const others = ttsProviders().filter((p) => p !== provider);
      if (isTransient(e) && others.length) {
        const name = TTS_PROVIDER_NAMES[provider].split(' ')[0];
        const status = (e as { code: string }).code === 'busy' ? 503 : 429;
        return res.status(status).json({ error: `${name} is ${status === 503 ? 'busy' : 'at its limit'} right now. Try again in a minute, or switch "Voice by" to ${others.map((p) => TTS_PROVIDER_NAMES[p]).join(' or ')}.` });
      }
      if (sendGeminiError(res, e, 'Voice generation failed. Please try again.')) return;
      if (e instanceof AudioError && e.code === 'too_long') res.status(400).json({ error: 'Script is longer than 3 minutes. Please shorten it.' });
      else {
        console.error('tts failed', e);
        res.status(502).json({ error: 'Voice generation failed. Please try again.' });
      }
    }
  });

  app.post('/api/autotag', async (req, res) => {
    const texts = req.body?.texts;
    if (!Array.isArray(texts) || texts.length > 50 || !texts.every((t) => typeof t === 'string' && t.length <= 500)) {
      return res.status(400).json({ error: 'Invalid request' });
    }
    try {
      res.json({ tags: await autoTag(texts) });
    } catch (e) {
      if (!sendGeminiError(res, e, 'AI tagging failed. Please try again.')) {
        console.error('autotag failed', e);
        res.status(502).json({ error: 'AI tagging failed. Please try again.' });
      }
    }
  });

  app.post('/api/transcribe', async (req, res) => {
    const p = audioPath(req.body?.audioId);
    if (!p || !existsSync(p)) return res.status(404).json({ error: 'Audio not found' });
    try {
      res.json({ lines: await transcribe(p) });
    } catch (e) {
      if (!sendGeminiError(res, e, 'AI tagging failed. Please try again.')) {
        console.error('transcribe failed', e);
        res.status(502).json({ error: 'AI tagging failed. Please try again.' });
      }
    }
  });

  // ---------- AI character library ----------
  app.get('/api/characters', async (_req, res) => {
    res.json({ characters: await listCharacters() });
  });

  app.post('/api/characters', (req, res) => {
    imageUpload.single('reference')(req, res, async (err) => {
      const ref = req.file;
      const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
      const style = req.body?.style;
      const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
      const providers = imageProviders();
      const provider = req.body?.provider || providers[0];
      if (!providers.length) return res.status(400).json({ error: 'Add GEMINI_API_KEY or OPENAI_API_KEY to .env to create characters.' });
      if (!providers.includes(provider)) return res.status(400).json({ error: 'Invalid request' });
      if (err || (ref && !IMAGE_TYPES.includes(ref.mimetype))) return res.status(400).json({ error: 'Reference must be a PNG, JPEG or WebP image up to 10 MB.' });
      if ((!description && !ref) || description.length > 400 || name.length > 40 || !ART_STYLES.includes(style)) return res.status(400).json({ error: 'Invalid request' });
      try {
        const character = await createCharacter({
          description, style, provider,
          name: name || description.split(/\s+/).slice(0, 3).join(' ') || 'My character',
          reference: ref ? { data: ref.buffer, mimeType: ref.mimetype } : undefined,
        });
        res.json({ character });
      } catch (e) {
        if (!sendCharacterError(res, e, 'Character creation failed. Please try again.')) {
          console.error('create character failed', e);
          res.status(502).json({ error: 'Character creation failed. Please try again.' });
        }
      }
    });
  });

  app.post('/api/characters/:id/poses/:pose', async (req, res) => {
    try {
      res.json({ character: await generatePose(req.params.id, req.params.pose as ArtPose) });
    } catch (e) {
      if (!sendCharacterError(res, e, 'Drawing failed. Please try again.')) {
        console.error('generate pose failed', e);
        res.status(502).json({ error: 'Drawing failed. Please try again.' });
      }
    }
  });

  app.delete('/api/characters/:id', async (req, res) => {
    try {
      await deleteCharacter(req.params.id);
      res.status(204).end();
    } catch (e) {
      if (!sendCharacterError(res, e, 'Delete failed.')) res.status(500).json({ error: 'Delete failed.' });
    }
  });

  app.get('/api/characters/:id/:file', (req, res) => {
    const p = imagePath(req.params.id, req.params.file);
    if (!p) return res.status(404).json({ error: 'Image not found' });
    res.type('image/png').sendFile(p, { root: process.cwd() });
  });

  app.post('/api/export', async (req, res) => {
    const p = audioPath(req.body?.audioId);
    if (!p || !existsSync(p)) return res.status(404).json({ error: 'Audio not found' });
    const input = validateExport(req.body);
    if (!input) return res.status(400).json({ error: 'Invalid request' });
    // An AI character is always drawn from the library on disk, never from images named by the client.
    let images: Record<string, string> | undefined;
    if (isArt(input.character)) {
      try {
        input.character = await getCharacter(input.character.id);
        images = await imageDataUris(input.character);
      } catch {
        return res.status(404).json({ error: 'Character not found' });
      }
    }
    const ext = input.format.transparent ? 'webm' : 'mp4';
    const file = `${randomUUID()}.${ext}`;
    await mkdir(EXPORT_DIR, { recursive: true });
    res.type('application/x-ndjson');
    const send = (o: object) => res.write(`${JSON.stringify(o)}\n`);
    let lastSent = -1;
    try {
      await renderVideo({
        ...input,
        images,
        audioPath: p,
        outPath: join(EXPORT_DIR, file),
        onProgress: (frame, total) => {
          const step = Math.floor((frame / total) * 20); // at most ~20 progress lines
          if (step > lastSent && frame < total) { lastSent = step; send({ progress: frame / total }); }
        },
      });
      send({ done: true, url: `/api/exports/${file}` });
    } catch (e) {
      console.error('export failed', e);
      await rm(join(EXPORT_DIR, file), { force: true });
      send({ error: 'Export failed. Please try again.' });
    }
    res.end();
  });

  app.get('/api/exports/:file', (req, res) => {
    if (!EXPORT_FILE_RE.test(req.params.file)) return res.status(404).json({ error: 'Export not found' });
    const p = join(EXPORT_DIR, req.params.file);
    if (!existsSync(p)) return res.status(404).json({ error: 'Export not found' });
    res.download(p, `kitta-animation.${req.params.file.split('.')[1]}`, { root: process.cwd() });
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
  createApp().listen(5175, '127.0.0.1', () => console.log('Kitta API on http://127.0.0.1:5175'));
}
