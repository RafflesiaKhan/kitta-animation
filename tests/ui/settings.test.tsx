import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Settings } from '../../src/Settings';
import * as api from '../../src/api';

vi.mock('../../src/api');
afterEach(() => { cleanup(); vi.resetAllMocks(); });

const response = {
  settings: {
    OPENAI_API_KEY: { configured: true, source: 'settings' as const },
    OPENAI_TEXT_MODEL: { configured: true, source: 'default' as const, value: 'gpt-5-mini' },
    VECTOR_DRAW_PROVIDER: { configured: true, source: 'default' as const, value: 'openai' },
    VOICESTUDIO_URL: { configured: true, source: 'default' as const, value: 'http://localhost:3900' },
  },
  models: { text: { provider: 'openai', model: 'gpt-5-mini' }, voice: { provider: 'openai', model: 'gpt-4o-mini-tts' }, image: { provider: 'openai', model: 'gpt-image-2' }, mouth: { provider: 'openai', model: 'gpt-5-mini' }, vector: { provider: 'openai', model: 'gpt-6.2-astra' } },
  defaults: { voice: 'gemini', image: 'gemini', vector: 'openai' },
  catalog: [{ id: 'gpt-5-mini', provider: 'openai' as const, jobs: ['text' as const], price: { input: 0.25, output: 2 } }],
  auth: { configured: true, authenticated: true },
};

it('asks for an admin password on first run', async () => {
  vi.mocked(api.authStatus).mockResolvedValue({ configured: false, authenticated: false });
  render(<Settings />);
  expect(await screen.findByRole('heading', { name: 'Create an admin password' })).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Admin password'), { target: { value: 'long-enough-password' } });
  vi.mocked(api.setupPassword).mockResolvedValue({ authenticated: true });
  vi.mocked(api.authStatus).mockResolvedValue({ configured: true, authenticated: true });
  vi.mocked(api.getSettings).mockResolvedValue(response);
  fireEvent.click(screen.getByRole('button', { name: 'Create password' }));
  await waitFor(() => expect(api.setupPassword).toHaveBeenCalledWith('long-enough-password'));
});

it('shows masked settings values and never renders the raw key', async () => {
  vi.mocked(api.authStatus).mockResolvedValue({ configured: true, authenticated: true });
  vi.mocked(api.getSettings).mockResolvedValue(response);
  render(<Settings />);
  expect(await screen.findByText('Saved in Kitta')).toBeTruthy();
  expect(screen.queryByText(/sk-live/)).toBeNull();
  expect(screen.getAllByText('Saved in Kitta').length).toBeGreaterThan(0);
});

it('shows built-in defaults and removes a saved model when Not set is chosen', async () => {
  vi.mocked(api.authStatus).mockResolvedValue({ configured: true, authenticated: true });
  vi.mocked(api.getSettings).mockResolvedValue(response);
  vi.mocked(api.usageHistory).mockResolvedValue({ days: [], rows: [], kindRows: [], totals: { calls: 0, input: 0, output: 0, total: 0, unreported: 0, cost: 0, unpriced: 0, estimated: 0 } });
  vi.mocked(api.updateSettings).mockResolvedValue(response);
  render(<Settings />);
  expect(await screen.findByText('Default')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('OpenAI directions / text'), { target: { value: '' } });
  await waitFor(() => expect(api.updateSettings).toHaveBeenCalledWith({ OPENAI_TEXT_MODEL: null }));
});

it('shows a server settings-file error instead of a password form', async () => {
  vi.mocked(api.authStatus).mockRejectedValue(new Error('Settings file is damaged; fix or remove data/settings.json before saving settings.'));
  render(<Settings />);
  expect((await screen.findByRole('alert')).textContent).toContain('Settings file is damaged; fix or remove data/settings.json');
  expect(screen.queryByText('Create an admin password')).toBeNull();
});
