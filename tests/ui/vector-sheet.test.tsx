import { expect, it } from 'vitest';
import { expressionNote } from '../../src/steps/VectorSheet';
import { EXPRESSIONS } from '../../shared/types';

it('says which of the 4 drawn faces each expression shows', () => {
  expect(expressionNote('neutral')).toBe('drawn face');
  expect(expressionNote('surprised')).toBe('drawn face');
  expect(expressionNote('happy')).toBe('shows smile');
  expect(expressionNote('angry')).toBe('shows troubled');
  expect(expressionNote('wink')).toBe('smile, one eye shut');
  expect(expressionNote('sleepy')).toBe('neutral, half-closed eyes');
  for (const x of EXPRESSIONS) expect(expressionNote(x)).not.toMatch(/undefined/);
});
