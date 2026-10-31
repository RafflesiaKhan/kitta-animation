import type { FrameState, Timeline } from './types';
import { analyzeSpeech, beatLevel, blinkAt, drift, talkLevel } from './motion';
import { expressionAt, lastExpressionChange, marksOf } from './marks';

export const FPS = 30;

export function frameCount(durationMs: number): number {
  return Math.ceil((durationMs * FPS) / 1000);
}

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

  // Expressions and actions come from the marks (hand-placed, or the lines' own). An expression morphs in from the one
  // before it over its first TRANSITION_MS; an action's progress runs 0..1 over its clip.
  const marks = marksOf(t);
  // An expression that ends morphs back the same way into the one before it.
  const expression = expressionAt(marks, ms);
  const changed = lastExpressionChange(marks, ms);
  const fromExpression = changed > 0 ? expressionAt(marks, changed - 1) : 'neutral';
  const blend = fromExpression !== expression ? smooth(Math.min(1, (ms - changed) / TRANSITION_MS)) : 1;
  const ai = lastStartedIndex(marks.actions, ms);
  const action = ai >= 0 && ms < marks.actions[ai].endMs ? marks.actions[ai] : undefined;

  // Speech-driven motion: nods and hand beats on stressed syllables, brow lifts on phrase openers, sway while talking.
  const speech = analyzeSpeech(t);
  const talk = talkLevel(speech, ms);

  return {
    expression,
    fromExpression,
    blend,
    glance: inLine ? 0 : glanceAt(ms),
    mouth: cue ? cue.shape : 'X',
    gesture: action ? action.gesture : 'none',
    gestureProgress: action ? (ms - action.startMs) / (action.endMs - action.startMs) : 0,
    blink: blinkAt(speech, ms),
    bob: 2 * Math.sin((2 * Math.PI * ms) / BOB_PERIOD_MS),
    talk,
    nod: 7 * beatLevel(speech, ms, 320),
    beat: talk > 0 ? beatLevel(speech, ms, 420) : 0,
    browLift: beatLevel(speech, ms, 450, 0.9),
    tilt: drift(ms, 2300, 3700, 1.3) * (0.8 + 1.6 * talk), // degrees
    sway: drift(ms, 4100, 6700, 0.7) * 4, // px
  };
}
