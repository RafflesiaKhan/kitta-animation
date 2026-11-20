// A stateful vector-avator drawing for one actor. The renderer's springs (ears, tail) integrate over successive
// frames, so unlike the SVG characters a frame depends on the frames before it. The stage makes that repeatable:
//  - everything (pose, face, springs) is sampled on a fixed 30 Hz tick, whatever rate the caller draws at (the
//    preview draws at 60 Hz, the export at 30 Hz), so a given time gives the same picture in both;
//  - a draw that is not the next tick (first draw, seek, scrub back) restarts the springs and replays the
//    WARMUP_TICKS ticks before it from the timeline, so the picture hardly depends on how the playhead got there
//    (the springs forget older history slowly: 24 ticks leave a mean error of ~1/255, 90 leave <0.05; see tests/server/vector-export.test.ts).
// Times here are the actor's idle clock (scene time + idleOffsetMs), which also offsets the idle motion and blinks.
import type { FrameState } from '../types';
import { poseAndFace } from './kitta';
import type { LoadedVector } from './renderers/vector/vdata';
import { VectorRenderer } from './renderers/vector/vectorRenderer';

export const STAGE_FPS = 30;
export const WARMUP_TICKS = 90; // 3 s: the springs settle slowly (see tests/server/vector-export.test.ts)
const MAX_GAP = 15; // ticks (0.5 s): a longer gap restarts the springs, as the renderer itself does

/** The actor's frame at an idle-clock time (ms). */
export type FrameSource = (clockMs: number) => FrameState;

export class VectorStage {
  private renderer = new VectorRenderer();
  private lastTick: number | null = null;

  /** Draws a square `size` × `size` transparent picture, readable from `canvas`; `face` frames the head only. */
  constructor(lv: LoadedVector, readonly size: number, private warmup = WARMUP_TICKS, framing: 'body' | 'face' = 'body') {
    this.renderer.dpr = 1;
    this.renderer.setup(size, size, framing, false, lv);
  }

  get canvas(): HTMLCanvasElement { return this.renderer.canvas; }

  draw(source: FrameSource, clockMs: number): void {
    const tick = Math.max(0, Math.floor((clockMs * STAGE_FPS) / 1000 + 1e-6));
    const gap = this.lastTick === null ? Infinity : tick - this.lastTick;
    const sequential = gap >= 0 && gap <= MAX_GAP;
    if (!sequential) this.renderer.restart();
    const from = sequential ? Math.min(tick, this.lastTick! + 1) : Math.max(0, tick - this.warmup);
    for (let k = from; k <= tick; k++) {
      const at = (k * 1000) / STAGE_FPS; // the pose is sampled on the tick too: preview and export agree exactly
      const { pose, face } = poseAndFace(source(at), at);
      this.renderer.setPose(pose);
      this.renderer.setFace(face);
      this.renderer.render(k / STAGE_FPS);
    }
    this.lastTick = tick;
  }
}
