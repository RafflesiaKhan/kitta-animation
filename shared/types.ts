export type Expression = 'neutral' | 'happy' | 'sad' | 'surprised' | 'angry' | 'excited' | 'thinking' | 'confused' | 'worried' | 'wink' | 'sleepy';
export type Gesture = 'none' | 'wave' | 'nod' | 'lookDown' | 'celebrate' | 'shrug';
export type MouthShape = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'X';
export const EXPRESSIONS: Expression[] = ['neutral', 'happy', 'sad', 'surprised', 'angry', 'excited', 'thinking', 'confused', 'worried', 'wink', 'sleepy'];
export const GESTURES: Gesture[] = ['none', 'wave', 'nod', 'lookDown', 'celebrate', 'shrug'];
export interface MouthCue { startMs: number; endMs: number; shape: MouthShape }
export interface Line { text: string; startMs: number; endMs: number; expression: Expression; gesture: Gesture }
export interface Timeline { durationMs: number; cues: MouthCue[]; lines: Line[] }
// fromExpression/blend animate the change into `expression` (blend 0 = still fromExpression, 1 = fully expression);
// glance is an idle side-look between lines, -1 (left) .. 1 (right). All three are optional: absent = settled, looking ahead.
export interface FrameState { expression: Expression; mouth: MouthShape; gesture: Gesture; gestureProgress: number; blink: boolean; bob: number; fromExpression?: Expression; blend?: number; glance?: number }
export type StarterId = 'kit' | 'milo' | 'pip';
export interface CharacterConfig { starter: StarterId; skin: string; hairStyle: string; hairColor: string; eyeStyle: string; outfit: string; outfitColor: string }
export interface ScriptLineInput { text: string; voice: string; expression: Expression; gesture: Gesture; note?: string }
export type ExportFormat = { aspect: '16:9' | '9:16'; transparent: boolean };
