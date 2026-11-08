# Step 4: A talking scene

Read `version 2 planning/codex-prompts/shared-rules.md` and follow it, including the subagent stages. Then read `version 2 planning/codex-reports/step-3.md`, `step-3-fixes.md`, and `step-3-fixes-2.md` in the same folder.

This step combines what used to be steps 4, 5a, and 5b, so it's bigger than earlier steps. Plan it as several tasks, each committed and reviewed separately, in the order below.

## Goal

A creator writes an episode's lines, picks voices, places several characters on a set, and gets a scene with lip sync, poses, and camera cuts. The scene is built entirely in the app, and the preview matches the export.

## Scene code: already decided

The owner confirmed what "Kitta writes the code for each scene" means in the SVG style: everything is drawn by code. That covers the rig, lip sync from Rhubarb, gestures and idle movement, and SVG backgrounds. This already works, so there's nothing new to build for it.

Nothing generated at run time is ever executed. When the Director arrives in step 5, it will write scene data in the format this step saves, and it may draw SVG sets that pass the step 3 sanitizer. Design the scene record so a draft can be validated before saving.

## Task 1: one scene record

Today an episode holds either the step 1 sample format (`ProjectScene`) or step 3's one-character shot (`EpisodeScene`).

- Replace both with one record that holds a cast with placement, script lines with speakers, the audio, shots, and performance marks.
- Keep reading both older shapes, so saved episodes still open and render. The step 1 sample's render must stay hash-identical.
- Character and set stay project assets that the record refers to, as in step 3. Changing one episode must never change another.

## Task 2: script and voices

- Save an episode's lines. Choose **narration** or **dialogue**:
  - **Narration:** a narrator carries the story and characters act silently, with no mouth cues.
  - **Dialogue:** each line has a speaking character, a voice, and mouth cues.
- Voices come from the character's default voice, with an override per episode. VoiceStudio generates speech through the existing `speakLine`.
- Generate audio with `concatWithGaps` and `runRhubarb`, and split cues by speaker through `resolveScene` in `shared/scene.ts`. Keep narration audio separate, so no mouth moves.
- Reuse the Voiceover step's per-line controls and paste-script parsing from `src/steps/VoiceoverStep.tsx` and `shared/direction.ts`. Don't copy them. `[expression: …]` and `[action: …]` tags should keep working.
- An imported audio file should also work as a scene's dialogue, as step 1 did.

Watch for:
- Regenerating one line mustn't leave cues or marks from old audio behind. Decide what happens to hand-placed marks when audio changes, and record it.
- VoiceStudio being down must give a clear error and save nothing half-finished.
- VoiceStudio's default voice invents a new person per line unless a speaker is set. Two characters must keep distinct, steady voices across a whole episode.

## Task 3: scene editor

- Place several characters on a set: position, scale, flip, and stage ground, using step 3's anchor. A new character's default must not show where its body ends.
- Choose each character's expressions and gestures over time. Use `src/steps/AnimateStep.tsx` as the timeline, adapted to a chosen character. Don't write a second timeline.
- Add, move, and remove shots tied to a line and a position within it, as in `shared/scene.ts`. Each shot has a camera with zoom and focus. Wide, two-shot, speaker, and reaction presets fill in those numbers, which stay editable.
- Add listener reactions.
- The preview plays with the audio, or with a play button for a silent scene. It must not open frozen at time 0 before a gesture has started.

Carry over from earlier reviews:
- `renderScene`'s frame-skip key copies `SceneView`'s time-dependent inputs by hand. If you add an input, update the key and add a comment saying they must match, or a frame will freeze with no failing test.
- The preview is fixed at 960 wide and overflows narrow windows. Make the editor's preview fit its space.

## Test with real inputs

Two misses in step 3 came from tidy test inputs. Use real ones here as well:
- At least one real VoiceStudio exchange of four or more lines with two characters.
- A real imported WAV.
- Max in an `ai` project, as well as SVG characters.

Tests themselves still use mocks, as the shared rules say.

## Not in this step

The Director and Settings (step 5), transitions and episode export (step 6), props, new motions, and other voice providers.

## Acceptance

1. Rebuild `samples/first-scene` through the UI: two characters, one set, a wide shot, a speaker shot, and a listener reaction. It plays like the hardcoded version. Compare preview and an exported frame at every shot.
2. In dialogue mode with real VoiceStudio voices, the intended voice is on each line and only the active speaker's mouth moves. The two characters don't blink or sway together.
3. In narration mode, no character's mouth moves, and the characters still blink and sway.
4. Override a character's voice in one episode, and confirm its other episodes don't change.
5. Build a scene with Max in an `ai` project, reopen it, and export. The preview matches the export.
6. Reopen the project, and everything plays the same without generating voices again.
7. Stop VoiceStudio and generate. The error is clear, and the saved episode is unchanged.
8. Episodes saved in steps 2 and 3 still open. The step 1 sample render still matches its frame hashes.
9. A shot's camera can't show anything outside the set.
10. Today's four-step flow still works, including an export.

Write the report as `version 2 planning/codex-reports/step-4.md`.
