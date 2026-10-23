import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ExportStep } from '../../src/steps/ExportStep';
import * as api from '../../src/api';
import { STARTERS } from '../../shared/character/starters';

vi.mock('../../src/api');
afterEach(() => { cleanup(); vi.resetAllMocks(); });

const { name: _n, ...character } = STARTERS.kit;
const timeline = { durationMs: 1000, cues: [], lines: [] };
const button = () => screen.getByRole('button', { name: 'Export video' }) as HTMLButtonElement;

it('disables export without a timeline', () => {
  render(<ExportStep character={character} timeline={null} audioId={null} />);
  expect(button().disabled).toBe(true);
  expect(screen.getByText('Add a voiceover first')).toBeTruthy();
});

it('shows progress then a download link', async () => {
  let finish!: (url: string) => void;
  vi.mocked(api.exportVideo).mockImplementation((_b, onProgress) => {
    onProgress(0.5);
    return new Promise((r) => { finish = r; });
  });
  render(<ExportStep character={character} timeline={timeline} audioId="abc" />);
  fireEvent.click(screen.getByLabelText('Transparent background (WebM)'));
  fireEvent.click(screen.getByRole('button', { name: 'Vertical 9:16' }));
  fireEvent.click(button());
  expect(api.exportVideo).toHaveBeenCalledWith({ character, timeline, audioId: 'abc', format: { aspect: '9:16', transparent: true } }, expect.any(Function));
  expect(screen.getByRole('progressbar', { name: 'Export progress' }).getAttribute('value')).toBe('50');
  expect(screen.getByText('50%')).toBeTruthy();
  await act(async () => { finish('/api/exports/x.webm'); });
  expect(screen.getByRole('link', { name: '⬇ Download video' }).getAttribute('href')).toBe('/api/exports/x.webm');
  expect(screen.queryByRole('progressbar')).toBeNull();
});

it('shows an export error verbatim', async () => {
  vi.mocked(api.exportVideo).mockRejectedValue(new Error('Export failed. Please try again.'));
  render(<ExportStep character={character} timeline={timeline} audioId="abc" />);
  fireEvent.click(button());
  expect((await screen.findByRole('alert')).textContent).toBe('Export failed. Please try again.');
});
