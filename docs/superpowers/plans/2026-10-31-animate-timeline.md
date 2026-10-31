# Animate Step Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new "3 Animate" step where expressions and actions are dragged onto a timeline under the voiceover, driving both preview and export.

**Architecture:** `Timeline` gains optional `marks` (expression marks that hold, action clips that play once). A pure module `shared/marks.ts` derives marks from lines and does every edit; `frameAt` reads marks (derived from lines when absent), so preview and export share one path. The UI is a palette plus a four-row track editor that reads/seeks the preview's `<audio>` clock.

**Tech Stack:** React 18, TypeScript, Vitest + Testing Library (jsdom), Express server, Web Audio for the waveform.

**Spec:** `docs/superpowers/specs/2026-10-31-animate-timeline-design.md`

## Global Constraints

- Steps read `1 Character`, `2 Voiceover`, `3 Animate`, `4 Export`.
- New action clip: 2000 ms (cut short by the next clip / end of audio). Minimum clip length: 500 ms.
- Expression morph stays `TRANSITION_MS` (250 ms).
- First expression mark is always at 0 and cannot be moved or deleted.
- Action clips are sorted and never overlap.
- Without `marks`, behaviour (preview, export, tests) is identical to today.
- No new dependencies. Styling uses the tokens in `src/styles.css`.

## Review Focus

1. Dropping an action where there is less than 500 ms of free space → nothing is added (no zero-length or overlapping clip).
2. Dragging an expression block past a neighbour → it stops just short of it (order kept, starts stay unique).
3. Very short audio (< 2 s) → a dropped action is cut to the audio's end, and it still validates for export.
4. Export with hand-edited marks → the server accepts them; malformed marks (unknown name, unsorted, overlapping, outside the audio) → 400.
5. "Add expressions" on an upload after hand editing → marks are cleared, timeline starts from the new tags.

---

### Task 1: Marks model, edits and frameAt

**Files:**
- Modify: `shared/types.ts` (types)
- Create: `shared/marks.ts`
- Modify: `shared/timeline.ts` (`frameAt`)
- Test: `tests/shared/marks.test.ts`, `tests/shared/timeline.test.ts`

**Interfaces — produces:**
- `types.ts`: `ExpressionMark { startMs: number; expression: Expression }`, `ActionMark { startMs: number; endMs: number; gesture: Exclude<Gesture, 'none'> }`, `Marks { expressions: ExpressionMark[]; actions: ActionMark[] }`, `Timeline.marks?: Marks`.
- `marks.ts`: `ACTION_MS = 2000`, `MIN_ACTION_MS = 500`,
  `marksFromLines(lines: Line[]): Marks`, `marksOf(t: Timeline): Marks` (t.marks ?? derived, cached per timeline in a WeakMap),
  `addExpression(m, ms, expression): Marks`, `moveExpression(m, i, ms): Marks`, `removeExpression(m, i): Marks`,
  `addAction(m, ms, gesture, durationMs): Marks | null` (null = no room), `moveAction(m, i, ms, durationMs): Marks`,
  `resizeAction(m, i, endMs, durationMs): Marks`, `removeAction(m, i): Marks`. All pure, return new objects.

- [x] **Step 1: Write failing tests** in `tests/shared/marks.test.ts`:
  - `marksFromLines` on the two lines of `timeline.test.ts` → expressions `[{0,neutral},{100,happy},{2000,sad}]`, actions `[{100,1000,wave},{2000,3000,nod}]`; a first line at 0 gives no extra neutral mark; `gesture: 'none'` lines give no action.
  - `addExpression` at 1500 → inserted sorted; at an existing start → replaces that mark's expression.
  - `moveExpression(m, 1, 5000)` with next at 2000 → clamped to 1999; `moveExpression(m, 0, …)` and `removeExpression(m, 0)` → unchanged.
  - `addAction` into free space → 2000 ms clip; next clip 800 ms away → cut to 800; < 500 ms room or inside a clip → `null`; near the end of a 1200 ms audio → ends at 1200.
  - `moveAction` keeps length and clamps between neighbours and `[0, durationMs]`; `resizeAction` clamps to `[start+500, next start or durationMs]`.
- [x] **Step 2:** Run `npx vitest run tests/shared/marks.test.ts` → FAIL (module missing).
- [x] **Step 3:** Implement types and `shared/marks.ts`.
- [x] **Step 4:** Add to `tests/shared/timeline.test.ts`:
  - For every ms in 0..4000 step 50, `frameAt(t)` equals `frameAt({...t, marks: marksFromLines(t.lines)})` (no-change guarantee).
  - With marks `expressions [{0,neutral},{500,angry}]`, `actions [{1000,3000,shrug}]` on the same lines: at 600 expression `angry` from `neutral`; at 2000 gesture `shrug`, progress 0.5; at 3500 gesture `none`.
- [x] **Step 5:** Change `frameAt`: expression/fromExpression/blend from `marksOf(t).expressions`, gesture/progress from the action containing `ms`. Glance stays on lines.
- [x] **Step 6:** `npx vitest run` → all pass.
- [x] **Step 7:** Commit `feat: expression and action marks drive the animation`.

### Task 2: Export accepts marks

**Files:** Modify `server/validate.ts`; Test `tests/server/api-export.test.ts`.

- [x] **Step 1: Failing tests:** valid marks → 200/streaming as today; each of: unknown expression, gesture `'none'` or unknown, unsorted expressions, first expression not at 0, overlapping actions, `endMs <= startMs`, action ending after `durationMs` → 400.
- [x] **Step 2:** Run → new rejection tests FAIL.
- [x] **Step 3:** `validateExport` checks `timeline.marks` when present (shape as in Task 1).
- [x] **Step 4:** Run → PASS. Commit `feat: export validates animation marks`.

### Task 3: Animate step

**Files:**
- Create: `src/steps/AnimateStep.tsx` (palette + track editor), `src/waveform.ts`
- Modify: `src/Preview.tsx` (optional `audioRef?: React.RefObject<HTMLAudioElement>` prop, used instead of its own ref when given), `src/App.tsx` (4 steps, Animate layout, `setMarks`, clear marks in `addExpressions`), `src/steps/VoiceoverStep.tsx` (hint), `src/styles.css`
- Test: `tests/ui/animate-step.test.tsx`, `tests/ui/upload.test.tsx`

**Interfaces:**
- `AnimateStep({ character: AnyCharacter; timeline: Timeline | null; audioUrl: string | null; audioRef: RefObject<HTMLAudioElement>; onMarks: (m: Marks) => void })`.
- `peaks(url: string, columns: number): Promise<number[]>` in `src/waveform.ts` (0..1 per column; rejects if Web Audio is unavailable).
- `VoiceoverStep` new prop `handAnimated: boolean`.

Behaviour (spec "Goals"): palette buttons (`aria-label` = name, e.g. `happy`, `wave`) are draggable (`dataTransfer` `text/plain` = `expression:happy` / `action:wave`) and add at the playhead on click; rows `data-testid="row-script|row-audio|row-expression|row-actions"`; blocks are buttons (`aria-label` like `happy at 0:01.5`), selectable, pointer-draggable, Delete/Backspace or × removes the selected one; action clips have a right-edge resize handle; clicking empty row space seeks; playhead follows `audio.currentTime` via rAF. Waveform failure → flat bar. With no timeline: "Add a voiceover first".

- [x] **Step 1: Failing UI tests** (`tests/ui/animate-step.test.tsx`, timeline from `timeline.test.ts`, mocked `fetch`):
  - Renders one expression block per derived mark and one clip per derived action; script row shows line texts.
  - Clicking palette `angry` with `audio.currentTime = 1.5` → `onMarks` called with an expression mark at 1500.
  - Clicking `shrug` at 1.5 s → `onMarks` with action `{1500, 2000, shrug}` (cut at next clip 2000).
  - Selecting the `sad` block and pressing Delete → `onMarks` without it; the first block has no delete.
  - Drop event on the Actions row with `action:point` at a clientX mapping to 3500 ms (row width stubbed via `getBoundingClientRect`) → `onMarks` with a clip starting at 3500, ending 4000.
  - No timeline → "Add a voiceover first".
- [x] **Step 2:** Run → FAIL.
- [x] **Step 3:** Implement `waveform.ts`, `AnimateStep.tsx`, Preview `audioRef`, App wiring (Animate layout: Preview + palette side by side, timeline full width below), styles.
- [x] **Step 4:** Upload hint test in `tests/ui/upload.test.tsx`: with `handAnimated` the upload lines show "Animated in the Animate step"; App `addExpressions` result has no `marks` (unit-test `withTaggedLines` clears marks).
- [x] **Step 5:** `npx vitest run` and `npx tsc --noEmit -p .` → pass. Commit `feat: Animate step with a drag-and-drop trigger timeline`.

### Task 4: Verify in the browser

- [x] Run the dev server via preview, upload `tests/fixtures/hello.wav`, open Animate: drag an expression and an action, play, confirm the preview changes; export and confirm it completes. Screenshot. Update README "How to use".
