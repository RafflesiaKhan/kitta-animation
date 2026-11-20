import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { UsagePanel } from '../../src/UsagePanel';
import * as api from '../../src/api';
import type { UsageReport } from '../../shared/usage';

vi.mock('../../src/api');
afterEach(() => { cleanup(); vi.resetAllMocks(); });

const report = (total: number): UsageReport => ({
  since: '2026-10-25T10:00:00.000Z',
  session: { calls: 2, input: 300, output: total - 300, total, unreported: 1, cost: 0.0123, unpriced: 1, estimated: 0 },
  sessionRows: [
    { provider: 'gemini', model: 'gemini-3.8-flash-tts', calls: 1, input: 300, output: total - 300, total, unreported: 0, cost: 0.0123, unpriced: 0, estimated: 0 },
    { provider: 'openai', model: 'gpt-4o-mini-tts', calls: 1, input: 0, output: 0, total: 0, unreported: 1, cost: 0, unpriced: 1, estimated: 0 },
  ],
  allTime: { calls: 9, input: 1000, output: 41000, total: 42000, unreported: 1, cost: 2.5, unpriced: 1, estimated: 3 },
  allTimeRows: [],
  recent: [{ at: '2026-10-25T10:01:00.000Z', provider: 'gemini', model: 'gemini-3.8-flash-tts', kind: 'voice', input: 300, output: total - 300, total, cost: 0.0123 }],
});

it('shows the session total and refreshes when a job ends', async () => {
  vi.mocked(api.usage).mockResolvedValueOnce(report(1500)).mockResolvedValue(report(12500));
  const { rerender } = render(<UsagePanel refreshKey={false} />);
  expect(await screen.findByRole('button', { name: /1\.5k tokens · \$0\.01/ })).toBeTruthy();
  await act(async () => { rerender(<UsagePanel refreshKey={true} />); });
  expect(screen.getByRole('button', { name: /13k tokens/ })).toBeTruthy();
});

it('opens a per-model breakdown, marking providers that report no tokens', async () => {
  vi.mocked(api.usage).mockResolvedValue(report(1500));
  render(<UsagePanel refreshKey={false} />);
  fireEvent.click(await screen.findByRole('button', { name: /tokens/ }));
  const panel = await screen.findByRole('dialog', { name: 'AI usage' });
  expect(panel.textContent).toContain('This session: 1.5k tokens · $0.01 · 2 calls');
  expect(panel.textContent).toContain('All time: 42k tokens · ≈$2.50 · 9 calls'); // some calls priced from old ledger lines
  expect(panel.textContent).toContain('gemini-3.8-flash-tts');
  expect(panel.textContent).toContain('n/a'); // OpenAI speech
});
