# Studio backgrounds — whole-step report

## Commits

- `f378af1` — add safe studio background storage
- `0f4e6b1` — record background task 1
- `4a966d0` — serialize background metadata mutations
- `cc92830` — compose studio backgrounds in preview and export
- `93328cf` — keep background preview and export controls aligned
- `e959fc7` — preserve live composition while dragging
- `d236f4e` — guard empty background selections
- `9ec0554` — add transparent ProRes MOV exports
- `e7bf6b9` — validate transparent export containers

## Acceptance

| Check | What was checked | Result |
| --- | --- | --- |
| PNG, JPEG, SVG store | `prepareSet`-backed tests and API routes store safe PNG plus metadata; temp-store persistence tested | Automated passed; browser upload/reload unverified |
| Hostile SVG | Tests cover scripts, external/file URLs, CSS imports, entities and unsafe IDs | Automated passed; browser probe unverified |
| Background API safety | UUID-only get/delete, traversal names, MIME, corruption and concurrent metadata mutation | Automated passed |
| Background choice | Animate exposes Transparent, Colour, Picture, upload, remove, size and flip | Browser UI observed; full interaction unverified |
| Shared preview/export composition | Shared `StudioFrame`; background precedes character and cache key includes composition | Code-reviewed; pixel comparison unperformed |
| 16:9 and 9:16 | Aspect shared between App preview and Export; normalized placement used by both | Partial automated coverage; live parity unverified |
| Colour MP4 | Validation rejects transparent-plus-colour and renderer keeps opaque MP4 path | Automated passed; live export unverified |
| Transparent WebM | Legacy request shape remains WebM and alpha test passes | Automated passed; live alpha inspection unverified |
| Transparent MOV | `prores_ks`, profile 4444, alpha pixel format request, PCM audio; ffprobe render test passes (`yuva444p12le` on this ffmpeg build) | Automated passed; editor alpha inspection unverified |
| Legacy output | Existing suite passes and legacy request shape is preserved | Automated passed; frame-hash comparison with `origin/main` unperformed |
| Character kinds | Shared renderer path covers starter/art/vector code paths | Partial automated coverage; all visual exports unverified |
| Narrow window | Responsive full-frame SVG and overflow clipping are present | Code-reviewed; narrow-window browser check unverified |

## Tests

- `npx vitest run` — 64 files, 533 tests passed.
- `npx tsc --noEmit -p .` — passed with no diagnostics.
- Final review also confirmed `git diff --check` and `/api/health` HTTP 200 for this checkout.

## Decisions I made

- Used `/Users/rafflesiakhan/Documents/ChatGPT/html-animated-vedio/slide/kitta-animation-background` on `feat/studio-background` from `origin/main`.
- Reused `prepareSet`; only normalized PNGs are served for studio backgrounds.
- Serialized metadata writes and preserve malformed `meta.json` rather than silently overwriting owner data.
- Kept legacy requests unchanged: opaque means MP4 and transparent means WebM when no container is supplied.
- Added optional `container: 'webm' | 'mov'`; MOV is valid only for transparent exports and uses ProRes 4444 plus PCM audio.
- Preserved the supplied planner directory and `.playwright-cli/` as untracked workspace data.
- A delegated composition implementer stalled, so the coordinator implemented that task directly; planner and fresh reviewers were still used, and reviewer findings were fixed and rechecked.

## Not done or not verified

- No final real-browser upload of PNG, JPEG, SVG, or hostile SVG.
- No preview/export frame comparison at three moments in either aspect.
- No independent MP4/WebM/MOV browser download acceptance or editor alpha inspection.
- No frame-hash comparison against `origin/main`.
- No paid API calls.

## Review findings left open

- Minor: positive MOV UI-selection and `.mov` download-route tests are not present; codec/render coverage and allow-list code are present.
- Minor: dedicated layout styling and full composition regression tests remain lighter than the plan requested.
- These remain explicitly unverified rather than being reported as passed.
