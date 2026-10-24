import type { FrameState, Timeline } from './types';

export const FPS = 30;

export function frameCount(durationMs: number): number {
  return Math.ceil((durationMs * FPS) / 1000);
}

const BLINK_PERIOD_MS = 3500;
const BLINK_START_MS = 3350;
const BOB_PERIOD_MS = 3000;
export const TRANSITION_MS = 250; // how long one expression takes to morph into the next
const GLANCE_PERIOD_MS = 9000; // idle loop: look to one side once per period, alternating sides
const GLANCE_START_MS = 5000;
const GLANCE_MS = 1600;

/** Index of the last item with startMs <= ms, or -1. Items must be sorted by startMs. */
function lastStartedIndex(items: { startMs: number }[], ms: number): number {
  let lo = 0;
  let hi = items.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid].startMs <= ms) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Idle side-look, -1..1: eases out and back over GLANCE_MS, alternating left and right. */
function glanceAt(ms: number): number {
  const into = (ms % GLANCE_PERIOD_MS) - GLANCE_START_MS;
  if (into < 0 || into >= GLANCE_MS) return 0;
  const side = Math.floor(ms / GLANCE_PERIOD_MS) % 2 ? -1 : 1;
  return side * smooth(Math.min(1, into / 300, (GLANCE_MS - into) / 300));
}

export function frameAt(t: Timeline, ms: number): FrameState {
  const ci = lastStartedIndex(t.cues, ms);
  const cue = ci >= 0 && ms < t.cues[ci].endMs ? t.cues[ci] : undefined;

  const li = lastStartedIndex(t.lines, ms);
  const line = li >= 0 ? t.lines[li] : undefined;
  const inLine = line !== undefined && ms < line.endMs;

  // A line's expression morphs in from the one before it over its first TRANSITION_MS.
  const fromExpression = li >= 1 ? t.lines[li - 1].expression : 'neutral';
  const blend = line ? smooth(Math.min(1, (ms - line.startMs) / TRANSITION_MS)) : 1;

  return {
    expression: line ? line.expression : 'neutral',
    fromExpression,
    blend,
    glance: inLine ? 0 : glanceAt(ms),
    mouth: cue ? cue.shape : 'X',
    gesture: inLine ? line.gesture : 'none',
    gestureProgress: inLine ? (ms - line.startMs) / (line.endMs - line.startMs) : 0,
    blink: ms % BLINK_PERIOD_MS >= BLINK_START_MS,
    bob: 2 * Math.sin((2 * Math.PI * ms) / BOB_PERIOD_MS),
  };
}
