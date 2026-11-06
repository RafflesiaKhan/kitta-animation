import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Projects } from '../../src/Projects';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('creates and reopens a project, imports media, and opens its saved episode', async () => {
  const asset = { id: 'image', kind: 'image', name: 'frame.png', mime: 'image/png' };
  const projectScene = { id: 'scene' };
  const episode = { id: 'e', title: 'Pilot' };
  const project = { id: 'p', name: 'First series', premise: 'A market mystery', style: 'svg', assets: [], episodes: [] };
  const populated = { ...project, assets: [asset], episodes: [{ ...episode, projectScene }] };
  const scene = { title: 'The Missing Mango', audioId: 'audio', durationMs: 100, background: '', actors: [], shots: [{ startMs: 0, name: 'Wide', zoom: 1, focusX: 0.5, focusY: 0.5 }] };
  const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => [] })
    .mockResolvedValueOnce({ ok: true, json: async () => project })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ ...project, assets: [asset] }) })
    .mockResolvedValueOnce({ ok: true, json: async () => episode })
    .mockResolvedValueOnce({ ok: true, json: async () => projectScene })
    .mockRejectedValueOnce(new Error('Network down'))
    .mockResolvedValueOnce({ ok: true, json: async () => [populated] })
    .mockResolvedValueOnce({ ok: true, json: async () => populated })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ scene, audioUrl: '/api/projects/p/assets/audio' }) });
  vi.stubGlobal('fetch', fetch);
  const view = render(<Projects />);
  expect(screen.getByRole('link', { name: 'Character Studio' }).getAttribute('href')).toBe('/?character-studio');
  fireEvent.change(screen.getByLabelText('Project name'), { target: { value: project.name } });
  fireEvent.change(screen.getByLabelText('Series premise'), { target: { value: project.premise } });
  await waitFor(() => expect((screen.getByRole('button', { name: 'Create project' }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
  await screen.findByRole('heading', { name: project.name });
  fireEvent.click(screen.getByRole('button', { name: 'Assets' }));
  const file = new File(['fixture'], 'frame.png', { type: 'image/png' });
  const input = screen.getByLabelText('Image, SVG or audio');
  fireEvent.change(input, { target: { files: [file] } });
  fireEvent.submit(input.closest('form')!);
  await screen.findByRole('link', { name: asset.name });
  expect(fetch.mock.calls[2][0]).toBe('/api/projects/p/assets');
  fireEvent.click(screen.getByRole('button', { name: 'Episodes' }));
  fireEvent.change(screen.getByLabelText('Episode title'), { target: { value: 'Pilot' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create episode' }));
  fireEvent.click(await screen.findByRole('button', { name: /Pilot.*Open episode/ }));
  const save = screen.getByRole('button', { name: 'Save first scene' }) as HTMLButtonElement;
  await waitFor(() => expect(save.disabled).toBe(false));
  fireEvent.click(save);
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Back to episodes' }));
  expect(screen.getByRole('button', { name: /Pilot.*Saved scene/ })).toBeTruthy();
  view.unmount();
  const reopened = render(<Projects />);
  fireEvent.click(await screen.findByRole('button', { name: /First series/ }));
  await screen.findByRole('heading', { name: project.name });
  fireEvent.click(screen.getByRole('button', { name: 'Assets' }));
  expect(screen.getByRole('link', { name: asset.name })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Episodes' }));
  fireEvent.click(screen.getByRole('button', { name: /Pilot.*Saved scene/ }));
  await screen.findByText(scene.title);
  expect(reopened.container.querySelector('audio')?.getAttribute('src')).toBe('/api/projects/p/assets/audio');
});
