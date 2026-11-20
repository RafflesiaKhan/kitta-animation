# Adding vector-avator characters

[vector-avator](https://github.com/grmchn/vector-avator) (commit `f28d35d`, 18 Nov 2026) turns one character illustration into a 2D vector character that moves on a 3D skeleton. It already does most of what `svg-character-skill-plan.md` on the `test-cd/kitta-v2-first-scene` branch plans to build, so Kitta should adopt it instead of building that from scratch.

## What it brings

| vector-avator | Kitta today (test branch) |
| --- | --- |
| Fill-only SVG parts with pivots in one `vector.json` (the sample has 49 parts) | Planned `pack.json` with one SVG per part |
| Arms generated from 3D bones: bend at the elbow, change thickness with depth, pass in front of or behind the body; 4 hands | Two-segment SVG arms drawn per gesture |
| Head turn up to ±30° from one front drawing | Front only |
| Ears, hair and tails swing on springs | None |
| Automatic outlines where parts overlap, optional hand-drawn line | Outlines drawn into each shape |
| Blink, breathing, 5 vowel mouths, 4 expressions | Blink, 9 Rhubarb mouths, 11 expressions |
| Hand-keyed and AI-generated motions (explain, point, think, spread, nod, wave, idle, two dances) | 8 gestures |
| A Claude Code skill that makes a new character in about 45 to 90 minutes | Planned agent skill |

## Licences

- **Code:** MIT. Copy it in with its licence notice and the commit it came from.
- **Sample character "Kariusagi" (usagi):** free for individuals, including commercial use. Companies must ask the author first (X: @grmchn4ai). Use it only for testing; don't ship it as a Kitta starter without that permission.
- **AI motions** in `data/motions/ai/` were made with NVIDIA Kimodo and MotionBricks. Check those tools' output terms before shipping them. The hand-keyed motions are covered by MIT.
- **Dependency:** `polygon-clipping` (MIT).
- **Risk:** `polygon-clipping` 0.15.7 was last released in Dec 2023, which is outside the 6-month maintenance bar. `martinez-polygon-clipping` 0.9.1 is a possible replacement; swap it if outlines need a maintained library.

## What has to change

1. **Rendering.** vector-avator draws on a Canvas 2D in the browser, while Kitta builds every frame as SVG and exports it with resvg. The cheapest fit treats a vector character like an AI character: render it to a transparent image per frame and place it in the scene SVG. In the browser that uses a canvas; for export it uses `@napi-rs/canvas` (which has `Path2D`) on the server. The renderer creates its own canvases with `document.createElement` in `vectorRenderer.ts` and `outline.ts`, so it needs a canvas factory passed in. A later option is porting the renderer to emit SVG paths, which keeps characters vector in the export.
   - **Stateful renderer.** Unlike the SVG characters, a vector frame depends on the frames before it: the ear and tail springs, hand lag and the outline clock all carry history. One `VectorStage` per actor (`shared/vector-avator/stage.ts`) samples pose, face and springs on a fixed 30 Hz tick, so the 60 Hz preview and the 30 Hz export draw the same picture for a given time. Drawing the same tick again is skipped (frame dedupe), so a paused preview costs nothing. A seek or backward step restarts the springs and replays the previous 90 ticks (3 s) from the timeline. The export dedupe key is the frame index whenever a vector actor is present, since two equal frames can still differ.
2. **Mouths.** Map Rhubarb shapes to its vowels: X and A → sil, B and G → i, C and H → e, D → a, E → o, F → u.
3. **Expressions.** Map Kitta's 11 to its 4 until more are drawn: happy, excited, wink → smile; surprised → surprised; sad, worried, confused, angry → troubled; neutral, thinking → neutral; sleepy → neutral with half-closed eyes; wink also closes one eye. Angry and sleepy need their own parts in `vector.json` to read properly.
4. **Gestures.** Kitta's `FrameState` drives a motion clip and the face: explain → explain, point → point, think → think, shrug and celebrate → spread, nod → nod_surprise, wave → mb_wave (check licence), look down → head pitch. Talking adds small head turns from the existing speech nods.
5. **Idle timing.** Each character gets its own motion time offset, so two characters don't blink or breathe together (a step 1 finding).
6. **Making characters.** The skill needs Codex imagegen and Fable 5.2, which the Kitta app doesn't call. Keep it as an agent skill run outside the app, as the test branch already plans, and let Kitta import the resulting `vector.json` into a project like a set.

## Steps

| Step | Build | Acceptance check |
| --- | --- | --- |
| 1 | Copy `src/core` and `src/renderers/vector` into `shared/vector-avator/` with the licence and commit, add the canvas factory, and run its tests in Kitta. | Its tests pass in Kitta's test run. |
| 2 | Add a `vector` character kind that stores `vector.json`, with the mouth, expression and gesture mappings above. | The sample speaks a line with lip sync in the browser preview. |
| 3 | Export through `@napi-rs/canvas` inside the scene renderer. | A frame from the preview and the same frame from the MP4 match, scrubbing back and forth gives the same frame as playing forward, and the render time is recorded beside the first-scene times. |
| 4 | Make a second character with the skill and rebuild the first scene with two vector characters. | Only the speaker's mouth moves, the two never blink together, and the owner finds it better than the SVG starters. |
| 5 | Copy the skill into this repo, adjusted to output a Kitta project import, and replace phases A and B of `svg-character-skill-plan.md`. | A third character goes from one picture to a Kitta scene by following the skill alone. |

## Status (steps 1 to 3 built, not committed)

- **Step 1 done.** The core and renderer are in `shared/vector-avator/` with `LICENSE`, `ASSETS_LICENSE.md` and `SOURCE.md` (commit `f28d35d` and every local edit). Local edits: canvas factory instead of `document.createElement`, a transparent default background, a public `dpr` and a `restart()` method. Only the 7 motions Kitta uses are vendored, so the motion-count guard in `core.test.ts` changed from 12 to 7.
- **Test wiring.** vector-avator's 7 test files live in `tests/shared/vector-avator/` and run in the existing `node` vitest project (`tests/shared/**`): 82 tests pass. `tests/shared/vector-kitta.test.ts` covers the Kitta mappings, and `tests/server/vector-export.test.ts` covers export. The export test uses the real `data/characters` folder and deletes the sample only if it created it.
- **Step 2 done.** `vector` is a new character kind (`data/characters/<uuid>/meta.json` plus `vector.json`). The Character step has an "Add vector sample" tile, and the sample renders live. Checked in the browser on a scene with a timeline and audio: at 0.2 s (mouth D) the mouth is wide open, at 0.6 s (E) it is a small "o". Vector characters are not offered in Projects (`server/projects.ts` is unchanged).
- **Step 3 done.** The scene and single-character exports draw each vector actor through its `VectorStage` on `@napi-rs/canvas` and embed the picture in the scene SVG. A preview frame and an export frame come from the same stage code.
  - **Render time:** 56 frames, 2 vector actors, 1920×1080 took 8.0 s (7.0 fps, 0.23× realtime) with a 768 px picture per actor (10.0 s at 1024 px). The canvas drawing is about 6 ms a frame at 540×960. The rest is probably PNG encoding and resvg decoding two pictures per frame; this is not profiled. Faster options: raw pixel input instead of PNG, or a later SVG-path renderer.
  - **Scrub against forward play:** replaying 24 ticks left a mean difference of about 1 on the 0 to 255 scale (max 211 on edge pixels), and it did not fall steadily as the replay grew, so the spring history is long. At 90 ticks the mean is 0.008 at frames 100 and 150. The warm-up is 90 ticks, costing up to 90 renders (a few hundred ms) per scrub, and export is unaffected since it is sequential. Drawing the same frame twice is identical (max difference 0).
- **Steps 4 and 5 not done.** They need Codex imagegen (a ChatGPT plan) and Fable 5.2 for drawing parts, which were not available here. The skill's prerequisites are those two tools plus an agent that can run the skill; the Kitta app itself never calls them.
- **Licence caveats still open.** The sample character is for testing only. The `wave` gesture uses the AI motion `mb_wave`, whose output terms are unchecked.

## Open decisions

- **Branch:** build on `test-cd/kitta-v2-first-scene`, where scenes, projects and sets already exist.
- **Copy or depend:** the repository is a snapshot updated irregularly and isn't on npm, so copying a pinned commit is safer than a git dependency.
- **Image tools:** the skill needs Codex imagegen (a ChatGPT plan) and Fable 5.2 for drawing parts. Decide whether that's acceptable, or whether Kitta's own Gemini/OpenAI image generation should replace Codex in the skill.
