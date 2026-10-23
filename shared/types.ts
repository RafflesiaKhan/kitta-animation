export type Expression = 'neutral' | 'happy' | 'sad' | 'surprised' | 'angry';
export type Gesture = 'none' | 'wave' | 'nod' | 'lookDown';
export type MouthShape = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'X';
export const EXPRESSIONS: Expression[] = ['neutral', 'happy', 'sad', 'surprised', 'angry'];
export const GESTURES: Gesture[] = ['none', 'wave', 'nod', 'lookDown'];
export interface MouthCue { startMs: number; endMs: number; shape: MouthShape }
export interface Line { text: string; startMs: number; endMs: number; expression: Expression; gesture: Gesture }
export interface Timeline { durationMs: number; cues: MouthCue[]; lines: Line[] }
export interface FrameState { expression: Expression; mouth: MouthShape; gesture: Gesture; gestureProgress: number; blink: boolean; bob: number }
export type StarterId = 'kit' | 'milo' | 'pip';
export interface CharacterConfig { starter: StarterId; skin: string; hairStyle: string; hairColor: string; eyeStyle: string; outfit: string; outfitColor: string }
export interface ScriptLineInput { text: string; voice: string; expression: Expression; gesture: Gesture; note?: string }
export type ExportFormat = { aspect: '16:9' | '9:16'; transparent: boolean };
