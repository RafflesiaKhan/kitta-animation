import { describe, it, expect } from 'vitest';
import { parseSegments, plainText } from '../../server/speech';

describe('parseSegments', () => {
  it('splits at pauses of any form, as silence', () => {
    expect(parseSegments('One [pause] two [pause 1.5s] three [pause 250ms] four <short pause> five <long pause> six [pause 99s]')).toEqual([
      { text: 'One' }, { pauseMs: 500 }, { text: 'two' }, { pauseMs: 1500 }, { text: 'three' }, { pauseMs: 250 },
      { text: 'four' }, { pauseMs: 400 }, { text: 'five' }, { pauseMs: 1000 }, { text: 'six' }, { pauseMs: 10000 },
    ]);
  });

  it('applies a cue until it closes, the next cue or the end of the line', () => {
    expect(parseSegments('Hi [Excited]wow[/excited] then [whisper]a secret [sad]oh no')).toEqual([
      { text: 'Hi' }, { text: 'wow', cue: 'excited' }, { text: 'then' }, { text: 'a secret', cue: 'whisper' }, { text: 'oh no', cue: 'sad' },
    ]);
  });

  it('leaves reaction sounds and unknown tags in the text', () => {
    expect(parseSegments('Ha [laughter] [bogus] ok')).toEqual([{ text: 'Ha [laughter] [bogus] ok' }]);
    expect(plainText('Ha [laughter] <short pause> ok')).toBe('Ha ok');
  });
});
