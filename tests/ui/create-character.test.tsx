import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import * as api from '../../src/api';
import type { ArtCharacter } from '../../shared/types';

vi.mock('../../src/api');
beforeEach(() => {
  vi.mocked(api.health).mockResolvedValue({ rhubarb: true, gemini: true });
  vi.mocked(api.listCharacters).mockResolvedValue([]);
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

const robo: ArtCharacter = {
  kind: 'art', id: '11111111-2222-3333-4444-555555555555', name: 'Robo', prompt: 'a robot', style: 'anime',
  images: { neutral: { file: 'neutral-a.png', mouth: { x: 0.5, y: 0.6, w: 0.1, skin: '#ccc' } } },
};

it('creates a character from a description and selects it', async () => {
  vi.mocked(api.createCharacter).mockResolvedValue(robo);
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: /Create with AI/ }));
  const create = screen.getByRole('button', { name: '✨ Create character' }) as HTMLButtonElement;
  expect(create.disabled).toBe(true); // nothing described yet
  fireEvent.change(screen.getByLabelText('Describe your character'), { target: { value: '  a robot  ' } });
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Robo' } });
  fireEvent.change(screen.getByLabelText('Style'), { target: { value: 'anime' } });
  await act(async () => { fireEvent.click(create); });
  expect(api.createCharacter).toHaveBeenCalledWith({ description: 'a robot', name: 'Robo', style: 'anime', provider: 'gemini', reference: undefined });
  expect(screen.queryByLabelText('Drawn by')).toBeNull(); // only one provider configured
  await waitFor(() => expect(screen.getByTestId('stage').getAttribute('data-starter')).toBe(`art:${robo.id}`));
  expect(screen.getByRole('button', { name: /Robo/, pressed: true })).toBeTruthy();
  expect(screen.getByTestId('pose-happy').textContent).toContain('not drawn');
});

it('draws all missing poses one at a time and shows them', async () => {
  vi.mocked(api.listCharacters).mockResolvedValue([robo]);
  let current = robo;
  vi.mocked(api.generatePose).mockImplementation(async (_id, pose) => {
    current = { ...current, images: { ...current.images, [pose]: { file: `${pose}-b.png`, mouth: null } } };
    return current;
  });
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: /Robo/ }));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Draw all 15 missing poses/ })); });
  await waitFor(() => expect(api.generatePose).toHaveBeenCalledTimes(15));
  expect(vi.mocked(api.generatePose).mock.calls.map((c) => c[1])).toEqual(
    ['happy', 'sad', 'surprised', 'angry', 'excited', 'thinking', 'confused', 'worried', 'wink', 'sleepy', 'blink', 'wave', 'lookDown', 'celebrate', 'shrug']);
  await waitFor(() => expect(screen.getByRole('img', { name: 'celebrate' }).getAttribute('src')).toBe(`/api/characters/${robo.id}/celebrate-b.png`));
  expect(screen.queryByRole('button', { name: /missing pose/ })).toBeNull();
});

it('shows a drawing error and keeps the poses drawn before it', async () => {
  vi.mocked(api.listCharacters).mockResolvedValue([robo]);
  vi.mocked(api.generatePose)
    .mockResolvedValueOnce({ ...robo, images: { ...robo.images, happy: { file: 'happy-b.png', mouth: null } } })
    .mockRejectedValueOnce(new Error('Free Gemini limit reached, try again later'));
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: /Robo/ }));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Draw all 15 missing poses/ })); });
  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Free Gemini limit reached, try again later'));
  expect(screen.getByRole('img', { name: 'happy' })).toBeTruthy();
  expect(screen.getByRole('button', { name: /Draw all 14 missing poses/ })).toBeTruthy();
});

it('lets you pick OpenAI when both providers have keys, and works with only OpenAI', async () => {
  vi.mocked(api.health).mockResolvedValue({ rhubarb: true, gemini: true, imageProviders: ['gemini', 'openai'] });
  vi.mocked(api.createCharacter).mockResolvedValue({ ...robo, provider: 'openai' });
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: /Create with AI/ }));
  fireEvent.change(await screen.findByLabelText('Drawn by'), { target: { value: 'openai' } });
  fireEvent.change(screen.getByLabelText('Describe your character'), { target: { value: 'a robot' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '✨ Create character' })); });
  expect(vi.mocked(api.createCharacter).mock.calls[0][0].provider).toBe('openai');
  await waitFor(() => expect(screen.getByText(/anime · OpenAI · a robot/)).toBeTruthy());
});

it('enables creation with only an OpenAI key', async () => {
  vi.mocked(api.health).mockResolvedValue({ rhubarb: true, gemini: false, imageProviders: ['openai'] });
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: /Create with AI/ }));
  fireEvent.change(screen.getByLabelText('Describe your character'), { target: { value: 'a robot' } });
  await waitFor(() => expect((screen.getByRole('button', { name: '✨ Create character' }) as HTMLButtonElement).disabled).toBe(false));
});

it('disables creation without any image key', async () => {
  vi.mocked(api.health).mockResolvedValue({ rhubarb: true, gemini: false, imageProviders: [] });
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: /Create with AI/ }));
  await screen.findByText('Add GEMINI_API_KEY or OPENAI_API_KEY to .env to create characters.');
  fireEvent.change(screen.getByLabelText('Describe your character'), { target: { value: 'a robot' } });
  expect((screen.getByRole('button', { name: '✨ Create character' }) as HTMLButtonElement).disabled).toBe(true);
});
