import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const generateContent = vi.fn();
vi.mock('@google/genai', () => ({
  GoogleGenAI: class { models = { generateContent }; },
}));

import { tts, GeminiError, VOICES } from '../../server/gemini';
import { concatWithGaps } from '../../server/audio';

const reply = (pcm: Buffer) => ({ candidates: [{ content: { parts: [{ inlineData: { data: pcm.toString('base64'), mimeType: 'audio/L16;rate=24000' } }] } }] });
const line = { text: 'Hello there', voice: 'Kore', expression: 'happy' as const, gesture: 'none' as const };

beforeEach(() => { process.env.GEMINI_API_KEY = 'test-key'; generateContent.mockReset(); });
afterEach(() => { delete process.env.GEMINI_API_KEY; });

describe('tts', () => {
  it('builds the prompt and wraps PCM in a WAV', async () => {
    generateContent.mockResolvedValue(reply(Buffer.alloc(48000)));
    const wav = await tts({ ...line, note: 'whispering' });
    expect(wav.subarray(0, 4).toString()).toBe('RIFF');
    expect(wav.length).toBe(44 + 48000);
    const arg = generateContent.mock.calls[0][0];
    expect(arg.contents).toBe('Say in a happy tone, whispering: Hello there');
    expect(arg.config.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Kore');
    expect(VOICES.length).toBeGreaterThanOrEqual(6);
  });

  it('omits the note and passes tags through', async () => {
    generateContent.mockResolvedValue(reply(Buffer.alloc(100)));
    await tts({ ...line, text: 'Hi <short pause> there' });
    expect(generateContent.mock.calls[0][0].contents).toBe('Say in a happy tone: Hi <short pause> there');
  });

  it('throws no_key without an env key', async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(tts(line)).rejects.toMatchObject({ name: 'GeminiError', code: 'no_key' });
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('maps status 429 to rate_limited', async () => {
    generateContent.mockRejectedValue(Object.assign(new Error('quota'), { status: 429 }));
    await expect(tts(line)).rejects.toMatchObject({ code: 'rate_limited' });
  });

  it('maps other failures and empty audio to failed', async () => {
    generateContent.mockRejectedValue(new Error('boom'));
    await expect(tts(line)).rejects.toBeInstanceOf(GeminiError);
    generateContent.mockResolvedValue({ candidates: [] });
    await expect(tts(line)).rejects.toMatchObject({ code: 'failed' });
  });
});

describe('concatWithGaps', () => {
  it('joins two 1s clips with a 250ms gap between them only', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kitta-cat-'));
    const p = join(dir, 'a.wav');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-ar', '24000', '-ac', '1', p]);
    const wav = readFileSync(p);
    const r = await concatWithGaps([wav, wav]);
    expect(Math.abs(r.durationMs - 2250)).toBeLessThan(20);
    expect(r.spans).toHaveLength(2);
    expect(Math.abs(r.spans[0].endMs - 1000)).toBeLessThan(20);
    expect(Math.abs(r.spans[1].startMs - 1250)).toBeLessThan(20);
    expect(Math.abs(r.spans[1].endMs - 2250)).toBeLessThan(20);
    rmSync(r.path, { force: true });
    rmSync(dir, { recursive: true, force: true });
  });
});
