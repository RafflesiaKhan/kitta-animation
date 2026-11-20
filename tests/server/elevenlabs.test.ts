import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { ElevenLabsError, listElevenVoices, resetElevenVoices, speakEleven } from '../../server/elevenlabs';
import { speakLine, ttsProviders } from '../../server/speech';
import { resetUsage, usageReport } from '../../server/usage';
import { createApp } from '../../server/index';

const fetchMock = vi.fn();
const wav = Buffer.from('RIFF....WAVEfmt fake');
const audio = () => new Response(new Uint8Array(wav), { status: 200, headers: { 'Content-Type': 'audio/wav' } });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const realFetch = globalThis.fetch;

beforeEach(async () => {
  fetchMock.mockReset();
  // supertest talks to the app over real HTTP, so only ElevenLabs goes to the mock
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => (String(url).startsWith('https://api.elevenlabs.io') ? fetchMock(url, init) : realFetch(url, init)));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  process.env.ELEVENLABS_API_KEY = 'el-test';
  resetElevenVoices();
  await resetUsage();
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); delete process.env.ELEVENLABS_API_KEY; delete process.env.ELEVENLABS_MODEL; });

describe('ElevenLabs speech', () => {
  it('asks for WAV with the chosen voice and model, and records the characters and their cost', async () => {
    fetchMock.mockResolvedValue(audio());
    const out = await speakEleven('Hello there!', 'voice/1');
    expect(out.equals(wav)).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.elevenlabs.io/v1/text-to-speech/voice%2F1?output_format=wav_24000');
    expect(init.headers['xi-api-key']).toBe('el-test');
    expect(JSON.parse(init.body)).toEqual({ text: 'Hello there!', model_id: 'eleven_multilingual_v2' });
    const [row] = (await usageReport()).sessionRows;
    expect(row).toMatchObject({ provider: 'elevenlabs', model: 'eleven_multilingual_v2', input: 12 });
    expect(row.cost).toBeCloseTo(12 * 0.08 / 1000, 9); // $0.08 per 1K characters
  });

  it('uses ELEVENLABS_MODEL', async () => {
    process.env.ELEVENLABS_MODEL = 'eleven_flash_v2_5';
    fetchMock.mockResolvedValue(audio());
    await speakEleven('Hi', 'v');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model_id).toBe('eleven_flash_v2_5');
  });

  it('maps failures to clear codes', async () => {
    const cases: [Response, string][] = [
      [json({ detail: { status: 'invalid_api_key', message: 'Invalid API key' } }, 401), 'bad_key'],
      [json({ detail: { status: 'quota_exceeded', message: 'This request exceeds your quota' } }, 401), 'no_credit'],
      [json({ detail: { status: 'voice_not_found' } }, 404), 'no_voice'],
      [json({ detail: 'too many' }, 429), 'rate_limited'],
      [json({}, 503), 'busy'],
    ];
    for (const [res, code] of cases) {
      fetchMock.mockResolvedValueOnce(res);
      await expect(speakEleven('x', 'v')).rejects.toMatchObject({ code });
    }
    delete process.env.ELEVENLABS_API_KEY;
    await expect(speakEleven('x', 'v')).rejects.toBeInstanceOf(ElevenLabsError);
  });

  it('is offered when its key is set, and speaks a script line', async () => {
    expect(ttsProviders()).toContain('elevenlabs');
    fetchMock.mockResolvedValue(audio());
    const out = await speakLine('elevenlabs', { text: 'Hello.', voice: 'v1', expression: 'happy', gesture: 'none' });
    expect(out.equals(wav)).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toContain('/v1/text-to-speech/v1?');
    delete process.env.ELEVENLABS_API_KEY;
    expect(ttsProviders()).not.toContain('elevenlabs');
  });
});

describe('ElevenLabs voices', () => {
  it('lists every page of the account voices, with a short description', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ voices: [{ voice_id: 'a', name: 'Rachel', category: 'premade', labels: { gender: 'female', accent: 'american' } }], has_more: true, next_page_token: 'p2' }))
      .mockResolvedValueOnce(json({ voices: [{ voice_id: 'b', name: 'My clone', category: 'cloned', labels: {} }], has_more: false, next_page_token: null }));
    expect(await listElevenVoices()).toEqual([
      { id: 'a', label: 'Rachel (female, american)', kind: 'default' },
      { id: 'b', label: 'My clone (cloned)', kind: 'default' },
    ]);
    expect(fetchMock.mock.calls[0][0]).toContain('https://api.elevenlabs.io/v2/voices?page_size=100');
    expect(fetchMock.mock.calls[1][0]).toContain('next_page_token=p2');
    await listElevenVoices(); // cached
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('serves the voices, and a clear error without a key', async () => {
    const app = createApp();
    fetchMock.mockResolvedValueOnce(json({ voices: [{ voice_id: 'a', name: 'Rachel' }], has_more: false }));
    expect((await request(app).get('/api/elevenlabs/voices')).body.voices).toEqual([{ id: 'a', label: 'Rachel', kind: 'default' }]);
    resetElevenVoices();
    delete process.env.ELEVENLABS_API_KEY;
    const r = await request(app).get('/api/elevenlabs/voices');
    expect(r.status).toBe(400);
    expect(r.body.error).toContain('ELEVENLABS_API_KEY');
  });
});
