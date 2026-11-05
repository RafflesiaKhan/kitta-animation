# Step 3: Characters and sets

Read `version 2 planning/codex-prompts/shared-rules.md` and follow it, including the subagent stages. Then read `version 2 planning/codex-reports/step-2.md`.

## Goal

A project has reusable characters and backgrounds, and an episode can use them while keeping its own performance choices.

## Build

- A character editor inside a project. Reuse `src/steps/CharacterStep.tsx` and the customisation in `shared/character/starters.ts`, instead of writing a new one.
- A project offers only the character type that matches its style: SVG starters for `svg`, and painted characters for `ai`. Characters are front-facing only.
- Reusable poses: a character's expressions and today's gestures, shown as they are in the Animate palette.
- Background assets: import an image or SVG, and pick one as a scene's set.
- A character's placement settings, including a ground or feet anchor, so scale and position don't cut off the body by accident. The findings file explains why. Keep `SceneView` as the one drawing path.
- A character's default voice stored on it: provider, voice, engine, speaker, and steady or varied. Assigning voices comes in step 4.

## Separate the two kinds of data

The character and set belong to the project. Expressions, gestures, placement in a shot, and voice overrides belong to the episode. Changing one episode must never change another.

## Not in this step

New AI painting, unless the owner approves the cost for a specific check. Use characters already saved. Also not in this step: new views, walking, props, creatures, and scene templates.

## Acceptance

1. Use the same character and set in two episodes.
2. Change an expression in one episode, and confirm the other keeps its own performance choices.
3. An `svg` project doesn't offer AI characters, and an `ai` project doesn't offer SVG starters.
4. A character placed with its ground anchor shows the intended amount of body in a wide shot. Compare a browser screenshot with an exported frame.
5. Today's four-step flow still works.
