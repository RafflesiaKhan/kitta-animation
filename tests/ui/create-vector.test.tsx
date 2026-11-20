import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import * as api from '../../src/api';
import type { VectorJob } from '../../shared/vector-job';

vi.mock('../../src/api');
const submit = () => screen.getAllByRole('button', { name: 'Create vector character' }).find((b) => b.classList.contains('btn')) as HTMLButtonElement;
const job: VectorJob = {
  id: '11111111-2222-3333-4444-555555555555', name: 'Fox', description: 'A small fox', imageProvider: 'openai', drawProvider: 'openai',
  stage: 'front', round: 0, maxRounds: 4, errors: null, cost: 0, hasFront: false, hasFace: false, hasCheck: false, startedAt: '', updatedAt: '',
};
beforeEach(() => {
  vi.mocked(api.listCharacters).mockResolvedValue([]);
  vi.mocked(api.listVectorCharacters).mockResolvedValue([]);
  vi.mocked(api.listVectorJobs).mockResolvedValue([]);
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it('creates a vector character from a preset, once the bracketed words are replaced', async () => {
  vi.mocked(api.health).mockResolvedValue({ rhubarb: true, gemini: false, imageProviders: ['openai'], vectorDraw: true, vectorDrawProvider: 'openai' });
  vi.mocked(api.startVectorJob).mockResolvedValue(job);
  await act(async () => { render(<App />); });
  fireEvent.click(screen.getByRole('button', { name: /Create vector character/ }));
  expect(screen.queryByLabelText('Style')).toBeNull(); // the picture form's style is not used
  fireEvent.click(screen.getByRole('button', { name: 'Animal' }));
  const describe = screen.getByLabelText('Describe your character') as HTMLTextAreaElement;
  expect(describe.value).toContain('[fox / cat / bear / rabbit]');
  const create = submit();
  expect(create.disabled).toBe(true);
  expect(screen.getByText(/Replace the words in \[brackets\]/)).toBeTruthy();
  fireEvent.change(describe, { target: { value: 'A small fox with orange fur.' } });
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Fox' } });
  expect(create.disabled).toBe(false);
  await act(async () => { fireEvent.click(create); });
  expect(api.startVectorJob).toHaveBeenCalledWith({ description: 'A small fox with orange fur.', name: 'Fox', provider: 'openai', reference: undefined });
  expect(screen.getByRole('heading', { name: 'Creating Fox (vector)' })).toBeTruthy();
});

it('says which key is missing when the drawing model has none', async () => {
  vi.mocked(api.health).mockResolvedValue({ rhubarb: true, gemini: true, imageProviders: ['gemini'], vectorDraw: false, vectorDrawProvider: 'openai' });
  await act(async () => { render(<App />); });
  fireEvent.click(screen.getByRole('button', { name: /Create vector character/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Robot' }));
  fireEvent.change(screen.getByLabelText('Describe your character'), { target: { value: 'A round robot.' } });
  expect(screen.getByText('Add OPENAI_API_KEY to .env to draw vector characters.')).toBeTruthy();
  expect(submit().disabled).toBe(true);
});
