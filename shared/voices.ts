/** Gemini prebuilt TTS voices offered in the UI. */
export const VOICES = ['Kore', 'Puck', 'Charon', 'Zephyr', 'Fenrir', 'Leda', 'Aoede', 'Orus'];

/** Who speaks the script: Gemini TTS, OpenAI TTS, or a local VoiceStudio (free, github.com/debpalash/VoiceStudio). */
export type TtsProvider = 'gemini' | 'openai' | 'voicestudio';
export const TTS_PROVIDERS: TtsProvider[] = ['gemini', 'openai', 'voicestudio'];
export const TTS_PROVIDER_NAMES: Record<TtsProvider, string> = { gemini: 'Gemini', openai: 'OpenAI', voicestudio: 'VoiceStudio (local)' };

/** Voices offered for OpenAI speech (gpt-4o-mini-tts and later). VoiceStudio's list comes from the running app. */
export const OPENAI_VOICES = ['coral', 'alloy', 'ash', 'ballad', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse'];

/** What a running VoiceStudio reports: its status, the engines that are installed and the voices you can pick. */
export interface VoiceStudioVoice { id: string; label: string; kind: 'profile' | 'default' }
export interface VoiceStudioEngine { id: string; label: string; cloning: boolean; emotion: boolean }
export interface VoiceStudioInfo { running: boolean; url: string; version?: string; device?: string; voices: VoiceStudioVoice[]; engines: VoiceStudioEngine[] }
