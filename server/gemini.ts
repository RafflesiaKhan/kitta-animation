import { GoogleGenAI } from '@google/genai';
import type { ScriptLineInput } from '../shared/types';

export { VOICES } from '../shared/voices';

export class GeminiError extends Error {
  constructor(public code: 'no_key' | 'rate_limited' | 'failed') {
    super(code);
    this.name = 'GeminiError';
  }
}

const SAMPLE_RATE = 24000; // Gemini TTS: 24 kHz, 16-bit, mono

function wrapPcm(pcm: Buffer): Buffer {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SAMPLE_RATE, 24); h.writeUInt32LE(SAMPLE_RATE * 2, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/** Speaks one line with Gemini TTS and returns a WAV buffer. */
export async function tts(line: ScriptLineInput): Promise<Buffer> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiError('no_key');
  try {
    const ai = new GoogleGenAI({ apiKey });
    const res = await ai.models.generateContent({
      model: process.env.GEMINI_TTS_MODEL || 'gemini-3.8-flash-tts',
      contents: `Say in a ${line.expression} tone${line.note ? ', ' + line.note : ''}: ${line.text}`,
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: line.voice } } },
      },
    });
    const data = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data;
    if (!data) throw new Error('no audio in response');
    const bytes = Buffer.from(data, 'base64');
    return bytes.subarray(0, 4).toString() === 'RIFF' ? bytes : wrapPcm(bytes);
  } catch (e) {
    if (e instanceof GeminiError) throw e;
    const err = e as { status?: number; message?: string };
    if (err?.status === 429 || /RESOURCE_EXHAUSTED/.test(err?.message ?? '')) throw new GeminiError('rate_limited');
    console.error('gemini tts failed', err?.status ?? '', err?.message ?? 'unknown error');
    throw new GeminiError('failed');
  }
}
