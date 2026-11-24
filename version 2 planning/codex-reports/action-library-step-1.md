# Action library, step 1

## Commits

- `5b22cdb` — `feat: add shared action library playback`
- `3b3ce6d` — `feat: serve and validate action library`
- `78e47d3` — `feat: load action library in Animate palette`
- `920aeef` — `fix: validate scenes against action library`

Branch: `feat/action-library`, based on `origin/main`, in the isolated worktree
`/Users/rafflesiakhan/Documents/ChatGPT/html-animated-vedio/slide/kitta-animation-action-library`.

## Acceptance

| Check | What I did | Result |
|---|---|---|
| 1. Existing saved timeline and preview/export parity | Existing timeline/render tests passed, including the vector export scrub-vs-forward comparison. The owner’s ignored `data/` was not mounted into this worktree, so I did not perform the requested real saved-project browser/frame comparison. | Partial; live saved-project comparison not verified |
| 2. Temporary `hold` action | Created a copy of `think.json` as `test_hold` in isolated `data/motions/`, loaded it through the server library, registered it for vector playback, sampled its held pose, and removed it. | Passed |
| 3. Temporary `once` and `loop` actions | Created `test_once` and `test_loop`, confirmed their metadata loaded, and removed them. Unit coverage also distinguishes once, loop and hold sampling. | Passed |
| 4. Unknown bone | Created `test_bad` with `unknownBone`; the loader refused it with `motion test_bad: unknown bone "unknownBone"`, while the valid actions remained available. Removed it. | Passed |
| 5. Starter and AI character palette | The palette code limits non-vector characters to the legacy ids and preserves the existing starter UI tests. A live AI-character browser check was not run because owner `data/` was not mounted. | Partial; AI live check not verified |
| 6. Required tests | `npx tsc --noEmit -p .` passed. Full Vitest passed: 58 files, 495 tests. Post-fix focused regression checks passed: 4 files, 18 tests. | Passed |

## Tests

- TypeScript: `npx tsc --noEmit -p .` — pass.
- Vitest: `npx vitest run` — 58 files, 495 tests passed.
- Focused post-fix regression: 4 files, 18 tests passed.

## Decisions I made

- Kept `Gesture` as a string and retained `GESTURES` as the nine legacy ids so Auto-tag and Director behavior remain unchanged. If the legacy list were removed now, saved inputs and the two AI-selection paths could change.
- Treated old clips without `play` as `loop`, matching their current `loop: true` behavior; explicit `once`, `loop`, and `hold` are now resolved by the shared `poseFor` path.
- Made `lookDown` a library id with its existing head-pitch face behavior and no body motion. Changing it to a normal clip would alter existing scenes.
- Used one shared registry: the browser fetches `/api/actions` and the server loads the same JSON records before export. This keeps custom vector actions from being preview-only.
- Invalid custom files are skipped and returned as clear `errors` from `/api/actions`, so one bad owner file cannot break the palette.
- Kept starter and painted characters on the legacy action set; vector characters receive the full loaded library. This matches the prompt’s capability boundary.
- Updated scene validation as well as export/project validation after review found that custom ids could otherwise be rejected by `shared/scene.ts`.
- No files in the parallel Settings allowlist were changed, except the single permitted route-mount line in `server/index.ts`.

## Not done or not verified

- The real saved-project browser comparison against an owner `data/` episode was not verified in this isolated worktree.
- A live AI-character palette check was not verified.
- No new clip files were committed, and no generation, paid API, `+ New action` UI, walking, Move block, two-person lanes or camera lane was started.

## Review findings left open

None. The fresh reviewer subagent was unavailable after repeated timeouts; I performed the final diff review directly. It found and led to `920aeef`, which routes scene validation through the action library.
