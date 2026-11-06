# Step 3 — Characters and sets

## Commits

- 6b775de — feat: prepare safe reusable scene sets
- 997b83c — feat: save reusable project characters and episode scenes
- fb830c2 — feat: edit project cast and stage episode scenes
- b5bc4cf — fix: lock episode settings during saves

Subagents planned, authored changes and failing tests, and reviewed each task. The coordinator applied patches and ran verification because escalated writes had stalled in subagent sessions. The UI implementer hit a usage limit after supplying the failing tests and character editor changes, so the coordinator completed the episode UI. A separate final reviewer checked the whole step and rechecked the save-control fix.

## Acceptance

Chrome used checkout-owned listeners on 5193 and 5195. A separate loopback HTTP probe on 5197 checked whether the hostile fixture triggered a request. The QA projects, imported fixtures, and temporary legacy-flow media were removed after the checks.

| Check | Result | What I did and saw |
| --- | --- | --- |
| Reuse character and set | Passed | Saved a customized SVG cast record and imported a static SVG set. Saved two episodes using the same character ID and set ID. |
| Episode expression stays independent | Passed | Changed the second episode from neutral to happy. After reload and reopen, the first episode was neutral and the second was happy. The second scene retained its ID. |
| Project style gates character choice | Passed | The SVG editor offered the starters and no AI library or painting action. The AI editor offered Max and no SVG starters or painting action. The server tests reject both mismatched style directions. |
| Ground anchor and wide shot | Passed | With a character anchor of 0.98, stage ground 0.82, and scale 0.72, Kit's torso and hands fit above the bottom edge. I compared the paused stage screenshot with the first MP4 frame at the same size. Their SSIM was 0.9918, and both show the same body coverage and placement. |
| Original four-step flow | Passed | Opened Character Studio, uploaded a WAV, received lip-sync cues, opened Animate, and exported an MP4. A separate legacy render also matched the original Step 1 decoded audio and video hashes. |
| Max reopens and renders | Passed | Added Max by reference to an AI project using the existing pose images, saved a scene, and reloaded the app. Reopened the episode, checked the painted pose and saved voice defaults, then exported it. The preview and first exported frame matched visually, with SSIM 0.9940. |
| Hostile set isolation | Passed | Imported a hostile SVG as an asset. Selecting it as a set was rejected and the existing safe preview remained. A temporary saved-scene fixture referencing the hostile bytes was rejected on reopen and export. Chrome saw no script dialog or external or file request, and the HTTP probe saw no request. Tests also verify hostile markup is rejected before resvg can see it, including local links, CSS, and XML entities. |

## Tests

- Each task's new regression tests failed before its implementation.
- **npx vitest run** passed 325 tests across 38 files.
- **npx tsc --noEmit -p .** exited 0 with no diagnostics.

## Decisions I made

- New episodes get a 1.5-second silent wide shot with a scrubber and one cast member. This provides a real saved scene for placement and pose checks. Multi-character timing and voice assignment remain later work.
- Character anchor is a fraction of the source box. Horizontal placement, scale, and stage ground position are per episode. The existing front-facing busts and painted poses keep their artwork, so the anchor must be calibrated to the artwork rather than inferred.
- Static imported sets use a common PNG for browser and export. PNG, JPEG, and WebP are normalized to one bounded frame. SVG selection accepts a small shapes-and-gradients subset and rejects scripts, styles, linked files, and declarations such as DOCTYPE. Original uploads stay downloadable. Artwork outside this subset can be flattened to an image before selection.
- Reusable AI cast records hold a saved-library ID and use current pictures on reopen or render. Project defaults store provider, voice, engine, speaker, and delivery. An episode save cannot overwrite a working scene with an already-missing AI reference.

## Not done or not verified

- I compared the first frame of the two new scenes and the legacy decoded hashes. I did not perform a continuous playback or listening review.
- No character painting was needed. Max's existing pictures supplied the live preview and export.

## Review findings left open

- No critical or important findings remain. Set preparation does synchronous work on selection and reopen. Raster decoding has size, pixel, output, and timeout limits. Caching or moving it off the request path would help if projects regularly use large sets.
