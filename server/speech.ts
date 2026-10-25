import type { ScriptLineInput } from '../shared/types';
import type { TtsProvider } from '../shared/voices';
import { tts, GeminiError } from './gemini';
import { OpenAIError, speak } from './openai';
import { withRetries } from './retry';

/** Voice providers that are set up: Gemini and OpenAI need their keys, VoiceStudio is opted into with VOICESTUDIO_URL. */
export function ttsProviders(): TtsProvider[] {
  const out: TtsProvider[] = [];
  if (process.env.GEMINI_API_KEY) out.push('gemini');
  if (process.env.OPENAI_API_KEY) out.push('openai');
  if (process.env.VOICESTUDIO_URL) out.push('voicestudio');
  return out;
}

/** Overloaded or rate-limited: worth waiting for. Anything else (bad key, refusal, not running) fails at once. */
export const isTransient = (e: unknown) =>
  (e instanceof GeminiError || e instanceof OpenAIError) && (e.code === 'busy' || e.code === 'rate_limited');

/** Speaks one line with the chosen provider, riding out short overloads with patient retries. */
export function speakLine(provider: TtsProvider, line: ScriptLineInput): Promise<Buffer> {
  const once = () => (provider === 'gemini' ? tts(line) : speak(provider === 'openai' ? 'OpenAI' : 'VoiceStudio', line));
  return withRetries(once, isTransient, `tts ${provider}`);
}
