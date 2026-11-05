# Step 2: Projects and storage

Read `version 2 planning/codex-prompts/shared-rules.md` and follow it, including the subagent stages. Then read `version 2 planning/codex-reports/draft-comparison.md`.

## Goal

Creators can have several projects, each with its own episodes and asset library, and everything survives reopening the app.

## Build

- Records with stable IDs for project, episode, asset, scene, and cue, shaped by the types in `shared/scene.ts`.
- Each project records its name, premise, and **one visual style** (`svg` or `ai`).
- Storage: one JSON file per project plus a managed media folder, under `data/projects/<id>/`. Follow how `server/characters.ts` stores characters. Each asset records its file location, media type, and provenance. No SQLite.
- Write each project file safely, so an interrupted save can't leave a half-written file.
- Import of image, SVG, and audio files into a project.
- A Projects home page: create, open, and list projects, with the asset library inside. Reuse what the comparison report recommends from `codex/first-scene-draft`, bringing it across file by file.
- Saved AI characters in `data/characters/` must remain available and be usable in a project. Don't move or delete those files.
- Save the first scene into an episode, in a form that renders through `renderScene` and `SceneView`.

Assume "desktop-first" means today's local web app: no packaged desktop app work.

## Carry over from the step 1 review

- A saved scene holds a snapshot of an AI character. Re-painting a pose can then break it with a missing-file error. Make the saved scene refer to the character so this can't happen.

## Not in this step

Character editing, script editing, the scene editor, Settings, and the Director.

## Acceptance

1. Create two projects, import an image, an SVG, and an audio file, then reopen the app. Each project has the correct assets.
2. Save the step 1 scene in an episode, reopen it, and confirm it renders the same.
3. Existing AI characters are still available.
4. Today's four-step flow still works.
5. A bad project ID or file name can't read or write outside `data/projects/`. Add a test.
