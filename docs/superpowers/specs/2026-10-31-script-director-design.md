# Script director: tagged scripts become an animated timeline

## Why

The Animate step lets you place expressions and actions by hand. The user also wants the opposite: paste a script with
stage directions in it and get a finished, animated video without opening the editor. Their example:

> [expression: warm smile] [action: waves hand gently] Have you ever wondered what happens when a robot starts
> dreaming? [expression: curious, raised eyebrows] Well, let me tell you a little story. … Why do humans dream?
> [action: pauses for two seconds] [expression: curious] One night, Milo decided …

The directions are free wording, not our fixed names. An AI model (Gemini or OpenAI) reads them and picks from what the
character can do; fixed code plays the result. The AI decides *what*, the renderer decides *how* (agreed in chat; no
code generation at run time).

## Goals

- `[expression: …]` and `[action: …]` tags in script text, with any wording inside. Only these two prefixes; the existing
  voice cues (`[whisper]`, `[excited]`, `[pause 1s]` …) keep their meaning.
- Tags are never spoken.
- **Paste script** in the Write-script tab: a box for a whole script. It is split into script lines at sentence ends,
  each line at most 500 characters and at most 50 lines (the existing limits); tags stay with the words that follow them.
  Every line gets the voice currently chosen. Tags typed straight into a line's text work too.
- Generating the voice resolves the tags into timeline marks (the Animate step's `Timeline.marks`), so the preview and
  export are animated at once and the Animate step shows the marks for fine-tuning.
- **Timing**: a tag before a line's first word starts at the line's start (exact: every line is voiced separately). A tag
  inside a line is placed by how far into the line's spoken text it sits (characters before it ÷ all spoken characters,
  across the line's span). A tag at the very end of a line belongs to the next line's start.
- **Matching wording to the character** (the director):
  - Expressions map to the 11 we have (e.g. "warm smile" → happy, "curious, raised eyebrows" → thinking,
    "delighted" → excited, "sincere and thoughtful" → thinking).
  - Actions map to the 8 we have (waves → wave, points → point, opens hands → explain, spreads arms → celebrate,
    tilts head → think) or to **none** when nothing fits (leans forward, hand over heart, looks at the audience). None
    means the natural talking motion carries on; CMU motion clips will fill these later.
  - Pause actions ("pauses for two seconds", "pauses briefly") become real silence: the given length ("2 seconds",
    "two seconds", "1.5s", "500 ms"), else 0.5 s, at most 10 s (the existing pause limit). Spotted by the word "pause",
    without AI, because the silence has to exist before the voice is made.
  - Gemini when its key is set, else an OpenAI text model, else a built-in keyword list (works offline, coarser).
  - The same wording is resolved once per request (the example repeats "curious").
- An action is a clip of `ACTION_MS` (2 s) from its tag, cut short by the next action or the end of the audio, as in the
  Animate step. An expression holds until the next one.
- Scripts without tags behave exactly as today (marks absent; per-line pickers drive it).

## Non-goals

- New actions or the CMU motion library (next project).
- Word-exact timing inside a line (estimated by position, see above).
- Directions other than expression, action and pause (camera, scene, props).

## Decisions

- When a script has any director tag, the timeline's marks come from the tags only (neutral at 0 until the first
  expression tag); the lines' own expression/gesture pickers are ignored for that audio. Mixing both would let a
  line's default "neutral" cut off an expression a tag set a line earlier. (Builder's call.)
- The director runs on the server inside `/api/tts`, after the voice is made, so it uses the real line spans.
  If the director's AI call fails, the keyword list is used instead of failing the whole generation, and the result says
  so ("Matched directions with the built-in list").
- Pause actions are turned into `[pause Ns]` before speaking, so the existing segmenting makes the silence.
- New env var `OPENAI_TEXT_MODEL` (default `gpt-5-mini`, like the vision model).
