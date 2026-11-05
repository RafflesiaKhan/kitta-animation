# Step 7: Editing and episode export

Read `version 2 planning/codex-prompts/shared-rules.md` and follow it, including the subagent stages. Then read `version 2 planning/codex-reports/step-6.md`.

## Goal

A creator can put scenes in order and export a whole episode as one video.

## Build

- Scene order, and transitions between scenes: cut, dissolve, and fade through black.
- An edit and review page, as the prototype `version 2 planning/product-poc.html` shows.
- An audio mix: dialogue or narration, plus imported music or effects, each with a level. Use ffmpeg, which the app already relies on.
- Episode export through the same `SceneView`. Show progress the way the export step does, and let a progress estimate account for painted characters being slower.

## Watch for

- **Length limits:** `MAX_AUDIO_MS` limits audio to 3 minutes, and it applies through `normalizeAudio` and `validateExport`. Episodes may run longer. Render scene by scene and join the results, rather than simply raising the limit.
- **Transitions in the render path:** a dissolve must look the same in preview and export. If the current frame-by-frame path makes that hard, say so, and pick the simplest honest approach.
- **Failures:** a failed render must not leave a broken file that looks finished.
- **Speed:** measure a real episode, including a scene with two AI characters if two already exist. Add the numbers to your report. Don't paint a new character to measure this without the owner's approval.

## Ask before changing

Removing today's four-step flow. If this step makes it look redundant, list what would need to happen, and leave it in place for the owner to decide.

## Not in this step

Props, creatures, templates, and new motions.

## Acceptance

1. Render a short episode with at least three scenes and two transition types.
2. Check shot boundaries, sync, continuity, audio levels, and playback of the exported file.
3. Compare preview and export at a point in each scene and in the middle of a dissolve.
4. Export an episode longer than 3 minutes. If that isn't practical to test with real voices, join repeated scenes, and say so in your report.
5. Stop a render partway, and confirm no finished-looking file is left behind.
