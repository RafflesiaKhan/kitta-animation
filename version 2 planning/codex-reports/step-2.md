# Step 2 — Projects and storage

## Commits

- d3d76b9 — feat: persist projects, episodes and assets
- d475fbb — feat: save and render durable episode scenes
- b66a8ea — fix: capture coherent AI pose images for scene renders
- ac4ded2 — feat: add the Projects home and episode preview

Subagents planned, authored, and reviewed the changes, including a separate whole-step review. Subagent write approvals stalled, so the coordinator saved the plan and applied, tested, and committed the implementers' patches.

## Acceptance

Chrome used an isolated Kitta server on loopback ports 5193 and 5195. Both listeners were verified against the checkout by process ID and working directory. The QA projects and four-step export fixtures were removed afterward. The rebuilt local Step 1 sample remains available.

| Check | Result | What I did and saw |
| --- | --- | --- |
| Two projects, media import, and reopen | Passed | Created SVG and AI projects. Imported a PNG, SVG, and WAV through the SVG project's asset library. Reopened both projects after browser reloads. All three imports appeared in the SVG project, and the AI project showed only its character reference. The server test also checks persisted bytes and cross-project requests. |
| Save and reopen the Step 1 scene | Passed | Built the missing sample using the existing CLI and local VoiceStudio. Saved it into an episode in Chrome, reopened it, and rendered and downloaded the episode MP4. The paused scene SVG matched the direct Step 1 preview. The MP4's decoded video and audio frame hashes matched the Step 1 export. A server test also reopens and renders after deleting the original source WAV. |
| Existing saved AI characters | Passed | The AI project's picker displayed a character from the existing library. Added it by reference and reopened the project to verify it persisted. A fixture test replaced an AI pose and verified that both reference-based and older snapshot-based scenes used the current pose. |
| Four-step flow | Passed | Opened Character Studio from Projects, uploaded a WAV in Voiceover, received lip-sync cues, opened Animate, and rendered an MP4 from Export. |
| Project path boundary | Passed | Live requests with traversal in project or asset IDs returned 404. A multipart filename containing traversal was reduced to a display basename and stored under a generated media ID. The regression test also verifies that an outside directory and its sentinel file remain unchanged. |

## Tests

- **npx vitest run** passed 299 tests across 37 files.
- **npx tsc --noEmit -p .** exited 0 with no diagnostics.

## Decisions I made

- Make Projects the root page and expose the existing workspace at **/?character-studio**. Preserve direct scene previews at **/?scene=<name>**. Existing bookmarks to the bare root now land on Projects and require one click to enter Character Studio.
- Save the accepted, already-built Step 1 sample in SVG projects. The sample's two rigs use that style. A fresh checkout must run **npm run scene -- samples/first-scene** once before saving it. Copies of its WAV and set keep saved episodes independent of the build output at the cost of disk space per episode.
- Keep historical draft episode fields intact and treat a missing project style as SVG. The old draft scene payload is preserved on disk. Reopening a draft episode uses the current sample save flow if it lacks a Step 2 scene.
- Resolve AI characters by ID and capture matching pose bytes for export. A repaint is reflected the next time a saved scene opens or renders. A preview already open during a repaint may need to be reopened.
- Validate imports by format signatures and serve SVG uploads as sandboxed attachments. These checks support storing and downloading project assets. An editor that consumes arbitrary imported content will need format-specific decoding and SVG handling.

## Not done or not verified

- Compared decoded audio and video hashes and the paused browser frame. Did not perform a separate listening audition or continuous playback review.
- Verified AI library references live and pose replacement with a local fixture. The shipped sample uses SVG and has no AI variant within Projects in this step.
- Exercised ordinary writes, reopens, and boundary cases. Did not simulate a physical power loss or force a partial disk write.

## Review findings left open

- The multipart route can buffer up to its 25 MB limit before rejecting an invalid project ID. It rejects the request before filesystem access. Prevalidation is deferred.
- The UI unit test checks the upload endpoint and state. Actual file selection and multipart bytes are covered by the browser and server tests.
