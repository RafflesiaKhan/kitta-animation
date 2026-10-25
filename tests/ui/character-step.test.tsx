import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { App } from '../../src/App';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('clicking the Milo tile switches the preview starter', () => {
  render(<App />);
  expect(screen.getByTestId('stage').getAttribute('data-starter')).toBe('kit');
  fireEvent.click(screen.getByRole('button', { name: /Milo/ }));
  expect(screen.getByTestId('stage').getAttribute('data-starter')).toBe('milo');
});

it('picking a hair colour updates the preview fill', () => {
  render(<App />);
  fireEvent.change(screen.getByLabelText('Hair colour'), { target: { value: '#ff0000' } });
  const hair = screen.getByTestId('stage').querySelector('[data-part=hair] path')!;
  expect(hair.getAttribute('fill')).toBe('#ff0000');
});

it('shows API upload errors in the Upload tab', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: "Couldn't read this audio file." }), { status: 400 })));
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '2 Voiceover' }));
  const file = new File(['nope'], 'notes.txt', { type: 'text/plain' });
  fireEvent.change(screen.getByLabelText('Upload voiceover'), { target: { files: [file] } });
  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe("Couldn't read this audio file."));
});

it('shows the expression sheet with every expression', () => {
  render(<App />);
  const sheet = screen.getByTestId('expression-sheet');
  expect(sheet.querySelectorAll('svg').length).toBe(11);
  expect(sheet.textContent).toContain('thinking');
});
