import type { ArtPose, Expression } from '../types';

// Prompts for painting an AI character, Masko-style: one base image from the description, then every
// expression and action as an edit of that base, so the character stays the same from pose to pose.

export const ART_STYLES = ['flat cartoon', 'soft 3D render', 'anime', 'pixel art', 'hand-drawn sketch'] as const;
export type ArtStyle = (typeof ART_STYLES)[number];

// Magenta is keyed out by the server to give the transparent PNG the video export needs.
const BACKDROP = 'Plain solid magenta (#FF00FF) background filling the whole image, no shadow, no floor, no text. Do not use magenta anywhere on the character.';
const FRAMING = 'A single character, front view, upper body from the waist up, centred with some space around it, facing the viewer.';
const KEEP = 'Same character, same art style, same framing, size and position, same outfit and colours, same solid magenta background.';

const FACE: Record<Expression, string> = {
  neutral: 'a neutral, relaxed face',
  happy: 'happy, with a warm closed-mouth smile',
  sad: 'sad, with drooping brows and eyes looking down a little',
  surprised: 'surprised, eyes wide open and brows raised high',
  angry: 'angry, with brows pulled down and together',
  excited: 'excited, beaming with sparkling eyes and rosy cheeks',
  thinking: 'thoughtful, eyes looking up and to the side',
  confused: 'confused, one brow raised and the other lowered',
  worried: 'worried, with brows tilted up in the middle',
  wink: 'winking, the right eye closed, with a playful smile',
  sleepy: 'sleepy, with heavy half-closed eyelids',
};

const ACTION: Record<Exclude<ArtPose, Expression | 'blink'>, string> = {
  wave: 'waving hello with one hand raised beside the head',
  lookDown: 'looking down at the ground, head tilted down slightly',
  celebrate: 'celebrating with both arms raised high in the air',
  shrug: 'shrugging, palms up and shoulders raised',
};

/** Prompt for the base (neutral) image; with a reference picture the model redraws that character instead. */
export function basePrompt(description: string, style: string, hasReference: boolean): string {
  const who = hasReference
    ? `Redraw the character in the attached picture${description.trim() ? ` (${description.trim()})` : ''}`
    : `A ${description.trim()}`;
  return `${who}, as a ${style} mascot character. ${FRAMING} ${FACE.neutral} with the mouth closed, arms relaxed. ${BACKDROP}`;
}

/** Prompt for editing the base image into another pose. Mouths stay closed: the app animates speech on top. */
export function posePrompt(pose: ArtPose): string {
  if (pose === 'blink') return `${KEEP} Change only the eyes: both eyes fully closed, mid-blink. Keep the mouth closed.`;
  if (pose in ACTION) return `${KEEP} Change the pose to ${ACTION[pose as keyof typeof ACTION]}. Keep the face neutral with the mouth closed, and keep the character as close as possible to the same size and position.`;
  return `${KEEP} Change only the face to look ${FACE[pose as Expression]}. Keep the mouth closed.`;
}
