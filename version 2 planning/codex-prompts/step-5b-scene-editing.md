# Step 5b: Scene editing

Read `version 2 planning/codex-prompts/shared-rules.md` and follow it, including the subagent stages. Then read `version 2 planning/codex-reports/step-4.md` and `version 2 planning/scene-code-proposal.md`.

**Check the "Owner's decision" heading in the proposal first.** If it's empty, stop and tell the owner. Build generated scene code only as far as that decision says.

## Goal

A creator can build the first scene by hand in the app and get the same result as the hardcoded sample.

## Build

- Place the cast on a set: position, scale, and flip.
- Choose each character's expressions and gestures per shot. Use `src/steps/AnimateStep.tsx` as the editor for a shot's performance, adapted to a chosen character. Don't write a second timeline.
- Add, move, and remove shots, tied to a line and a position within it, as in `shared/scene.ts`. Each shot has a camera with zoom and focus. Offer wide, two-shot, speaker, and reaction presets that fill in those numbers, which stay editable.
- Add listener reactions.
- Save everything to the episode, and preview with recorded dialogue.

## Carry over from the step 1 review

- `renderScene`'s frame-skip key copies `SceneView`'s time-dependent inputs by hand. If you add an input, update the key and add a comment saying they must match, or a frame will freeze with no failing test.
- The preview page is fixed at 960 wide and overflows narrow windows. Make the editor's preview fit its space.

## Not in this step

Transitions, episode export, props, new motions, and the Director.

## Acceptance

1. Rebuild `samples/first-scene` through the UI: a wide shot, a speaker shot, and a listener reaction with two characters and one set.
2. It plays like the hardcoded version. Compare the preview with an exported MP4 frame at every shot.
3. Only the speaker's mouth moves, and the two characters don't blink or sway together.
4. Reopen the project, and every edit is still there.
5. A shot's camera can't show anything outside the set.
6. Today's four-step flow still works.
