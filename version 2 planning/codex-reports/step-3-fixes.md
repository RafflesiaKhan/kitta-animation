# Step 3 fixes

## Commits

- 6049395 — fix: prepare compatible SVG sets off the request thread

The branch fast-forwarded to 9776fae, which added the review prompt. One implementer supplied the failing tests and patches, and one fresh reviewer checked the complete diff. The coordinator applied the patches and ran checks because subagent shell escalation had stalled previously.

## Acceptance

Chrome used checkout-owned listeners on 5193 and 5195. A loopback HTTP probe on 5197 watched for requests triggered by the hostile file. Temporary projects, imports, and legacy export fixtures were removed after testing.

| Check | Result | Evidence |
| --- | --- | --- |
| Figma, Illustrator, and Inkscape sets | Passed | Imported all three fixtures through Assets and selected each in the Kit episode. The clipped lines and Figma circle, Illustrator class-styled shapes, and Inkscape inline-styled shapes were visible in preview and in the first exported frame. Preview/export SSIM was 0.9868, 0.9914, and 0.9903 respectively after resizing the exported frame to the screenshot. |
| Hostile SVG | Passed | The hostile upload stayed in Assets and selecting it as a set returned 409. Chrome observed no script dialog or external/file request, and the probe received no request. Unit tests verify that every hostile case is refused before resvg sees it. |
| Heavy SVG and request responsiveness | Passed | Selected a heavy dashed-circle SVG through the UI. An unrelated project-list request returned in 7 ms while preparation was still running. The worker hit its five-second time limit and the UI showed the error. The server test checks timeout, responsiveness, and that subsequent opens and export reuse the prepared PNG. |
| Default Kit and Max framing | Passed | Created both scenes with the default anchor and ground position of 1. At time zero, the artwork reached the frame edge without showing its flat lower edge inside the frame. Both previews matched their corresponding exported first frames visually. The Max comparison had SSIM 0.9873. |
| Small viewBox stays sharp | Passed | The 160 × 90 Figma-style viewBox produced a 1920 × 1080 prepared PNG. Its thin lines remained distinct in the exported frame. Tests also verify that a 3840 × 2160 declared SVG renders to 1920 × 1080. |
| Bundled Step 1 render | Passed | Saved the first scene into a new episode and downloaded its render in Chrome. FFmpeg decoded frame hashes, including audio, matched the original Step 1 export exactly. |
| Original four-step flow | Passed | Opened Character Studio, uploaded a WAV, received lip-sync cues, opened Animate, and produced a downloadable MP4. |

## Changes and decisions

- Rebuild SVG markup from approved elements, attributes, and CSS. Ignore editor metadata and namespace decorations, plus external-only DOCTYPE declarations. Support clips, masks, patterns, local use references, and filter primitives other than feImage. Normalize bare local references where the renderer expects url(#id).
- Accept simple class, ID, and tag selectors and supported style declarations. Refuse remote or file references, at-rules, CSS escapes, entity declarations and internal DTD subsets, scripts, text, and other unsupported features. Refusals name the offending feature when possible. Text still needs outlines or a flattened image.
- Run SVG parsing and rendering in a killable Node child with a five-second deadline. FFmpeg raster preparation uses the same asynchronous process wrapper with pipe-only input. Bound input, output, and image dimensions. Rasterize vectors to fit the 1920 × 1080 stage while retaining their aspect ratio. The existing raster scaling behavior stays in use.
- Store prepared PNGs atomically beside the original, keyed by source bytes, MIME type, and cache version. Coalesce simultaneous preparation of the same source. The scene save checks that the AI reference still exists after preparation and rereads the project before writing, so a slow preparation cannot overwrite unrelated updates.
- Default stage ground to 1 and explain the visible body edge below 1. Clarify that the SVG artwork can extend past its anchor box.
- Remove the retired characterId upload action from Assets. Existing character asset rows still load. The project character editor handles reusable cast.

## Tests

- Tests failed first for SVG compatibility, cache creation, the ground default, and both SVG output-size cases. Added a hostile timeout test, center-pixel checks for actual shapes, a local xlink use check, text refusal, and legacy character row coverage.
- **npx vitest run** passed 337 tests in 38 files.
- **npx tsc --noEmit -p .** exited 0 with no diagnostics.

## Not done or not verified

- Visual comparisons used first frames. I did not do a continuous playback or listening review.
- The compatibility checks used representative fixtures. SVGs with text, unsupported CSS, and disallowed resources still need conversion before use as sets.

## Review findings left open

- No critical or important findings remain. Different uncached sets can prepare in parallel. A manual replacement of source bytes creates a new cache file and can leave the prior version on disk.
