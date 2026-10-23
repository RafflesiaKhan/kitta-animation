import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import * as api from '../../src/api';

vi.mock('../../src/api');
let lastProps: { timeline: any } | undefined;
vi.mock('../../src/Preview', () => ({
  Preview: (props: { timeline: unknown; status?: string }) => {
    lastProps = props as any;
    return <div data-testid="preview-stub">{props.status}</div>;
  },
}));
beforeEach(() => { vi.mocked(api.health).mockResolvedValue({ rhubarb: true, gemini: true }); });
afterEach(() => { lastProps = undefined; cleanup(); vi.resetAllMocks(); });

const defer = <T,>() => { let resolve!: (v: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; };
const cues = [{ startMs: 0, endMs: 500, shape: 'C' as const }];
const btn = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;

const openScript = async () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '2 Voiceover' }));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '✍ Write script' })); });
};
const upload = async () => {
  vi.mocked(api.uploadAudio).mockResolvedValue({ audioId: 'abc', durationMs: 5000 });
  vi.mocked(api.lipsync).mockResolvedValue(cues);
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '2 Voiceover' }));
  await act(async () => { fireEvent.change(screen.getByLabelText('Upload voiceover'), { target: { files: [new File(['x'], 'a.wav')] } }); });
};

it('script tab: Auto-tag fills chips, skips empty lines, and shows status', async () => {
  const d = defer<Awaited<ReturnType<typeof api.autoTag>>>();
  vi.mocked(api.autoTag).mockReturnValue(d.promise);
  await openScript();
  fireEvent.click(btn('+ Line'));
  fireEvent.click(btn('+ Line'));
  const boxes = screen.getAllByLabelText('Line text');
  fireEvent.change(boxes[0], { target: { value: 'Hooray' } });
  fireEvent.change(boxes[2], { target: { value: 'Bye' } });
  fireEvent.click(btn('✨ Auto-tag expressions'));
  expect(screen.getByText('Tagging expressions…')).toBeTruthy();
  expect(api.autoTag).toHaveBeenCalledWith(['Hooray', 'Bye']);
  await act(async () => { d.resolve([{ expression: 'happy', gesture: 'wave' }, { expression: 'sad', gesture: 'lookDown' }]); });
  const ex = screen.getAllByLabelText('Expression').map((s) => (s as HTMLSelectElement).value);
  const ge = screen.getAllByLabelText('Gesture').map((s) => (s as HTMLSelectElement).value);
  expect(ex).toEqual(['happy', 'neutral', 'sad']);
  expect(ge).toEqual(['wave', 'none', 'lookDown']);
  fireEvent.change(screen.getAllByLabelText('Expression')[0], { target: { value: 'angry' } }); // still editable
  expect((screen.getAllByLabelText('Expression')[0] as HTMLSelectElement).value).toBe('angry');
});

it('script tab: disabled with tooltip when there is no key; shows API errors', async () => {
  vi.mocked(api.health).mockResolvedValue({ rhubarb: true, gemini: false });
  await openScript();
  expect(btn('✨ Auto-tag expressions').disabled).toBe(true);
  expect(btn('✨ Auto-tag expressions').title).toBe('Needs GEMINI_API_KEY');
});

it('script tab: shows an inline error when tagging fails', async () => {
  vi.mocked(api.autoTag).mockRejectedValue(new Error('Free Gemini limit reached, try again later'));
  await openScript();
  fireEvent.change(screen.getByLabelText('Line text'), { target: { value: 'hi' } });
  await act(async () => { fireEvent.click(btn('✨ Auto-tag expressions')); });
  expect(screen.getByRole('alert').textContent).toContain('Free Gemini limit reached');
});

it('upload tab: hidden before upload; transcribe then tag replaces the lines', async () => {
  const tr = defer<{ text: string; startMs: number; endMs: number }[]>();
  const tg = defer<Awaited<ReturnType<typeof api.autoTag>>>();
  vi.mocked(api.transcribe).mockReturnValue(tr.promise);
  vi.mocked(api.autoTag).mockReturnValue(tg.promise);
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '2 Voiceover' }));
  expect(screen.queryByRole('button', { name: '✨ Add expressions' })).toBeNull();
  cleanup();
  await upload();
  await act(async () => {});
  fireEvent.click(btn('✨ Add expressions'));
  expect(screen.getByText('Listening…')).toBeTruthy();
  expect(api.transcribe).toHaveBeenCalledWith('abc');
  await act(async () => { tr.resolve([{ text: 'Hi', startMs: 0, endMs: 1000 }, { text: 'Oh no', startMs: 1200, endMs: 2500 }]); });
  expect(screen.getByText('Tagging expressions…')).toBeTruthy();
  expect(api.autoTag).toHaveBeenCalledWith(['Hi', 'Oh no']);
  await act(async () => { tg.resolve([{ expression: 'happy', gesture: 'wave' }, { expression: 'sad', gesture: 'none' }]); });
  expect(lastProps!.timeline).toEqual({
    durationMs: 5000, cues,
    lines: [
      { text: 'Hi', startMs: 0, endMs: 1000, expression: 'happy', gesture: 'wave' },
      { text: 'Oh no', startMs: 1200, endMs: 2500, expression: 'sad', gesture: 'none' },
    ],
  });
});

it('upload tab: no speech shows an error and leaves the timeline unchanged', async () => {
  vi.mocked(api.transcribe).mockResolvedValue([]);
  await upload();
  const before = lastProps!.timeline;
  await act(async () => { fireEvent.click(btn('✨ Add expressions')); });
  expect(screen.getByRole('alert').textContent).toBe("Couldn't find any speech to tag.");
  expect(api.autoTag).not.toHaveBeenCalled();
  expect(lastProps!.timeline).toBe(before);
});

it('upload tab: disabled with tooltip without a key; health fetched once', async () => {
  vi.mocked(api.health).mockResolvedValue({ rhubarb: true, gemini: false });
  await upload();
  expect(btn('✨ Add expressions').disabled).toBe(true);
  expect(btn('✨ Add expressions').title).toBe('Needs GEMINI_API_KEY');
  expect(api.health).toHaveBeenCalledTimes(1);
});
