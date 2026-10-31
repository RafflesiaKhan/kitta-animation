import { act, cleanup, createEvent, fireEvent, render, screen, within } from '@testing-library/react';
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
  fireEvent.click(screen.getByRole('button', { name: '4 Export' }));
  fireEvent.click(screen.getByRole('button', { name: '2 Voiceover' }));
  expect((screen.getByLabelText('Upload voiceover') as HTMLInputElement).disabled).toBe(true);
  await act(async () => { up.resolve({ audioId: 'first', durationMs: 1000 }); });
  expect((screen.getByLabelText('Upload voiceover') as HTMLInputElement).disabled).toBe(false);
  expect(vi.mocked(api.uploadAudio)).toHaveBeenCalledTimes(1);
  expect(lastProps!.audioUrl).toBe('/api/audio/first');
});

it('lists the uploaded line and lets you edit its expression and gesture without re-running anything', async () => {
  vi.mocked(api.health).mockResolvedValue({ rhubarb: true, gemini: false });
  vi.mocked(api.uploadAudio).mockResolvedValue({ audioId: 'abc', durationMs: 65000 });
  vi.mocked(api.lipsync).mockResolvedValue(cues);
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '2 Voiceover' }));
  expect(screen.queryByTestId('upload-line')).toBeNull();
  await act(async () => { pick(); });
  const row = screen.getByTestId('upload-line');
  expect(row.textContent).toContain('0:00–1:05');
  expect(row.textContent).toContain('(whole clip)');
  await act(async () => { fireEvent.change(within(row).getByLabelText('Expression'), { target: { value: 'happy' } }); });
  fireEvent.change(within(screen.getByTestId('upload-line')).getByLabelText('Gesture'), { target: { value: 'wave' } });
  expect((lastProps!.timeline as { lines: unknown[] }).lines).toEqual([
    { text: '', startMs: 0, endMs: 65000, expression: 'happy', gesture: 'wave' },
  ]);
  expect(api.lipsync).toHaveBeenCalledTimes(1);
  expect(api.tts).not.toHaveBeenCalled();
});

it('animating by hand drives the video, and the upload lines say so', async () => {
  vi.mocked(api.health).mockResolvedValue({ rhubarb: true, gemini: false });
  vi.mocked(api.uploadAudio).mockResolvedValue({ audioId: 'abc', durationMs: 65000 });
  vi.mocked(api.lipsync).mockResolvedValue(cues);
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '2 Voiceover' }));
  await act(async () => { pick(); });
  expect(screen.queryByText(/Animated in the Animate step/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '3 Animate' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add angry' }));
  expect((lastProps!.timeline as { marks: unknown }).marks).toEqual({ expressions: [{ startMs: 0, expression: 'angry' }], actions: [] });
  fireEvent.click(screen.getByRole('button', { name: '2 Voiceover' }));
  expect(screen.getByText(/Animated in the Animate step/)).toBeTruthy();
  vi.unstubAllGlobals();
});

it('keeps every edit when several land before the next render', async () => {
  vi.mocked(api.health).mockResolvedValue({ rhubarb: true, gemini: false });
  vi.mocked(api.uploadAudio).mockResolvedValue({ audioId: 'abc', durationMs: 10000 });
  vi.mocked(api.lipsync).mockResolvedValue(cues);
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '2 Voiceover' }));
  await act(async () => { pick(); });
  fireEvent.click(screen.getByRole('button', { name: '3 Animate' }));
  const row = screen.getByTestId('row-expression');
  vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 100, top: 0, height: 20, right: 100, bottom: 20, x: 0, y: 0, toJSON: () => ({}) });
  const drop = (data: string, x: number) => {
    const ev = createEvent.drop(row, { dataTransfer: { getData: () => data, types: ['text/plain'] } });
    Object.defineProperty(ev, 'clientX', { value: x });
    fireEvent(row, ev);
  };
  act(() => { drop('expression:angry', 20); drop('expression:happy', 60); }); // one batch: no render in between
  expect((lastProps!.timeline as { marks: { expressions: unknown[] } }).marks.expressions).toEqual([
    { startMs: 0, expression: 'neutral' }, { startMs: 2000, expression: 'angry' }, { startMs: 6000, expression: 'happy' },
  ]);
  vi.unstubAllGlobals();
});
