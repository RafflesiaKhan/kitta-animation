import type { FrameState, Timeline } from './types';

export const FPS = 30;

export function frameCount(durationMs: number): number {
  return Math.ceil((durationMs * FPS) / 1000);
}

const BLINK_PERIOD_MS = 3500;
const BLINK_START_MS = 3350;
const BOB_PERIOD_MS = 3000;

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

export function frameAt(t: Timeline, ms: number): FrameState {
  const ci = lastStartedIndex(t.cues, ms);
  const cue = ci >= 0 && ms < t.cues[ci].endMs ? t.cues[ci] : undefined;

  const li = lastStartedIndex(t.lines, ms);
  const line = li >= 0 ? t.lines[li] : undefined;
  const inLine = line !== undefined && ms < line.endMs;

  return {
    expression: line ? line.expression : 'neutral',
    mouth: cue ? cue.shape : 'X',
    gesture: inLine ? line.gesture : 'none',
    gestureProgress: inLine ? (ms - line.startMs) / (line.endMs - line.startMs) : 0,
    blink: ms % BLINK_PERIOD_MS >= BLINK_START_MS,
    bob: 2 * Math.sin((2 * Math.PI * ms) / BOB_PERIOD_MS),
  };
}
