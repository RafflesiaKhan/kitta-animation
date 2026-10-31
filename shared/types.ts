export type Expression = 'neutral' | 'happy' | 'sad' | 'surprised' | 'angry' | 'excited' | 'thinking' | 'confused' | 'worried' | 'wink' | 'sleepy';
export type Gesture = 'none' | 'wave' | 'nod' | 'lookDown' | 'celebrate' | 'shrug' | 'think' | 'point' | 'explain';
export type MouthShape = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'X';
export const EXPRESSIONS: Expression[] = ['neutral', 'happy', 'sad', 'surprised', 'angry', 'excited', 'thinking', 'confused', 'worried', 'wink', 'sleepy'];
export const GESTURES: Gesture[] = ['none', 'wave', 'nod', 'lookDown', 'celebrate', 'shrug', 'think', 'point', 'explain'];
export interface MouthCue { startMs: number; endMs: number; shape: MouthShape }
export interface Line { text: string; startMs: number; endMs: number; expression: Expression; gesture: Gesture }
// Hand-placed animation (the Animate step): an expression holds until the next one, or until its endMs, after which the
// expression before it shows again; an action plays once over its clip.
export interface ExpressionMark { startMs: number; endMs?: number; expression: Expression }
export interface ActionMark { startMs: number; endMs: number; gesture: Exclude<Gesture, 'none'> }
export interface Marks { expressions: ExpressionMark[]; actions: ActionMark[] }
/** marks: absent = the lines' own expression and gesture drive the animation. */
export interface Timeline { durationMs: number; cues: MouthCue[]; lines: Line[]; marks?: Marks }
// fromExpression/blend animate the change into `expression` (blend 0 = still fromExpression, 1 = fully expression);
// glance is an idle side-look between lines, -1 (left) .. 1 (right). All three are optional: absent = settled, looking ahead.
// Natural motion (optional, absent = still): nod = head dip on stressed syllables (px), tilt = head tilt (deg),
// sway = gentle side-to-side drift (px), browLift = brow raise on phrase openers (0..1), beat = hand beat gesture
// (0..1), talk = 1 while speaking. The character scales them by its expression's energy.
export interface FrameState {
  expression: Expression; mouth: MouthShape; gesture: Gesture; gestureProgress: number; blink: boolean; bob: number;
  fromExpression?: Expression; blend?: number; glance?: number;
  nod?: number; tilt?: number; sway?: number; browLift?: number; beat?: number; talk?: number;
}
export type StarterId = 'kit' | 'milo' | 'pip';
export interface CharacterConfig { starter: StarterId; skin: string; hairStyle: string; hairColor: string; eyeStyle: string; outfit: string; outfitColor: string }
export interface ScriptLineInput {
  text: string; voice: string; expression: Expression; gesture: Gesture; note?: string;
  // Per-line voice controls (shared/voices.ts): language id, style, pitch and speed in % (0 = as is), steady or varied takes.
  language?: string; style?: 'normal' | 'whisper'; pitch?: number; speed?: number; variability?: 'steady' | 'varied';
  speaker?: string; // VoiceStudio's engine default voice: who it sounds like (shared/voices.ts SPEAKERS), else DEFAULT_SPEAKER
}
export type ExportFormat = { aspect: '16:9' | '9:16'; transparent: boolean };

// ---------- AI-created characters (painted artwork instead of the SVG rig) ----------
/** Poses painted for an AI character: one per expression, a closed-eyes frame for blinks, and one per action gesture. */
export type ArtPose = Expression | 'blink' | ArtAction;
export type ArtAction = 'wave' | 'lookDown' | 'celebrate' | 'shrug' | 'think' | 'point' | 'explain';
export const ART_ACTIONS: ArtAction[] = ['wave', 'lookDown', 'celebrate', 'shrug', 'think', 'point', 'explain'];
export const ART_POSES: ArtPose[] = [...EXPRESSIONS, 'blink', ...ART_ACTIONS];
/**
 * Where the painted mouth is, as fractions of the square image (x, y = centre; w = width), plus the skin colour around it.
 * h (height) is set when the mouth was measured in the pixels, not just guessed by a vision model.
 */
export interface MouthBox { x: number; y: number; w: number; h?: number; skin: string }
export interface ArtImage { file: string; mouth: MouthBox | null }
export type ImageProvider = 'gemini' | 'openai';
export const IMAGE_PROVIDERS: ImageProvider[] = ['gemini', 'openai'];
/**
 * provider: the model family that painted it; its later poses use the same one (absent = gemini, for older characters).
 * mouthsMeasured: its mouths were measured in the pixels (absent for characters made before that, which can be re-measured).
 */
export interface ArtCharacter { kind: 'art'; id: string; name: string; prompt: string; style: string; provider?: ImageProvider; mouthsMeasured?: boolean; images: Partial<Record<ArtPose, ArtImage>> }
/** Whatever the user picked in the Character step: a customised SVG starter or an AI-created character. */
export type AnyCharacter = CharacterConfig | ArtCharacter;
export const isArt = (c: AnyCharacter): c is ArtCharacter => (c as ArtCharacter).kind === 'art';
