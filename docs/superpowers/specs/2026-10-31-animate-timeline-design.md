# Animate step: a trigger timeline for expressions and actions

## Why

Today each script line has exactly one expression and one gesture, set in the Voiceover step. The gesture is stretched over the
whole line and the expression holds for the whole line, so a long line plays one act from start to end. The user wants an
editor like the Perform view of Adobe Character Animator: once the audio is in and the character is talking, drag
expressions and actions onto a timeline under the audio, at any moment, and the video follows.

## Goals

- A new step **3 Animate** between Voiceover and Export (Export becomes step 4).
- Layout (approved mockup): the character preview with play/pause on the left, a palette of expressions and actions on the
  right, and a full-width timeline under both. The timeline has four rows:
  1. **Script**: read-only blocks showing which line is spoken when (empty for an upload with no transcription).
  2. **Audio**: the waveform of the voiceover.
  3. **Expression**: a run of blocks; each expression lasts until the next one starts.
  4. **Actions**: short clips that play once where they are placed.
- A playhead that follows playback. Clicking the timeline (outside a block) moves the playhead there.
- Dragging an expression from the palette onto the Expression row starts that expression at the drop point; the block
  it lands in is split. Dragging an action onto the Actions row places a clip starting at the drop point.
- Placed items can be selected, dragged along the row, and deleted (× button on the selected item, or the Delete/Backspace
  key). Action clips can also be stretched from their right edge.
- Clicking a palette item (instead of dragging) adds it at the playhead, so it also works by keyboard.
- The timeline starts from what the Voiceover step already chose: one expression block per line and one action clip
  per line that has a gesture. The user adjusts from there.
- The preview and the exported video both play exactly what is placed. The automatic talking motion (nods, beats, blinks,
  sway, glances) is unchanged and keeps running underneath.

## Non-goals

- Zooming or scrolling the timeline; it always fits the whole audio (up to 3 minutes) into its width.
- Undo/redo.
- Editing words, audio or lip-sync timing in this step.
- New expressions or actions; the palette is the existing set (11 expressions; wave, nod, look down, celebrate, shrug,
  think, point, explain).
- Saving projects to disk; like everything else, the timeline lives in memory for the session.

## Anti-goals

- The export must never differ from the preview.
- Existing behaviour must not change for someone who never opens the Animate step.

## Design decisions

- **Data.** `Timeline` gets an optional `marks: { expressions: ExpressionMark[]; actions: ActionMark[] }` with
  `ExpressionMark = { startMs; expression }` (sorted, holds until the next) and
  `ActionMark = { startMs; endMs; gesture }` (sorted by start, never overlapping). Lines stay as they are: they still
  hold the text and timing and keep feeding the script row and the idle glance.
- **Who drives the animation.** `frameAt` uses `marks` when present, otherwise the lines exactly as today. A pure helper
  `marksFromLines(lines)` builds the starting marks (neutral from 0, then each line's expression from its start; each
  line's gesture as a clip spanning that line), so the video looks exactly as it does today until the user edits; the Animate step shows that until the first edit, which saves
  `marks` into the timeline. New audio (generate or upload) makes a fresh timeline without marks, so it starts over from
  the new lines.
- **Expression transitions** keep today's 250 ms morph from the previous expression mark.
- **Action progress** runs 0→1 over the clip, the same way it runs over a line today, so every gesture animation and
  AI-character pose works unchanged. A new clip is 2 s long (cut short by the next clip or the end of the audio); the
  shortest a clip can be stretched or squeezed to is 0.5 s.
- **Moving** an expression block moves its start between its neighbours' starts. The first block always starts at 0
  and can't be moved or deleted (the character always has some expression). Moving an action clip keeps its length
  and stops at its neighbours and at the ends of the audio.
- **Voiceover step after hand animation** (builder's call): once `marks` exist, per-line expression/gesture pickers in the
  Voiceover step no longer change the video. They show a hint "Animated in the Animate step" instead of silently doing
  nothing. Auto-tag/Add expressions/regenerate make new lines; Add expressions on an upload keeps the same audio, so it
  clears `marks` and the timeline starts again from the new tags (it replaced every tag anyway).
- **Palette icons** are the user's own character drawn small with `CharacterView` (the expression, or the action at
  mid-progress), not generic emoji. An AI character missing a pose falls back to neutral as it does in playback.
- **Waveform** is drawn in the browser: fetch `/api/audio/:id`, decode with Web Audio, reduce to one peak per pixel
  column, draw on a canvas. No server change. If decoding fails, the row shows a flat bar and everything else works.
- **Clock.** The preview's `<audio>` element stays the one clock. `Preview` accepts the audio element ref from App so the
  timeline can read `currentTime` for the playhead and set it to seek.
- **Export** sends `marks` along; `validateExport` accepts and checks them (known names, numbers, sorted, inside the
  audio).

## Left to the builder

Exact styling (use the existing tokens in `src/styles.css`), how the Animate layout reuses `main`'s grid, the drag
mechanics (HTML5 drag-and-drop from the palette, pointer events for moving/resizing on the rows), and test layout.
