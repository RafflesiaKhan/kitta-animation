import type { MouthBox } from '../shared/types';
import { MOUTH_PROMPT, parseMouthBox, type ImageInput } from './gemini';

// OpenAI as a second provider for AI characters: image generation/editing and the mouth lookup.
// Plain fetch against the REST API, so there is no extra SDK; models come from env.

export class OpenAIError extends Error {
  constructor(public code: 'no_key' | 'bad_key' | 'rate_limited' | 'busy' | 'timed_out' | 'no_image' | 'failed') {
    super(code);
    this.name = 'OpenAIError';
  }
}

const API = 'https://api.openai.com/v1';
const IMAGE_TIMEOUT_MS = 180_000; // gpt-image models can take a minute or more per picture
const MOUTH_TIMEOUT_MS = 30_000;
const imageModel = () => process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';
const visionModel = () => process.env.OPENAI_VISION_MODEL || 'gpt-5-mini';

function key(): string {
  const k = process.env.OPENAI_API_KEY;
  if (!k) throw new OpenAIError('no_key');
  return k;
}

/** Sends one request and maps failures like toGeminiError does (401 -> bad_key, 429 -> rate_limited, 5xx -> busy, abort -> timed_out). */
async function call(path: string, body: BodyInit, timeoutMs: number, json: boolean): Promise<any> {
  const headers: Record<string, string> = { Authorization: `Bearer ${key()}` };
  if (json) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { method: 'POST', headers, body, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    const name = (e as { name?: string })?.name;
    if (name === 'TimeoutError' || name === 'AbortError') throw new OpenAIError('timed_out');
    console.error(`openai ${path} failed`, (e as Error)?.message);
    throw new OpenAIError('failed');
  }
  const out = await res.json().catch(() => ({}));
  if (res.ok) return out;
  const code: string = out?.error?.code ?? '';
  if (res.status === 401) throw new OpenAIError('bad_key');
  if (res.status === 429) throw new OpenAIError('rate_limited');
  if (res.status >= 500) throw new OpenAIError('busy');
  if (/moderation|safety|content_policy/i.test(code)) throw new OpenAIError('no_image');
  console.error(`openai ${path} failed`, res.status, out?.error?.message ?? '');
  throw new OpenAIError('failed');
}

/** Paints one 1024² image; with reference images it is an edit of them (images/edits). */
export async function generateImage(prompt: string, refs: ImageInput[] = []): Promise<Buffer> {
  let out: any;
  if (refs.length === 0) {
    out = await call('/images/generations', JSON.stringify({ model: imageModel(), prompt, size: '1024x1024', n: 1 }), IMAGE_TIMEOUT_MS, true);
  } else {
    const form = new FormData();
    form.append('model', imageModel());
    form.append('prompt', prompt);
    form.append('size', '1024x1024');
    refs.forEach((r, i) => form.append('image[]', new Blob([new Uint8Array(r.data)], { type: r.mimeType }), `ref-${i}.${r.mimeType.split('/')[1]}`));
    out = await call('/images/edits', form, IMAGE_TIMEOUT_MS, false);
  }
  const b64 = out?.data?.[0]?.b64_json;
  if (typeof b64 !== 'string' || !b64) throw new OpenAIError('no_image');
  return Buffer.from(b64, 'base64');
}

/** Same contract as the Gemini findMouth: null when there is no clear mouth. */
export async function findMouth(png: Buffer): Promise<MouthBox | null> {
  const out = await call('/chat/completions', JSON.stringify({
    model: visionModel(),
    messages: [{ role: 'user', content: [
      { type: 'text', text: MOUTH_PROMPT },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${png.toString('base64')}` } },
    ] }],
    response_format: { type: 'json_schema', json_schema: { name: 'mouth', strict: true, schema: {
      type: 'object',
      properties: { found: { type: 'boolean' }, box_2d: { type: 'array', items: { type: 'number' } }, skin: { type: 'string' } },
      required: ['found', 'box_2d', 'skin'],
      additionalProperties: false,
    } } },
  }), MOUTH_TIMEOUT_MS, true);
  try {
    return parseMouthBox(JSON.parse(out?.choices?.[0]?.message?.content ?? ''));
  } catch {
    return null;
  }
}
