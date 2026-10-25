import type { ArtCharacter, ArtImage, FrameState } from '../types';
import { ART_ACTIONS } from '../types';
import { FACES, mixFaces } from './expressions';
import { Mouth } from './Character';

// Pure props → SVG for an AI-painted character, like Character.tsx (also rendered server-side for export).
// Each pose is a transparent 1:1 PNG filling the 1000×1000 viewBox. Expressions crossfade, the blink frame
// stands in during blinks, action poses fade in and out around their gesture, and while the character
// talks a cartoon mouth is drawn over the painted one.

const n = (v: number) => Math.round(v * 10) / 10;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const QUIET = new Set(['A', 'X']); // closed mouth shapes: the painted mouth already shows these

export interface ArtCharacterProps {
  character: ArtCharacter;
  frame: FrameState;
  width?: number;
  height?: number;
  /** Turns an image file name into an href; the browser default is the API route, export passes data URIs. */
  resolve?: (file: string) => string;
}

export function ArtCharacterView({ character, frame, width = 1000, height = 1000, resolve }: ArtCharacterProps) {
  const href = resolve ?? ((file: string) => `/api/characters/${character.id}/${file}`);
  const img = (pose: keyof ArtCharacter['images']) => character.images[pose];
  const neutral = img('neutral');
  const base = img(frame.expression) ?? neutral;
  const from = frame.fromExpression !== undefined ? img(frame.fromExpression) ?? neutral : undefined;
  const blend = frame.blend ?? 1;
  const fading = from !== undefined && base !== undefined && from.file !== base.file && blend < 1;

  const p = frame.gestureProgress;
  const ease = clamp01(Math.min(p / 0.12, (1 - p) / 0.12));
  const pose = (ART_ACTIONS as string[]).includes(frame.gesture) ? img(frame.gesture as never) : undefined;
  const poseK = pose ? ease : 0;
  const eyesOpen = frame.expression === 'wink' || frame.expression === 'sleepy'; // their eyes are already (half) shut
  const blink = frame.blink && !eyesOpen && !fading && poseK < 0.5 ? img('blink') : undefined;

  const nod = frame.gesture === 'nod' ? Math.sin(p * 2 * Math.PI) * 12 : 0;
  const hop = frame.gesture === 'celebrate' ? -Math.abs(Math.sin(p * 3 * Math.PI)) * 30 * ease : 0;
  // Body language and speech motion as gentle whole-picture moves: tilt about the base, sway, nods on stressed syllables.
  const face = frame.fromExpression !== undefined && blend < 1
    ? mixFaces(FACES[frame.fromExpression] ?? FACES.neutral, FACES[frame.expression] ?? FACES.neutral, blend)
    : FACES[frame.expression] ?? FACES.neutral;
  const speechNod = (frame.nod ?? 0) * face.energy * 0.7;
  const tilt = (face.tilt + (frame.tilt ?? 0) * Math.min(1.3, face.energy)) * 0.45;
  const sway = (frame.sway ?? 0) * (0.5 + face.energy * 0.5);
  const layer = (im: ArtImage, opacity: number, part: string) => (
    <image data-part={part} href={href(im.file)} x={0} y={0} width={1000} height={1000} opacity={opacity < 1 ? n(opacity) : undefined} />
  );

  // Action poses swap with the picture underneath: first the pose fades in over it, then the picture under it fades
  // out, so its body (e.g. a hanging arm where the pose has a raised one) never shows through the action pose.
  const actionOpacity = Math.min(1, poseK * 2);
  const underOpacity = Math.min(1, (1 - poseK) * 2);
  // A mouth measured in the pixels (h set) is exact for its own picture, so the patch covers that picture's painted
  // mouth. A vision-only guess is trusted only from the neutral picture, which every pose shares its framing with.
  // Looking down turns the face away, so it doesn't talk. The talking mouth keeps the neutral mouth's size throughout.
  const shown = poseK >= 0.5 ? pose : blink ?? base;
  const m = poseK >= 0.5 && frame.gesture === 'lookDown' ? undefined : shown?.mouth?.h !== undefined ? shown.mouth : neutral?.mouth;
  const talking = m && !QUIET.has(frame.mouth);
  const mw = (neutral?.mouth ?? m)?.w ?? 0;
  const pad = m ? Math.max(6, m.w * 150) : 0;
  const patch = m && (m.h !== undefined ? { rx: m.w * 500 + pad, ry: m.h * 500 + pad } : { rx: m.w * 620, ry: m.w * 380 });
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width={width} height={height}>
      <g data-part="character" transform={`translate(${n(sway)} ${n(frame.bob + nod + hop + speechNod + face.slump * 0.4)}) rotate(${n(tilt)} 500 980)`}>
        {underOpacity > 0 && (
          <g data-part="under" opacity={underOpacity < 1 ? n(underOpacity) : undefined}>
            {fading && layer(from!, 1, 'from')}
            {base && layer(base, fading ? blend : 1, 'pose')}
            {blink && layer(blink, 1, 'blink')}
          </g>
        )}
        {pose && poseK > 0 && layer(pose, actionOpacity, 'action')}
        {talking && (
          <g data-part="talk">
            <ellipse cx={n(m.x * 1000)} cy={n(m.y * 1000)} rx={n(patch!.rx)} ry={n(patch!.ry)} fill={m.skin} />
            <Mouth shape={frame.mouth} mood={FACES[frame.expression]?.mouth ?? FACES.neutral.mouth} x={m.x * 1000} y={m.y * 1000} scale={Math.max(0.2, mw * 10)} />
          </g>
        )}
      </g>
    </svg>
  );
}
