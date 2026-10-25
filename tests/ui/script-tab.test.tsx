import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import * as api from '../../src/api';
import { EXPRESSIONS } from '../../shared/types';

vi.mock('../../src/api');
let lastProps: { timeline: unknown; audioUrl: string | null } | undefined;
vi.mock('../../src/Preview', () => ({
  Preview: (props: { timeline: unknown; audioUrl: string | null; status?: string }) => {
    lastProps = props;
    return <div data-testid="preview-stub">{props.status}</div>;
  },
}));
beforeEach(() => { vi.mocked(api.health).mockResolvedValue({ rhubarb: true, gemini: true }); });
afterEach(() => { lastProps = undefined; cleanup(); vi.resetAllMocks(); });

const open = async () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '2 Voiceover' }));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '✍ Write script' })); });
};
const cards = () => screen.getAllByTestId('script-line');
const textOf = () => screen.getAllByLabelText('Line text').map((t) => (t as HTMLTextAreaElement).value);

it('adds, reorders and deletes lines', async () => {
  await open();
  expect(cards()).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: '+ Line' }));
  const boxes = screen.getAllByLabelText('Line text');
  fireEvent.change(boxes[0], { target: { value: 'first' } });
  fireEvent.change(boxes[1], { target: { value: 'second' } });
  fireEvent.click(within(cards()[1]).getByRole('button', { name: 'Move up' }));
  expect(textOf()).toEqual(['second', 'first']);
  fireEvent.click(within(cards()[0]).getByRole('button', { name: 'Delete line' }));
  expect(textOf()).toEqual(['first']);
});

it('expression dropdown lists EXPRESSIONS', async () => {
  await open();
  const sel = screen.getByLabelText('Expression') as HTMLSelectElement;
  expect([...sel.options].map((o) => o.value)).toEqual(EXPRESSIONS);
});

it('shows the notice and disables Generate when gemini is not configured', async () => {
  vi.mocked(api.health).mockResolvedValue({ rhubarb: true, gemini: false });
  await open();
  expect(screen.getByText('Add GEMINI_API_KEY, OPENAI_API_KEY or VOICESTUDIO_URL to .env to generate voices.')).toBeTruthy();
  const gen = screen.getByRole('button', { name: '▶ Generate voice' }) as HTMLButtonElement;
  expect(gen.disabled).toBe(true);
  expect(gen.title).toBe('Needs GEMINI_API_KEY, OPENAI_API_KEY or VOICESTUDIO_URL');
});

it('delivery note input is capped at 200 characters', async () => {
  await open();
  expect((screen.getByLabelText('Delivery note') as HTMLInputElement).maxLength).toBe(200);
});

it('shows API errors inline', async () => {
  vi.mocked(api.tts).mockRejectedValue(new Error('Free Gemini limit reached, try again later'));
  await open();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '▶ Generate voice' })); });
  expect(screen.getByRole('alert').textContent).toContain('Free Gemini limit reached');
});

it('generates, sets the timeline, and keeps the draft across steps', async () => {
  const result = { audioId: 'zzz', durationMs: 2000, cues: [{ startMs: 0, endMs: 500, shape: 'C' as const }], lines: [{ text: 'hi', startMs: 0, endMs: 2000, expression: 'sad' as const, gesture: 'nod' as const }] };
  let resolve!: (v: typeof result) => void;
  vi.mocked(api.tts).mockReturnValue(new Promise((r) => { resolve = r; }));
  await open();
  fireEvent.change(screen.getByLabelText('Line text'), { target: { value: 'hi' } });
  fireEvent.change(screen.getByLabelText('Expression'), { target: { value: 'sad' } });
  fireEvent.change(screen.getByLabelText('Gesture'), { target: { value: 'nod' } });
  fireEvent.change(screen.getByLabelText('Delivery note'), { target: { value: 'softly' } });
  fireEvent.click(screen.getByRole('button', { name: '▶ Generate voice' }));
  expect(screen.getByText('Generating voice…')).toBeTruthy();
  expect(api.tts).toHaveBeenCalledWith([expect.objectContaining({ text: 'hi', expression: 'sad', gesture: 'nod', note: 'softly', voice: expect.any(String) })], 'gemini', undefined);
  await act(async () => { resolve(result); });
  expect(lastProps!.audioUrl).toBe('/api/audio/zzz');
  expect(lastProps!.timeline).toEqual({ durationMs: 2000, cues: result.cues, lines: result.lines });
  // switch steps and come back: draft survives
  fireEvent.click(screen.getByRole('button', { name: '1 Character' }));
  fireEvent.click(screen.getByRole('button', { name: '2 Voiceover' }));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '✍ Write script' })); });
  expect(textOf()).toEqual(['hi']);
});

const studioInfo = {
  running: true, url: 'http://localhost:3900', version: '0.5.6', device: 'mps',
  voices: [{ id: 'demo0001', label: 'VoiceStudio Demo Voice (English)', kind: 'profile' as const }, { id: 'alloy', label: "Engine's default voice", kind: 'default' as const }],
  engines: [{ id: 'omnivoice', label: 'VoiceStudio (k2-fsa/OmniVoice, 600+ languages)', cloning: true, emotion: false }, { id: 'kittentts', label: 'KittenTTS (English, 8 preset voices, CPU realtime)', cloning: false, emotion: false }],
};

it('switches the voice provider and its voices', async () => {
  vi.mocked(api.health).mockResolvedValue({ rhubarb: true, gemini: true, ttsProviders: ['gemini', 'openai', 'voicestudio'] });
  vi.mocked(api.voiceStudio).mockResolvedValue(studioInfo);
  vi.mocked(api.tts).mockReturnValue(new Promise(() => {}));
  await open();
  const voice = () => screen.getByLabelText('Voice') as HTMLSelectElement;
  expect(voice().value).toBe('Kore');
  fireEvent.change(await screen.findByLabelText('Voice by'), { target: { value: 'openai' } });
  await waitFor(() => expect(voice().value).toBe('coral'));
  fireEvent.change(screen.getByLabelText('Voice by'), { target: { value: 'voicestudio' } });
  await waitFor(() => expect([...voice().options].map((o) => o.text)).toEqual(['VoiceStudio Demo Voice (English)', "Engine's default voice"]));
  expect(screen.getByTestId('studio-status').textContent).toBe('● VoiceStudio 0.5.6 running on mps');
  // KittenTTS can't clone: picking it with the saved voice explains what will happen
  fireEvent.change(screen.getByLabelText('Engine'), { target: { value: 'kittentts' } });
  expect(voice().value).toBe('demo0001'); // the saved voice is picked first
  expect(screen.getByText(/KittenTTS can't use saved or cloned voices/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Engine'), { target: { value: 'omnivoice' } });
  fireEvent.change(screen.getByLabelText('Line text'), { target: { value: 'hi [laughter]' } });
  fireEvent.click(screen.getByRole('button', { name: '▶ Generate voice' }));
  expect(api.tts).toHaveBeenCalledWith([expect.objectContaining({ text: 'hi [laughter]', voice: 'demo0001' })], 'voicestudio', 'omnivoice');
  expect(screen.getByText(/\[laughter\] and \[sigh\]/)).toBeTruthy();
});

it("says when VoiceStudio isn't running and blocks Generate until it is", async () => {
  vi.mocked(api.health).mockResolvedValue({ rhubarb: true, gemini: false, ttsProviders: ['voicestudio'] });
  vi.mocked(api.voiceStudio).mockResolvedValueOnce({ running: false, url: 'http://localhost:3900', voices: [], engines: [] }).mockResolvedValue(studioInfo);
  await open();
  await waitFor(() => expect(screen.getByTestId('studio-status').textContent).toMatch(/isn't running at http:\/\/localhost:3900/));
  fireEvent.change(screen.getByLabelText('Line text'), { target: { value: 'hi' } });
  expect((screen.getByRole('button', { name: '▶ Generate voice' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'check again' }));
  await waitFor(() => expect((screen.getByRole('button', { name: '▶ Generate voice' }) as HTMLButtonElement).disabled).toBe(false));
});
