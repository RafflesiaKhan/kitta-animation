import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { UsagePanel } from '../../src/UsagePanel';
import * as api from '../../src/api';
import type { UsageReport } from '../../shared/usage';

vi.mock('../../src/api');
afterEach(() => { cleanup(); vi.resetAllMocks(); });

const report = (total: number): UsageReport => ({
  since: '2026-10-25T10:00:00.000Z',
  session: { calls: 2, input: 300, output: total - 300, total, unreported: 1 },
  sessionRows: [
    { provider: 'gemini', model: 'gemini-3.8-flash-tts', calls: 1, input: 300, output: total - 300, total, unreported: 0 },
    { provider: 'openai', model: 'gpt-4o-mini-tts', calls: 1, input: 0, output: 0, total: 0, unreported: 1 },
  ],
  allTime: { calls: 9, input: 1000, output: 41000, total: 42000, unreported: 1 },
  allTimeRows: [],
  recent: [{ at: '2026-10-25T10:01:00.000Z', provider: 'gemini', model: 'gemini-3.8-flash-tts', kind: 'voice', input: 300, output: total - 300, total }],
});

it('shows the session total and refreshes when a job ends', async () => {
  vi.mocked(api.usage).mockResolvedValueOnce(report(1500)).mockResolvedValue(report(12500));
  const { rerender } = render(<UsagePanel refreshKey={false} />);
  expect(await screen.findByRole('button', { name: /1\.5k tokens/ })).toBeTruthy();
  await act(async () => { rerender(<UsagePanel refreshKey={true} />); });
  expect(screen.getByRole('button', { name: /13k tokens/ })).toBeTruthy();
});

it('opens a per-model breakdown, marking providers that report no tokens', async () => {
  vi.mocked(api.usage).mockResolvedValue(report(1500));
  render(<UsagePanel refreshKey={false} />);
  fireEvent.click(await screen.findByRole('button', { name: /tokens/ }));
  const panel = await screen.findByRole('dialog', { name: 'AI usage' });
  expect(panel.textContent).toContain('This session: 1.5k tokens · 2 calls');
  expect(panel.textContent).toContain('All time: 42k tokens · 9 calls');
  expect(panel.textContent).toContain('gemini-3.8-flash-tts');
  expect(panel.textContent).toContain('n/a'); // OpenAI speech
});
