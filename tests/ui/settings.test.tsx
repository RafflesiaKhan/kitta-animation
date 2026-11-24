import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Settings } from '../../src/Settings';
import * as api from '../../src/api';

vi.mock('../../src/api');
afterEach(() => { cleanup(); vi.resetAllMocks(); });

const response = {
  settings: {
    OPENAI_API_KEY: { configured: true, source: 'settings' as const, masked: 'sk-…a1b2' },
    OPENAI_TEXT_MODEL: { configured: true, source: 'default' as const, value: 'gpt-5-mini' },
    VECTOR_DRAW_PROVIDER: { configured: true, source: 'default' as const, value: 'openai' },
  },
  models: [{ id: 'gpt-5-mini', provider: 'openai' as const, jobs: ['text' as const], price: { input: 0.25, output: 2 } }],
  auth: { configured: true },
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
  expect(await screen.findByPlaceholderText('sk-…a1b2')).toBeTruthy();
  expect(screen.queryByText(/sk-live/)).toBeNull();
  expect(screen.getByText('From Settings')).toBeTruthy();
});
