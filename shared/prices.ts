// API prices, in USD per 1M tokens, standard tier (not batch, not priority/fast), checked 2026-11-20 on:
// - OpenAI: https://developers.openai.com/api/docs/pricing
// - Gemini: https://aistudio.google.com/docs/pricing (paid tier)
// - Anthropic: https://platform.claude.com/docs/en/about-claude/pricing
// - ElevenLabs: https://elevenlabs.io/pricing/api (billed per character: a call's input is its characters, so the price
//   per 1M "tokens" here is the price per 1M characters, i.e. 1000 × the price per 1K characters)
// A model can have dated periods (Gemini 3.8 prices double on 2027-01-01). A call is priced when it is recorded, with
// the period in force then, so later price changes do not rewrite past costs. A model missing here is shown unpriced.

import type { UsageProvider } from './usage';

export const PRICES_CHECKED = '2026-11-20';

export interface Price {
  input: number;
  output: number;
  /** Cache reads (OpenAI cached input, Gemini context caching, Anthropic cache hits). Default: input. */
  cachedInput?: number;
  /** Anthropic cache writes with the 5-minute and 1-hour lifetimes. Default: input. */
  cacheWrite?: number;
  cacheWrite1h?: number;
  /** Image tokens, where they cost more than text. Default: input / output. */
  imageInput?: number;
  imageOutput?: number;
}

/** Token counts of one call, split the way prices are. Missing counts are 0. */
export interface TokenBreakdown { input?: number; cachedInput?: number; cacheWrite?: number; cacheWrite1h?: number; imageInput?: number; output?: number; imageOutput?: number }

const PRICES: Record<string, { from?: string; price: Price }[]> = {
  'anthropic/claude-opus-5-5': [{ price: { input: 4, output: 20, cachedInput: 0.2, cacheWrite: 5, cacheWrite1h: 8 } }],
  'anthropic/claude-fable-5-2': [{ price: { input: 8, output: 40, cachedInput: 0.2, cacheWrite: 10, cacheWrite1h: 16 } }],
  'anthropic/claude-sonnet-5-5': [{ price: { input: 2, output: 10, cachedInput: 0.1, cacheWrite: 2.5, cacheWrite1h: 4 } }],
  'openai/gpt-image-2': [{ price: { input: 5, imageInput: 8, output: 30, imageOutput: 30 } }],
  'openai/gpt-6.2-astra': [{ price: { input: 8, cachedInput: 0.4, output: 40 } }],
  'openai/gpt-6.2-sol': [{ price: { input: 2, cachedInput: 0.1, output: 10 } }],
  'openai/gpt-5-mini': [{ price: { input: 0.25, cachedInput: 0.025, output: 2 } }],
  'openai/gpt-4o-mini-tts': [{ price: { input: 0.6, output: 12 } }],
  'elevenlabs/eleven_multilingual_v2': [{ price: { input: 80, output: 0 } }],
  'elevenlabs/eleven_v3': [{ price: { input: 80, output: 0 } }],
  'elevenlabs/eleven_flash_v2_5': [{ price: { input: 40, output: 0 } }],
  'elevenlabs/eleven_flash_v2': [{ price: { input: 40, output: 0 } }],
  'gemini/gemini-3.8-flash': [
    { price: { input: 0.75, cachedInput: 0.075, output: 3.75 } },
    { from: '2027-01-01', price: { input: 1.5, cachedInput: 0.15, output: 7.5 } },
  ],
  'gemini/gemini-3.8-flash-tts': [
    { price: { input: 0.5, output: 9 } },
    { from: '2027-01-01', price: { input: 1, output: 18 } },
  ],
  'gemini/gemini-nano-banana-2.1': [{ price: { input: 1.5, output: 7.5, imageOutput: 30 } }],
};

export type ModelProvider = 'openai' | 'gemini' | 'anthropic' | 'elevenlabs' | 'voicestudio';
export type ModelJob = 'text' | 'voice' | 'image' | 'mouth' | 'vector';

export interface KnownModel {
  id: string;
  provider: ModelProvider;
  jobs: ModelJob[];
  price: Price | null;
}

/** The small, public model catalogue used by Settings. "Other" is always allowed by the UI. */
export const KNOWN_MODELS: KnownModel[] = [
  { id: 'gpt-6.2-astra', provider: 'openai', jobs: ['text', 'vector'], price: priceOfKey('openai/gpt-6.2-astra') },
  { id: 'gpt-6.2-sol', provider: 'openai', jobs: ['text'], price: priceOfKey('openai/gpt-6.2-sol') },
  { id: 'gpt-5-mini', provider: 'openai', jobs: ['text', 'mouth'], price: priceOfKey('openai/gpt-5-mini') },
  { id: 'gpt-4o-mini-tts', provider: 'openai', jobs: ['voice'], price: priceOfKey('openai/gpt-4o-mini-tts') },
  { id: 'gpt-image-2', provider: 'openai', jobs: ['image'], price: priceOfKey('openai/gpt-image-2') },
  { id: 'gemini-3.8-flash', provider: 'gemini', jobs: ['text', 'mouth'], price: priceOfKey('gemini/gemini-3.8-flash') },
  { id: 'gemini-3.8-flash-tts', provider: 'gemini', jobs: ['voice'], price: priceOfKey('gemini/gemini-3.8-flash-tts') },
  { id: 'gemini-nano-banana-2.1', provider: 'gemini', jobs: ['image'], price: priceOfKey('gemini/gemini-nano-banana-2.1') },
  { id: 'claude-opus-5-5', provider: 'anthropic', jobs: ['text', 'vector'], price: priceOfKey('anthropic/claude-opus-5-5') },
  { id: 'claude-fable-5-2', provider: 'anthropic', jobs: ['text'], price: priceOfKey('anthropic/claude-fable-5-2') },
  { id: 'claude-sonnet-5-5', provider: 'anthropic', jobs: ['text', 'mouth'], price: priceOfKey('anthropic/claude-sonnet-5-5') },
  { id: 'eleven_multilingual_v2', provider: 'elevenlabs', jobs: ['voice'], price: priceOfKey('elevenlabs/eleven_multilingual_v2') },
  { id: 'eleven_v3', provider: 'elevenlabs', jobs: ['voice'], price: priceOfKey('elevenlabs/eleven_v3') },
  { id: 'eleven_flash_v2_5', provider: 'elevenlabs', jobs: ['voice'], price: priceOfKey('elevenlabs/eleven_flash_v2_5') },
  { id: 'eleven_flash_v2', provider: 'elevenlabs', jobs: ['voice'], price: priceOfKey('elevenlabs/eleven_flash_v2') },
  { id: 'tts-1', provider: 'voicestudio', jobs: ['voice'], price: null },
];

function priceOfKey(key: string): Price | null {
  const periods = PRICES[key];
  if (!periods) return null;
  return [...periods].reverse().find((p) => !p.from || p.from <= PRICES_CHECKED)?.price ?? null;
}

export function priceOf(provider: UsageProvider, model: string, at: Date = new Date()): Price | null {
  const periods = PRICES[`${provider}/${model}`];
  if (!periods) return null;
  const day = at.toISOString().slice(0, 10);
  return [...periods].reverse().find((p) => !p.from || p.from <= day)?.price ?? null;
}

/** Cost in USD, or null when the model has no price here. */
export function costOf(provider: UsageProvider, model: string, t: TokenBreakdown, at?: Date): number | null {
  const p = priceOf(provider, model, at);
  if (!p) return null;
  const n = (v?: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
  const usd = n(t.input) * p.input + n(t.cachedInput) * (p.cachedInput ?? p.input) + n(t.cacheWrite) * (p.cacheWrite ?? p.input)
    + n(t.cacheWrite1h) * (p.cacheWrite1h ?? p.cacheWrite ?? p.input) + n(t.imageInput) * (p.imageInput ?? p.input)
    + n(t.output) * p.output + n(t.imageOutput) * (p.imageOutput ?? p.output);
  return usd / 1e6;
}
