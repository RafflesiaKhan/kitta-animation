import type { ImageProvider, MouthBox } from '../shared/types';
import * as gemini from './gemini';
import * as openai from './openai';
import type { ImageInput, ImageShape } from './gemini';
import { setting } from './settings';

// Routes AI-character image work to a provider. A character remembers the provider that painted it,
// so all of its poses come from the same model.

const KEYS: Record<ImageProvider, string> = { gemini: 'GEMINI_API_KEY', openai: 'OPENAI_API_KEY' };

/** Providers with a key in the environment, in order of preference. */
export function imageProviders(): ImageProvider[] {
  const out = (Object.keys(KEYS) as ImageProvider[]).filter((p) => Boolean(setting(KEYS[p])));
  const preferred = setting('DEFAULT_IMAGE_PROVIDER') as ImageProvider | undefined;
  return preferred && out.includes(preferred) ? [preferred, ...out.filter(p => p !== preferred)] : out;
}

export function paint(provider: ImageProvider, prompt: string, refs: ImageInput[] = [], shape: ImageShape = 'square'): Promise<Buffer> {
  return provider === 'openai' ? openai.generateImage(prompt, refs, shape) : gemini.generateImage(prompt, refs, shape);
}

/**
 * Gemini when it has a key (its boxes are the more precise), otherwise OpenAI; null without either.
 * If Gemini fails (e.g. its quota is used up) and OpenAI has a key, OpenAI takes over.
 */
export async function locateMouth(png: Buffer): Promise<MouthBox | null> {
  if (setting('GEMINI_API_KEY')) {
    try {
      return await gemini.findMouth(png);
    } catch (e) {
      if (!setting('OPENAI_API_KEY')) throw e;
      console.warn(`mouth lookup: Gemini failed (${(e as Error)?.message}), trying OpenAI`);
    }
  }
  if (setting('OPENAI_API_KEY')) return openai.findMouth(png);
  return null;
}
