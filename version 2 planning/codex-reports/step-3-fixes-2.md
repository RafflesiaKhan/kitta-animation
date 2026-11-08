# Step 3 fixes, round 2

## Commits

- e7802be — fix: accept common SVG editor markup in sets

The branch fast-forwarded to 542beb8, which added the round-two prompt. One implementer authored the failing tests and patch. The coordinator applied them because subagent shell escalations had stalled previously. The first reviewer hit a usage limit. A fresh reviewer completed the review after the task resumed.

## Changes

- Validate id, result, in, and in2 as single identifier tokens, including underscores. Keep other attribute validation unchanged. Tests reject whitespace and quote injection in IDs.
- Drop data-*, aria-*, role, focusable, baseProfile, and font-* attributes when rebuilding markup. A test verifies that data-x containing a JavaScript-looking value never reaches resvg.
- Remove stylesheet comments after checking the full CSS text for at-rules and backslash escapes. Discard unsupported declarations whose values contain no URL. Reject URL-bearing unsupported declarations, including a URL split across comments.
- Allow mix-blend-mode and isolation as attributes and CSS properties. Allow symbol through local use references. Tests verify the symbol draws and the allowed properties survive rebuilding.
- Add four representative editor fixtures with real ID and style patterns. The set tests check painted pixels for Figma, current and older Illustrator, and Inkscape, alongside the existing hostile cases.
- Move jsdom and tsx to runtime dependencies and regenerate the lockfile offline. Checked that every package key, version, resolved URL, and integrity hash stayed the same. Both packages appear in npm ls with dev dependencies omitted.

## Acceptance

Chrome used listeners on 5193 and 5195 whose working directory matched this checkout. A separate loopback probe listened on 5197. The temporary QA project and hostile upload were removed after testing.

| Check | Result | Evidence |
| --- | --- | --- |
| Figma and current Illustrator fixtures | Passed | Imported both committed fixtures through Assets, selected each as an episode set, and exported an MP4. Inspected the Chrome preview and the corresponding first exported frame. Both showed the expected blue shape, and the Figma drop shadow appeared in both. First-frame SSIM was 0.9873 for Figma and 0.9878 for Illustrator. |
| Hostile SVG | Passed | Selecting a hostile SVG returned 409. Chrome observed no dialog or external request, and the loopback probe received zero requests. The unit tests also verify that resvg receives none of the rejected markup. |
| Bundled Step 1 render | Passed | Saved the first scene into a new episode and downloaded its render in Chrome. FFmpeg decoded frame hashes matched the original Step 1 export, including audio. |

## Tests

- The new set tests reproduced six failures before the implementation. All 35 focused set tests passed after the fix.
- **npx vitest run** passed 348 tests across 38 files.
- **npx tsc --noEmit -p .** exited 0 with no diagnostics.

## Decisions and limits

The compatibility changes only affect the set sanitizer and dependency classification. Visual comparisons covered first frames. Older Illustrator and Inkscape were verified by rendered-pixel tests. Text, images, animation, and complex selectors remain outside the allowlist.

## Review findings left open

No critical or important findings. The reviewer suggested an optional dedicated shadow-pixel assertion. The fixture has a painted-pixel regression, and the shadow itself was checked in the live preview and export.
