import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { actionsForLibrary, parseAction, registerActions, type Action, type ActionJson } from '../shared/actions';

const publicAction = (a: Action): ActionJson => ({ ...a.json, name: a.name, label: a.label, duration: a.duration, play: a.play, tags: a.tags, needs: a.needs });
let lastActionErrors: string[] = [];

export function loadActionLibrary(root = resolve('data/motions')): Action[] {
  const loaded: Action[] = [];
  lastActionErrors = [];
  if (existsSync(root)) for (const file of readdirSync(root).filter((x) => x.endsWith('.json')).sort()) {
    try { loaded.push(parseAction(JSON.parse(readFileSync(join(root, file), 'utf8')))); }
    catch (error) { const message = `Action ${file} was refused: ${error instanceof Error ? error.message : String(error)}`; lastActionErrors.push(message); console.warn(message); }
  }
  registerActions(loaded);
  return actionsForLibrary();
}

export function actionRecords(root = resolve('data/motions')): ActionJson[] {
  return loadActionLibrary(root).map(publicAction);
}

export function actionRoutes() {
  loadActionLibrary();
  return (_req: unknown, res: { json: (body: unknown) => void }) => res.json({ actions: actionRecords(), errors: lastActionErrors });
}
