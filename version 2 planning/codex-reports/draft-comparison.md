# First-scene draft comparison

Compared `codex/first-scene-draft` (`cf5551b`) with the synced first-scene branch (`de71121`). This was a source review. Visual observations below describe the framing in code and the recorded step 1 findings.

## First scene

Keep the pushed step 1. It resolves a data-driven set, cast, dialogue, shots, and reactions from `SceneSource` into `Scene`. The browser preview and `renderScene` share its `SceneView`, which supports SVG and saved AI characters. Keep this implementation of the file both branches added. The draft's `SceneView` hardcodes the set, two starters, and three shots.

- The draft makes generation discoverable in the browser. Its **Generate** button shows progress and errors, displays the dialogue, and gives users an inline MP4 and a download link. The pushed version builds from the CLI and previews a saved scene in the browser. If generation moves into the UI, carry over those controls and call the step 1 builder.
- The draft puts the actors behind a foreground counter, which gives their lower-body crop a visible reason. Its speaker and listener shots crop to half the stage and center the relevant actor more tightly. The [step 1 review](../first-scene-findings.md) records a bottom-edge crop in the wide shot and empty set space beside faces in the close-ups. Use the draft framing as a reference when tuning the set and shot data. The draft also labels the SVG for assistive technology. The generic preview could derive that label from the scene title.

## Projects

The [implementation plan](../implementation-plan.md) calls for stable project, episode, asset, scene, and cue IDs, one visual style per project, and one JSON file per project with managed media and provenance. The [step 2 brief](../codex-prompts/step-2-projects-and-storage.md) adds safe writes, path containment, and continued access to the existing character library.

### `server/projects.ts`

- Reuse the injectable storage root, UUID-based directories, create/list/open routes, project-scoped asset lookup, and same-directory write-and-rename for project JSON. Reuse the upload size limit, generated media filenames, rollback on metadata save failure, and sandbox and nosniff response headers for served uploads.
- Put uploads in a managed media subdirectory and record their relative location, media type, and provenance. Treat the submitted filename as a display label. Validate IDs and stored relative paths before filesystem access, and verify imported media before use. The draft accepts the multipart MIME label as evidence of file type. Apply safe SVG handling wherever uploads are displayed or rendered. Keep read-modify-write operations serialized per project if storage becomes async, with unique temporary files if writes can overlap.
- Reuse the existing-character lookup and duplicate-reference handling. Keep existing files under `data/characters/` and resolve the character by ID when loading or rendering a saved scene. Repainting a pose can replace the filename stored in a resolved character snapshot.
- Replace the episode's draft-only sample generation route with saving and reopening the accepted scene. The draft stores generic audio and export URLs, while the episode needs durable project-owned media and enough saved timeline, shot, and cue data to reopen and render with step 1 without generating the dialogue again.

### `shared/projects.ts`

- Reuse the basic project, episode, and asset records and their stable IDs. Require a project visual style of `svg` or `ai`, and validate the selected style where cast members are assigned. Extend media assets with a managed file location, type, and provenance, and keep saved character assets as ID references.
- Replace `SavedSample` and its dependency on the draft `SceneView` with stable scene and cue records based on `shared/scene.ts`. Persist the scene data, built timing, and media references needed to reconstruct a renderable `Scene`. Store the AI character reference from the source and resolve current character metadata at load or render time.

### `src/Projects.tsx`

- Reuse the create/list/open screens, labeled forms, Overview/Assets/Episodes tabs, media import and asset list, saved character picker, and busy/error states. Add the style field and align the upload picker with the server's supported formats.
- Open saved episodes through the accepted preview and scene model. Keep the existing four-step flow and the `?scene` preview reachable when wiring up Projects, and use the existing API client conventions.

### `tests/server/projects.test.ts`

- Reuse the temporary storage root and Supertest setup, fresh-router reopen, duplicate character import, and cross-project asset checks. The draft verifies that the second project stays empty and that the first project's SVG cannot be fetched through the second project.
- Replace the placeholder bytes and mocked draft payload with valid media fixtures and a step 1 scene fixture. Check persisted bytes and metadata for image, SVG, and audio, malformed project IDs and traversal filenames, and scene reopening through the accepted preview and render path. Cover resolving an existing AI character after a pose replacement. The draft's second sample request checks the returned payload. A generator call-count assertion would be needed to prove it reused the saved result.
