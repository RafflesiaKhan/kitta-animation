import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import * as api from '../../src/api';

vi.mock('../../src/api');
let lastProps: { timeline: unknown; audioUrl: string | null } | undefined;
vi.mock('../../src/Preview', () => ({
  Preview: (props: { timeline: unknown; audioUrl: string | null; status?: string }) => {
    lastProps = props;
    return <div data-testid="preview-stub">{props.status}</div>;
  },
}));
afterEach(() => { lastProps = undefined; cleanup(); vi.resetAllMocks(); });

const defer = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
};
const pick = () => fireEvent.change(screen.getByLabelText('Upload voiceover'), { target: { files: [new File(['x'], 'a.wav', { type: 'audio/wav' })] } });
const cues = [{ startMs: 0, endMs: 500, shape: 'C' as const }];

it('shows progress and builds a one-line timeline on success', async () => {
  const up = defer<{ audioId: string; durationMs: number }>();
  const lip = defer<typeof cues>();
  vi.mocked(api.uploadAudio).mockReturnValue(up.promise);
  vi.mocked(api.lipsync).mockReturnValue(lip.promise);
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '2 Voiceover' }));
  pick();
  expect(screen.getByText('Uploading…')).toBeTruthy();
  await act(async () => { up.resolve({ audioId: 'abc', durationMs: 1200 }); });
  expect(screen.getByText('Matching lips…')).toBeTruthy();
  expect(api.lipsync).toHaveBeenCalledWith('abc');
  await act(async () => { lip.resolve(cues); });
  expect(screen.queryByText('Matching lips…')).toBeNull();
  expect(lastProps!.audioUrl).toBe('/api/audio/abc');
  expect(lastProps!.timeline).toEqual({
    durationMs: 1200,
    cues,
    lines: [{ text: '', startMs: 0, endMs: 1200, expression: 'neutral', gesture: 'none' }],
  });
});

it('keeps the input disabled across step switches and applies the result once', async () => {
  const up = defer<{ audioId: string; durationMs: number }>();
  vi.mocked(api.uploadAudio).mockReturnValue(up.promise);
  vi.mocked(api.lipsync).mockResolvedValue(cues);
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '2 Voiceover' }));
  pick();
  fireEvent.click(screen.getByRole('button', { name: '3 Export' }));
  fireEvent.click(screen.getByRole('button', { name: '2 Voiceover' }));
  expect((screen.getByLabelText('Upload voiceover') as HTMLInputElement).disabled).toBe(true);
  await act(async () => { up.resolve({ audioId: 'first', durationMs: 1000 }); });
  expect((screen.getByLabelText('Upload voiceover') as HTMLInputElement).disabled).toBe(false);
  expect(vi.mocked(api.uploadAudio)).toHaveBeenCalledTimes(1);
  expect(lastProps!.audioUrl).toBe('/api/audio/first');
});
