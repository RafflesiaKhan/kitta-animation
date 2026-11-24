# Action library, step 1

## Commits

- `5b22cdb` — `feat: add shared action library playback`
- `3b3ce6d` — `feat: serve and validate action library`
- `78e47d3` — `feat: load action library in Animate palette`
- `920aeef` — `fix: validate scenes against action library`
- `22114a1` — `fix: preserve legacy action timing and capabilities`
- Claude review follow-up: a missing or damaged `vector.json` gives a character no capabilities instead of hiding it from the list (`server/vector.ts`, `tests/server/vector-capabilities.test.ts`).

Branch: `feat/action-library`, based on `origin/main`, in the isolated worktree
`/Users/rafflesiakhan/Documents/ChatGPT/html-animated-vedio/slide/kitta-animation-action-library`.

## Acceptance

| Check | What I did | Result |
|---|---|---|
| 1. Existing saved timeline and preview/export parity | Copied (without moving) project `ff3c5713-9249-4357-b7b7-1c5d7f1486e9` into the isolated worktree and rendered its episode with `point`, `shrug`, and `nod` marks. The same fixture was rendered from `origin/main` in a temporary detached worktree. Frames at 0.5, 1.5, 2.5, 4.3, 5.2, and 9.7 seconds had identical SHA-1 hashes between main and this branch. The scene payload used by preview also loaded successfully. Temporary copies were deleted. | Passed |
| 2. Temporary `hold` action | Created a copy of `think.json` as `test_hold` in isolated `data/motions/`, loaded it through the server library, registered it for vector playback, sampled its held pose, and removed it. | Passed |
| 3. Temporary `once` and `loop` actions | Created `test_once` and `test_loop`, confirmed their metadata loaded, and removed them. Unit coverage also distinguishes once, loop and hold sampling. | Passed |
| 4. Unknown bone | Created `test_bad` with `unknownBone`; the loader refused it with `motion test_bad: unknown bone "unknownBone"`, while the valid actions remained available. Removed it. | Passed |
| 5. Starter and AI character palette | Non-vector characters remain limited to the legacy ids. The UI regression test covers a vector character missing `body30`: the action is disabled and its capability reason is the tooltip. The copied AI character was present during the real-data route/render check, then removed. | Passed |
| 6. Required tests | TypeScript passed. Full Vitest passed: 59 files, 499 tests. Focused review regressions passed: 3 files, 22 tests. | Passed |

## Tests

- TypeScript: `npx tsc --noEmit -p .` — pass.
- Vitest: `npx vitest run --pool=forks --maxWorkers=1 --reporter=dot` — 59 files, 499 tests passed.
- Focused review regression: 3 files, 22 tests passed.

## Decisions I made

- Kept `Gesture` as a string and retained `GESTURES` as the nine legacy ids so Auto-tag and Director behavior remain unchanged. If the legacy list were removed now, saved inputs and the two AI-selection paths could change.
- Treated old clips without `play` as `once`, and made all eight built-in body actions explicit `once`, preserving main's `progress × clip duration` sampling. Added regression coverage at progress 0.1/0.5/0.9 and block lengths 0.5/1.5/6 seconds.
- Made `lookDown` a library id with its existing head-pitch face behavior and no body motion. Changing it to a normal clip would alter existing scenes.
- Used one shared registry: the browser fetches `/api/actions` and the server loads the same JSON records before export. This keeps custom vector actions from being preview-only.
- Invalid custom files are skipped and returned as clear `errors` from `/api/actions`, so one bad owner file cannot break the palette.
- Kept starter and painted characters on the legacy action set; vector characters receive the full loaded library. This matches the prompt’s capability boundary.
- Updated scene validation as well as export/project validation after review found that custom ids could otherwise be rejected by `shared/scene.ts`.
- No files in the parallel Settings allowlist were changed, except the single permitted route-mount line in `server/index.ts`.

## Not done or not verified

- The real-data check used server scene loading and rendered export frames; a manual browser screenshot comparison was not needed because the loaded preview scene and export renderer share the same scene source. The exact frame hashes are recorded above.
- No new clip files were committed, and no generation, paid API, `+ New action` UI, walking, Move block, two-person lanes or camera lane was started.

## Review findings left open

The fresh reviewer stage was rerun after these fixes, but the reviewer again timed out while still running and was shut down. No reviewer findings were returned; I performed the final diff review directly. Earlier review findings led to `920aeef`, which routes scene validation through the action library.
