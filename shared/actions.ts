import explainJson from './vector-avator/motions/explain.json';
import mbWaveJson from './vector-avator/motions/mb_wave.json';
import nodJson from './vector-avator/motions/nod_surprise.json';
import pointJson from './vector-avator/motions/point.json';
import spreadJson from './vector-avator/motions/spread.json';
import thinkJson from './vector-avator/motions/think.json';
import { parseMotion, type Motion, type MotionJson } from './vector-avator/core/motion';

export type ActionPlay = 'once' | 'loop' | 'hold';
export interface ActionSource { route?: string; model?: string; prompt?: string; [key: string]: unknown }
export interface Action {
  name: string; label: string; duration: number; play: ActionPlay; tags: string[]; needs: string[];
  source?: ActionSource | string; motion: Motion; json: ActionJson;
}

export interface ActionJson extends MotionJson {
  play?: ActionPlay; tags?: string[]; needs?: string[]; source?: ActionSource | string;
}

const legacy = (name: string, label: string, motion: MotionJson, extra: Partial<ActionJson> = {}): Action =>
  parseAction({ ...motion, name, label, ...extra });

export function parseAction(value: unknown): Action {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('action must be a JSON object');
  const json = value as Partial<ActionJson>;
  if (typeof json.name !== 'string' || !/^[A-Za-z0-9_-]+$/.test(json.name)) throw new Error('action name must contain only letters, numbers, _ or -');
  if (typeof json.label !== 'string' || !json.label.trim()) throw new Error(`action ${json.name}: label is required`);
  if (typeof json.duration !== 'number' || !Number.isFinite(json.duration) || json.duration <= 0) throw new Error(`action ${json.name}: duration must be positive`);
  if (!Array.isArray(json.keys) || !json.keys.length) throw new Error(`action ${json.name}: keys must be a non-empty array`);
  if (json.play !== undefined && json.play !== 'once' && json.play !== 'loop' && json.play !== 'hold') throw new Error(`action ${json.name}: play must be once, loop or hold`);
  if (json.tags !== undefined && (!Array.isArray(json.tags) || json.tags.some((x) => typeof x !== 'string'))) throw new Error(`action ${json.name}: tags must be strings`);
  if (json.needs !== undefined && (!Array.isArray(json.needs) || json.needs.some((x) => typeof x !== 'string'))) throw new Error(`action ${json.name}: needs must be strings`);
  const motion = parseMotion(json as MotionJson);
  return { name: json.name, label: json.label, duration: json.duration, play: json.play ?? (json.loop === false ? 'once' : 'loop'),
    tags: json.tags ?? [], needs: json.needs ?? [], source: json.source, motion, json: json as ActionJson };
}

const noneMotion: MotionJson = { name: 'none', label: 'None', duration: 1, loop: true, keys: [{ t: 0 }] };
const builtins: Action[] = [
  legacy('wave', 'wave', mbWaveJson as unknown as MotionJson),
  legacy('nod', 'nod', nodJson as MotionJson),
  legacy('lookDown', 'look down', { ...noneMotion, name: 'lookDown' }),
  legacy('celebrate', 'celebrate', spreadJson as MotionJson),
  legacy('shrug', 'shrug', spreadJson as MotionJson),
  legacy('think', 'think', thinkJson as MotionJson),
  legacy('point', 'point', pointJson as MotionJson),
  legacy('explain', 'explain', explainJson as MotionJson),
];

export const LEGACY_ACTION_IDS = ['wave', 'nod', 'lookDown', 'celebrate', 'shrug', 'think', 'point', 'explain'] as const;
export const NONE_ACTION = parseAction(noneMotion);
const registry = new Map<string, Action>([['none', NONE_ACTION], ...builtins.map((a) => [a.name, a] as const)]);
export function registerActions(actions: Action[]): void { for (const action of actions) registry.set(action.name, action); }
export function actionFor(id: string): Action | undefined { return registry.get(id); }
export function actionsForLibrary(): Action[] { return [...registry.values()]; }
export function parseActions(values: unknown[]): Action[] { return values.map(parseAction); }

