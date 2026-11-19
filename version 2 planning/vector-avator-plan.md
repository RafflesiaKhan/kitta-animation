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

## What has to change

1. **Rendering.** vector-avator draws on a Canvas 2D in the browser, while Kitta builds every frame as SVG and exports it with resvg. The cheapest fit treats a vector character like an AI character: render it to a transparent image per frame and place it in the scene SVG. In the browser that uses a canvas; for export it uses `@napi-rs/canvas` (which has `Path2D`) on the server. The renderer creates its own canvases with `document.createElement` in `vectorRenderer.ts` and `outline.ts`, so it needs a canvas factory passed in. A later option is porting the renderer to emit SVG paths, which keeps characters vector in the export.
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
| 3 | Export through `@napi-rs/canvas` inside the scene renderer. | A frame from the preview and the same frame from the MP4 match, and the render time is recorded beside the first-scene times. |
| 4 | Make a second character with the skill and rebuild the first scene with two vector characters. | Only the speaker's mouth moves, the two never blink together, and the owner finds it better than the SVG starters. |
| 5 | Copy the skill into this repo, adjusted to output a Kitta project import, and replace phases A and B of `svg-character-skill-plan.md`. | A third character goes from one picture to a Kitta scene by following the skill alone. |

## Open decisions

- **Branch:** build on `test-cd/kitta-v2-first-scene`, where scenes, projects and sets already exist.
- **Copy or depend:** the repository is a snapshot updated irregularly and isn't on npm, so copying a pinned commit is safer than a git dependency.
- **Image tools:** the skill needs Codex imagegen (a ChatGPT plan) and Fable 5.2 for drawing parts. Decide whether that's acceptable, or whether Kitta's own Gemini/OpenAI image generation should replace Codex in the skill.
