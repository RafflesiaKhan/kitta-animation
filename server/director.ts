import { directionKey, keywordMatch, type Direction, type Match } from '../shared/direction';
import * as gemini from './gemini';
import * as openai from './openai';

export type DirectedBy = 'gemini' | 'openai' | 'keywords';

/**
 * Matches each distinct stage direction to what the character can do: Gemini when its key is set, then OpenAI (also
 * when Gemini fails, e.g. busy), else the keyword rules. A failed AI call, or an unusable answer for one direction,
 * falls back to the keyword rules, so a script is never refused over its directions.
 */
export async function directAll(ds: Direction[]): Promise<{ matches: Map<string, Match>; by: DirectedBy }> {
  const unique = [...new Map(ds.map((d) => [directionKey(d), d])).values()];
  const ais = ([['gemini', 'GEMINI_API_KEY', gemini.direct], ['openai', 'OPENAI_API_KEY', openai.direct]] as const).filter(([, key]) => process.env[key]);
  let answers: (Match | undefined)[] = [];
  let by: DirectedBy = 'keywords';
  for (const [name, , direct] of unique.length ? ais : []) {
    try {
      answers = await direct(unique);
      by = name;
      break;
    } catch (e) {
      console.warn(`[director] ${name} failed:`, e instanceof Error ? e.message : e);
    }
  }
  return { matches: new Map(unique.map((d, i) => [directionKey(d), answers[i] === undefined ? keywordMatch(d) : answers[i]!])), by };
}
