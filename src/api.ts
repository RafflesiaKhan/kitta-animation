import type { MouthCue } from '../shared/types';

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
