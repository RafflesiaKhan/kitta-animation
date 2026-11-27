export type Expression = 'neutral' | 'happy' | 'sad' | 'surprised' | 'angry' | 'excited' | 'thinking' | 'confused' | 'worried' | 'wink' | 'sleepy';
export type Gesture = string;
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
  expression: Expression; mouth: MouthShape; gesture: Gesture; gestureProgress: number; gestureDurationMs?: number; blink: boolean; bob: number;
  fromExpression?: Expression; blend?: number; glance?: number;
  nod?: number; tilt?: number; sway?: number; browLift?: number; beat?: number; talk?: number;
}
export type StarterId = 'kit' | 'milo' | 'pip' | 'kai' | 'ira' | 'rohan' | 'baba' | 'mochi';
export interface CharacterConfig { starter: StarterId; skin: string; hairStyle: string; hairColor: string; eyeStyle: string; outfit: string; outfitColor: string }
export interface ScriptLineInput {
  text: string; voice: string; expression: Expression; gesture: Gesture; note?: string;
  // Per-line voice controls (shared/voices.ts): language id, style, pitch and speed in % (0 = as is), steady or varied takes.
  language?: string; style?: 'normal' | 'whisper'; pitch?: number; speed?: number; variability?: 'steady' | 'varied';
  speaker?: string; // VoiceStudio's engine default voice: who it sounds like (shared/voices.ts SPEAKERS), else DEFAULT_SPEAKER
}
export type ExportFormat = { aspect: '16:9' | '9:16' | '1:1' | 'circle'; transparent: boolean; container?: 'webm' | 'mov' };
export type StudioBackground =
  | { kind: 'transparent' }
  | { kind: 'color'; color: string }
  | { kind: 'picture'; id: string };
export interface CharacterPlacement { x: number; bottom: number; scale: number; flip: boolean }
export interface StudioComposition { background: StudioBackground; placement: CharacterPlacement }
export const DEFAULT_COMPOSITION: StudioComposition = {
  background: { kind: 'transparent' }, placement: { x: 0.5, bottom: 0, scale: 1, flip: false },
};
export interface BackgroundRecord { id: string; name: string; mime: string; size: number; added: string }

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
export interface ArtCharacter { kind: 'art'; id: string; name: string; prompt: string; style: string; provider?: ImageProvider; mouthsMeasured?: boolean; mouthAnchor?: { x: number; y: number }; images: Partial<Record<ArtPose, ArtImage>> }
/**
 * A vector-avator character: one layered vector drawing (vector.json, stored next to meta.json) moved by a skeleton.
 * Unlike an art character it is drawn live (Canvas 2D) from the frame state, so it has no per-pose pictures.
 */
export interface VectorCharacter { kind: 'vector'; id: string; name: string; capabilities?: string[] }
/** Whatever the user picked in the Character step: a customised SVG starter, an AI-created character or a vector one. */
export type AnyCharacter = CharacterConfig | ArtCharacter | VectorCharacter;
export const isArt = (c: AnyCharacter): c is ArtCharacter => (c as ArtCharacter).kind === 'art';
export const isVector = (c: AnyCharacter): c is VectorCharacter => (c as VectorCharacter).kind === 'vector';
/** A character in the on-disk library (data/characters). */
export type LibraryCharacter = ArtCharacter | VectorCharacter;
