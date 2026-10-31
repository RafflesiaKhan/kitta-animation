import type { ActionMark, Expression, Marks } from './types';
import { addAction, addExpression } from './marks';

// Stage directions in a script: [expression: …] and [action: …], in any wording. They are never spoken. Here: finding
// them, turning pause actions into real silence, placing each in time, and a keyword fallback for matching the wording
// to what the character can do (the AI director does that better, see server/director.ts).

export type DirectionKind = 'expression' | 'action';
export interface Direction { kind: DirectionKind; phrase: string }
/** at: how far through the line's spoken words the direction sits, 0..1. */
export interface Placed extends Direction { at: number }
/** What a direction's wording maps to; null when nothing the character has fits it. */
export type Match = Expression | ActionMark['gesture'] | null;

const TAG = /\[\s*(expression|action)\s*:\s*([^\]]*)\]/gi;
const MAX_PAUSE_MS = 10_000;
const MAX_LINE = 500;
const MAX_LINES = 50;
const WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

export const directionKey = (d: Direction) => `${d.kind}:${d.phrase.trim().toLowerCase()}`;
/** Characters actually spoken (same rule as the lip-sync text): brackets and <tags> out, whitespace collapsed. */
const spokenLength = (text: string) => text.replace(/\[[^\]]*\]|<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().length;

/** Length of a pause action ("pauses for two seconds", "pause 1.5s", "pauses briefly"); null when it isn't one. */
export function pauseMsOf(phrase: string): number | null {
  if (!/\bpaus/i.test(phrase)) return null;
  if (/\bhalf (a|one) second\b/i.test(phrase)) return 500;
  const m = phrase.match(/(\d+(?:\.\d+)?|\b(?:an?|one|two|three|four|five|six|seven|eight|nine|ten)\b)\s*-?\s*(ms|milliseconds?|s|secs?|seconds?)\b/i);
  if (!m) return 500;
  const n = WORDS[m[1].toLowerCase()] ?? parseFloat(m[1]);
  return Math.min(MAX_PAUSE_MS, Math.round(n * (/^m/i.test(m[2]) ? 1 : 1000)));
}

/** The line as it is spoken (directions out, pause actions in as [pause Ns]) and its directions, placed. */
export function prepareLine(text: string): { spoken: string; tags: Placed[] } {
  let spoken = '';
  let at = 0;
  const found: { d: Direction; before: number }[] = [];
  for (const m of text.matchAll(TAG)) {
    spoken += text.slice(at, m.index);
    at = m.index! + m[0].length;
    const d = { kind: m[1].toLowerCase() as DirectionKind, phrase: m[2].trim() };
    const pause = d.kind === 'action' ? pauseMsOf(d.phrase) : null;
    if (pause !== null) spoken += ` [pause ${pause / 1000}s] `;
    else if (d.phrase) found.push({ d, before: spokenLength(spoken) });
  }
  spoken = (spoken + text.slice(at)).replace(/\s+/g, ' ').trim();
  const total = spokenLength(spoken);
  return { spoken, tags: found.map(({ d, before }) => ({ ...d, at: total ? Math.min(1, before / total) : 0 })) };
}

const isOnlyTags = (s: string) => !s.replace(TAG, '').trim();

/** Cuts text over MAX_LINE at word breaks. */
function wrap(s: string): string[] {
  const out: string[] = [];
  let rest = s;
  while (rest.length > MAX_LINE) {
    const cut = rest.lastIndexOf(' ', MAX_LINE);
    const at = cut > 0 ? cut : MAX_LINE;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  return rest ? [...out, rest] : out;
}

/**
 * A whole script as script lines: one per sentence (a paragraph or title on its own line counts as one), directions
 * kept with the words after them, directions at the very end kept with the last sentence. Short neighbours are joined
 * so there are at most 50 lines, none over 500 characters.
 */
export function splitScript(text: string): string[] {
  const sentences: string[] = [];
  for (const para of text.replace(/\*\*|__/g, '').split(/\n+/)) {
    const clean = para.replace(/^\s*#+\s*/, '').trim();
    if (!clean) continue;
    for (const s of clean.split(/(?<=[.!?…]["'”’)]*)\s+(?=\S)/)) {
      if (isOnlyTags(s) && sentences.length) sentences[sentences.length - 1] += ` ${s}`;
      else sentences.push(...wrap(s));
    }
  }
  while (sentences.length > MAX_LINES) {
    let best = -1;
    for (let i = 0; i + 1 < sentences.length; i++) {
      const len = sentences[i].length + 1 + sentences[i + 1].length;
      if (len <= MAX_LINE && (best < 0 || len < sentences[best].length + 1 + sentences[best + 1].length)) best = i;
    }
    if (best < 0) break;
    sentences.splice(best, 2, `${sentences[best]} ${sentences[best + 1]}`);
  }
  return sentences;
}

// First matching rule wins; an expression nothing matches keeps the one before it, an action nothing matches is skipped.
const EXPRESSION_WORDS: [RegExp, Expression][] = [
  [/surpris|astonish|amaz|shock|eyes? wid|gasp|wow/, 'surprised'],
  [/excit|delight|thrill|enthusias|ecsta|overjoy|eager/, 'excited'],
  [/confus|puzzl|baffl|perplex/, 'confused'],
  [/worr|nervous|anxi|scared|afraid|fear|concern/, 'worried'],
  [/angr|furious|mad\b|annoy|frustrat|irritat/, 'angry'],
  [/sad|unhappy|tear|sorrow|gloom|disappoint|cry/, 'sad'],
  [/wink|cheeky|playful/, 'wink'],
  [/sleep|tired|yawn|drows/, 'sleepy'],
  [/curious|thought|think|ponder|wonder|raised eyebrow|sincere|serious|reflect/, 'thinking'],
  [/smil|happy|warm|hope|joy|cheer|glad|kind|friendly|grin|proud/, 'happy'],
  [/neutral|calm|blank|plain/, 'neutral'],
];
const ACTION_WORDS: [RegExp, ActionMark['gesture']][] = [
  [/wave|waving/, 'wave'],
  [/point/, 'point'],
  [/shrug/, 'shrug'],
  [/\bnod/, 'nod'],
  [/look(s|ing)? down|glanc\w* down|lowers? (his |her |their )?(head|gaze|eyes)/, 'lookDown'],
  [/celebrat|cheer|spread\w* (his |her |their )?arms|arms? (up|wide|out)|jump|fist pump/, 'celebrate'],
  [/chin|tilt|scratch\w* (his |her |their )?head|think/, 'think'],
  [/open\w* (his |her |their )?hands|explain|gestur|palms?|presents?/, 'explain'],
];

/** The built-in, offline matcher: plain keyword rules. */
export function keywordMatch(d: Direction): Match {
  const p = d.phrase.toLowerCase();
  const rules: [RegExp, Exclude<Match, null>][] = d.kind === 'expression' ? EXPRESSION_WORDS : ACTION_WORDS;
  return rules.find(([re]) => re.test(p))?.[1] ?? null;
}

/**
 * The animation a directed script describes: neutral until the first expression, each direction at its place in its
 * line's span (one at the very end of a line goes to the next line's start). Actions get the Animate step's clips.
 */
export function marksFromDirections(lines: { startMs: number; endMs: number; tags: Placed[] }[], matches: Map<string, Match>, durationMs: number): Marks {
  let m: Marks = { expressions: [{ startMs: 0, expression: 'neutral' }], actions: [] };
  lines.forEach((l, i) => {
    for (const t of l.tags) {
      const match = matches.get(directionKey(t));
      if (!match) continue;
      const ms = Math.round(t.at >= 1 && lines[i + 1] ? lines[i + 1].startMs : l.startMs + t.at * (l.endMs - l.startMs));
      m = t.kind === 'expression' ? addExpression(m, ms, match as Expression) : addAction(m, ms, match as ActionMark['gesture'], durationMs) ?? m;
    }
  });
  return m;
}
