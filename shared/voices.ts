/** Gemini prebuilt TTS voices offered in the UI. */
export const VOICES = ['Kore', 'Puck', 'Charon', 'Zephyr', 'Fenrir', 'Leda', 'Aoede', 'Orus'];

/** Who speaks the script: Gemini TTS, OpenAI TTS, or a local VoiceStudio (free, github.com/debpalash/VoiceStudio). */
export type TtsProvider = 'gemini' | 'openai' | 'voicestudio';
export const TTS_PROVIDERS: TtsProvider[] = ['gemini', 'openai', 'voicestudio'];
export const TTS_PROVIDER_NAMES: Record<TtsProvider, string> = { gemini: 'Gemini', openai: 'OpenAI', voicestudio: 'VoiceStudio (local)' };

/** Voices offered for OpenAI speech (gpt-4o-mini-tts and later). VoiceStudio's list comes from the running app. */
export const OPENAI_VOICES = ['coral', 'alloy', 'ash', 'ballad', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse'];

/** What a running VoiceStudio reports: its status, the engines that are installed and the voices you can pick. */
export interface VoiceStudioVoice { id: string; label: string; kind: 'profile' | 'persona' | 'default'; icon?: string }
export interface VoiceStudioEngine { id: string; label: string; cloning: boolean; emotion: boolean }
export interface VoiceStudioInfo { running: boolean; url: string; version?: string; device?: string; voices: VoiceStudioVoice[]; engines: VoiceStudioEngine[] }

/**
 * Language / accent picker. VoiceStudio gets `code` as its language and `accent` as a voice-design attribute
 * (OmniVoice only applies accents to English); OpenAI and Gemini get `say` as a direction.
 */
export interface VoiceLanguage { id: string; label: string; code?: string; accent?: string; say?: string }
export const LANGUAGES: VoiceLanguage[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'en-US', label: '🇺🇸 English (US)', code: 'en', accent: 'american accent', say: 'with an American accent' },
  { id: 'en-GB', label: '🇬🇧 English (UK)', code: 'en', accent: 'british accent', say: 'with a British accent' },
  { id: 'en-AU', label: '🇦🇺 English (AU)', code: 'en', accent: 'australian accent', say: 'with an Australian accent' },
  { id: 'en-CA', label: '🇨🇦 English (CA)', code: 'en', accent: 'canadian accent', say: 'with a Canadian accent' },
  { id: 'en-IN', label: '🇮🇳 English (India)', code: 'en', accent: 'indian accent', say: 'with an Indian accent' },
  { id: 'fr', label: '🇫🇷 French', code: 'fr', say: 'in French' },
  { id: 'es', label: '🇪🇸 Spanish', code: 'es', say: 'in Spanish' },
  { id: 'de', label: '🇩🇪 German', code: 'de', say: 'in German' },
  { id: 'it', label: '🇮🇹 Italian', code: 'it', say: 'in Italian' },
  { id: 'pt', label: '🇵🇹 Portuguese', code: 'pt', say: 'in Portuguese' },
  { id: 'hi', label: '🇮🇳 Hindi', code: 'hi', say: 'in Hindi' },
  { id: 'bn', label: '🇧🇩 Bengali', code: 'bn', say: 'in Bengali' },
  { id: 'ar', label: '🇸🇦 Arabic', code: 'ar', say: 'in Arabic' },
  { id: 'zh', label: '🇨🇳 Chinese', code: 'zh', say: 'in Mandarin Chinese' },
  { id: 'ja', label: '🇯🇵 Japanese', code: 'ja', say: 'in Japanese' },
  { id: 'ko', label: '🇰🇷 Korean', code: 'ko', say: 'in Korean' },
];

/** Pitch and speed sliders, in % either way. Pitch is shifted after generation, so it is kept small. */
export const PITCH_RANGE = 25;
export const SPEED_RANGE = 50;

/** Reaction sounds VoiceStudio's default engine (OmniVoice) performs; other engines would read them out loud. */
export const SOUND_TAGS = ['laughter', 'sigh', 'surprise-oh', 'surprise-wa', 'question-en', 'confirmation-en', 'dissatisfaction-hnn'];

/**
 * Inline delivery cues: [excited]…[/excited] (or until the line ends). OpenAI and Gemini perform them from `say`.
 * VoiceStudio has no emotions, so it whispers natively and approximates the rest with a speed and pitch nudge (in %).
 */
export const CUES: Record<string, { say: string; speed: number; pitch: number }> = {
  whisper: { say: 'whispering', speed: 0, pitch: 0 },
  excited: { say: 'excited', speed: 12, pitch: 10 },
  happy: { say: 'happy', speed: 6, pitch: 5 },
  surprised: { say: 'surprised', speed: 5, pitch: 12 },
  sad: { say: 'sad', speed: -12, pitch: -8 },
  calm: { say: 'calm', speed: -8, pitch: -3 },
  angry: { say: 'angry', speed: 8, pitch: -4 },
};

/** Pauses offered by "Add pause"; any [pause Ns] / [pause Nms] up to 10 s works. */
export const PAUSES = ['[pause 0.5s]', '[pause 1s]', '[pause 2s]'];
