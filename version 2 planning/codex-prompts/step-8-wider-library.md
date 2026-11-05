# Step 8: Wider library

Read `version 2 planning/codex-prompts/shared-rules.md` and follow it, including the subagent stages. Then read `version 2 planning/codex-reports/step-7.md`.

## Goal

Projects can hold props, creatures, and scene templates, built on what already exists.

## Build

- **Props:** an image or SVG asset placed in a shot, with position, scale, flip, and front-or-behind ordering relative to the cast.
- **Creatures:** treat a creature as a non-speaking character wherever that works, instead of a new system. They use the idle timing and any gestures they support, and never get mouth cues.
- **Scene templates:** save a scene's set, placement, and cameras as a project asset, without its dialogue or audio. Starting from a template copies it, so editing the new scene doesn't change the template or other scenes.
- Let the Director's scene proposals use these assets if that takes only a small change. Otherwise, list it in your report.

## Watch for

- Deleting an asset that scenes use: decide what happens, tell the creator what's affected, and don't leave scenes that fail to render.
- Props drawn in the preview and the export come through `SceneView`, including its frame-skip key if a prop can change over time.
- A prop's or creature's style should fit the project's one style. Warn, don't block, if an imported file might not.

## Not in this step

New motions, walking, and external image or video generation.

## Acceptance

1. Place a prop and a creature in a scene.
2. Save that scene as a template, and start a new scene from it.
3. Edit the new scene, and confirm the template and the original scene don't change.
4. The creature's mouth never moves, and its idle movement doesn't match the characters'.
5. Delete a prop a scene uses, and confirm the app explains the effect and the scene still renders.
6. Export matches preview with props in front of and behind the cast.
