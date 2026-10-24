import type { AnyCharacter, ArtCharacter, ArtPose, Expression, ExportFormat, Gesture, Line, MouthCue, ScriptLineInput, Timeline } from '../shared/types';

async function post<T>(url: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', ...init });
  } catch {
    throw new Error('Could not reach the server. Is it running?');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : `Request failed (${res.status})`);
  return body as T;
}

export function uploadAudio(file: File): Promise<{ audioId: string; durationMs: number }> {
  const form = new FormData();
  form.append('file', file);
  return post('/api/audio', { body: form });
}

export async function lipsync(audioId: string, dialog?: string): Promise<MouthCue[]> {
  const { cues } = await post<{ cues: MouthCue[] }>('/api/lipsync', {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audioId, dialog }),
  });
  return cues;
}

export async function health(): Promise<{ rhubarb: boolean; gemini: boolean }> {
  const res = await fetch('/api/health');
  return res.json();
}

export function tts(lines: ScriptLineInput[]): Promise<{ audioId: string; durationMs: number; lines: Line[]; cues: MouthCue[] }> {
  return post('/api/tts', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lines }) });
}

export function autoTag(texts: string[]): Promise<{ expression: Expression; gesture: Gesture }[]> {
  return post<{ tags: { expression: Expression; gesture: Gesture }[] }>('/api/autotag', {
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texts }),
  }).then((r) => r.tags);
}

export function transcribe(audioId: string): Promise<{ text: string; startMs: number; endMs: number }[]> {
  return post<{ lines: { text: string; startMs: number; endMs: number }[] }>('/api/transcribe', {
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audioId }),
  }).then((r) => r.lines);
}

/** The saved AI characters; an empty list if the server can't be reached. */
export async function listCharacters(): Promise<ArtCharacter[]> {
  try {
    const res = await fetch('/api/characters');
    const body = res.ok ? await res.json() : null;
    return Array.isArray(body?.characters) ? body.characters : [];
  } catch {
    return [];
  }
}

export interface CreateCharacterInput { description: string; name: string; style: string; reference?: File }

export function createCharacter({ description, name, style, reference }: CreateCharacterInput): Promise<ArtCharacter> {
  const form = new FormData();
  form.append('description', description);
  form.append('name', name);
  form.append('style', style);
  if (reference) form.append('reference', reference);
  return post<{ character: ArtCharacter }>('/api/characters', { body: form }).then((r) => r.character);
}

export function generatePose(id: string, pose: ArtPose): Promise<ArtCharacter> {
  return post<{ character: ArtCharacter }>(`/api/characters/${id}/poses/${pose}`, {}).then((r) => r.character);
}

export async function deleteCharacter(id: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`/api/characters/${id}`, { method: 'DELETE' });
  } catch {
    throw new Error('Could not reach the server. Is it running?');
  }
  if (!res.ok && res.status !== 404) throw new Error('Delete failed.');
}

export interface ExportBody { character: AnyCharacter; timeline: Timeline; audioId: string; format: ExportFormat }

/** Starts an export and resolves with the download URL, reporting 0..1 progress from the NDJSON stream. */
export async function exportVideo(body: ExportBody, onProgress: (p: number) => void): Promise<string> {
  let res: Response;
  try {
    res = await fetch('/api/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new Error('Could not reach the server. Is it running?');
  }
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({}));
    throw new Error(typeof err.error === 'string' ? err.error : `Request failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let url: string | null = null;
  const handle = (line: string) => {
    if (!line.trim()) return;
    const msg = JSON.parse(line);
    if (typeof msg.error === 'string') throw new Error(msg.error);
    if (msg.done && typeof msg.url === 'string') url = msg.url;
    else if (typeof msg.progress === 'number') onProgress(msg.progress);
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    lines.forEach(handle);
  }
  handle(buffer);
  if (!url) throw new Error('Export failed. Please try again.');
  return url;
}
