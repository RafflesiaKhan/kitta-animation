import { directionKey, keywordMatch, type Direction, type Match } from '../shared/direction';
import * as gemini from './gemini';
import * as openai from './openai';

export type DirectedBy = 'gemini' | 'openai' | 'keywords';

/**
 * Matches each distinct stage direction to what the character can do: Gemini when its key is set, else OpenAI, else the
 * keyword rules. A failed AI call, or an unusable answer for one direction, falls back to the keyword rules, so a script
 * is never refused over its directions.
 */
export async function directAll(ds: Direction[]): Promise<{ matches: Map<string, Match>; by: DirectedBy }> {
  const unique = [...new Map(ds.map((d) => [directionKey(d), d])).values()];
  const ai: DirectedBy = process.env.GEMINI_API_KEY ? 'gemini' : process.env.OPENAI_API_KEY ? 'openai' : 'keywords';
  let answers: (Match | undefined)[] = [];
  let by = ai;
  if (ai !== 'keywords' && unique.length) {
    try {
      answers = await (ai === 'gemini' ? gemini.direct(unique) : openai.direct(unique));
    } catch (e) {
      console.warn(`[director] ${ai} failed, using keyword matching:`, e instanceof Error ? e.message : e);
      by = 'keywords';
    }
  }
  return { matches: new Map(unique.map((d, i) => [directionKey(d), answers[i] === undefined ? keywordMatch(d) : answers[i]!])), by };
}
