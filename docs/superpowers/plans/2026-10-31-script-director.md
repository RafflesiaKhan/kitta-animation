# Script Director Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `[expression: …]` / `[action: …]` tags in a script become timeline marks when the voice is generated.

**Architecture:** Pure parsing, timing and keyword matching live in `shared/direction.ts`. The server prepares each line (tags out, pause actions in as `[pause Ns]`), voices it as today, asks the director (Gemini → OpenAI → keywords) to match each distinct wording, and returns `marks` with the timeline. The client adds a Paste-script box that splits a script into lines.

**Tech Stack:** TypeScript, Express, @google/genai, OpenAI REST (fetch), React, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-31-script-director-design.md`

## Global Constraints

- Only `[expression: …]` and `[action: …]` (case-insensitive) are director tags; other brackets keep today's meaning.
- Line limits stay 500 characters and 50 lines.
- Pause: given length, else 500 ms, at most 10 000 ms.
- `OPENAI_TEXT_MODEL` defaults to `gpt-5-mini`.
- No tags → response has no `marks`, behaviour unchanged.

## Review Focus

1. A pause tag with a number word ("two seconds") → 2000 ms of silence, not read aloud.
2. A tag at the end of the last line → placed at that line's end, not dropped and not past the audio.
3. Two actions so close there is no room → the second is skipped, generation still succeeds.
4. The AI call fails (rate limit, no key) → keyword matching is used, voice still returned, `directedBy: 'keywords'`.
5. A script over 50 sentences → merged into at most 50 lines, none over 500 characters.

---

### Task 1: `shared/direction.ts`

**Interfaces — produces:**
- `type DirectionKind = 'expression' | 'action'`; `interface Direction { kind: DirectionKind; phrase: string }`
- `interface Placed extends Direction { at: number }` (0..1 through the line's spoken text)
- `pauseMsOf(phrase: string): number | null` (null when not a pause)
- `prepareLine(text: string): { spoken: string; tags: Placed[] }` — pause actions become `[pause Ns]` in `spoken`, other director tags are removed; `at` = spoken characters (per `plainText` rules) before the tag ÷ all spoken characters (1 when none follow).
- `splitScript(text: string): string[]` — sentences; tags after a sentence end go with the next; merged so ≤ 50 lines; none > 500 chars.
- `type Match = Expression | ActionMark['gesture'] | null` (null = no fitting one)
- `keywordMatch(d: Direction): Match`
- `marksFromDirections(lines: { startMs: number; endMs: number; tags: Placed[] }[], matches: Map<string, Match>, durationMs: number): Marks` — key `${kind}:${phrase.toLowerCase()}`.

- [ ] Tests in `tests/shared/direction.test.ts` (the user's example sentences): pause parsing (`two seconds`→2000, `1.5s`→1500, `briefly`→500, `20 seconds`→10000, `waves`→null); `prepareLine` strips tags, keeps `[whisper]`, inserts `[pause 2s]`, `at` of a leading tag 0 and a middle tag ≈ its position; `splitScript` on the example → 14 lines each starting with its tags; 60 short sentences → 50 lines; keyword matches from the spec's table; `marksFromDirections` timing (leading tag at line start, middle by fraction, trailing tag → next line start / last line end), action clips via `addAction`, null matches skipped.
- [ ] Implement; `npx vitest run tests/shared/direction.test.ts` passes; commit.

### Task 2: Director on the server

**Files:** `server/gemini.ts` (`direct(ds: Direction[]): Promise<Match[]>`), `server/openai.ts` (same), `server/director.ts` (`directAll(ds): Promise<{ matches: Map<string, Match>; by: 'gemini' | 'openai' | 'keywords' }>`: dedupe, Gemini if key, else OpenAI if key, else keywords; on AI error → keywords), `server/index.ts` `/api/tts` (prepare lines, speak `spoken`, return `lines[i].text = spoken`, `marks` and `directedBy` when any tag), `shared/usage.ts` kind `direct`.

- [ ] Tests in `tests/server/api-tts.test.ts` (existing mocks): tagged script → `marks` with the expected expression and clip; tags never reach the speak mock; pause tag → longer audio; director failure → `directedBy: 'keywords'`; untagged → no `marks`.
- [ ] Implement; tests pass; commit.

### Task 3: Client

**Files:** `src/api.ts` (`tts` returns `marks?`, `directedBy?`), `src/App.tsx` (keep `marks` in the timeline; notice when keywords were used), `src/steps/VoiceoverStep.tsx` (Paste script box: textarea + "Use this script" → `splitScript` lines with the current voice), README.

- [ ] Tests in `tests/ui/script-tab.test.tsx`: pasting the example makes 14 line cards; generate passes `marks` into the timeline.
- [ ] Implement; full suite + `tsc` pass; verify in the browser; commit.
