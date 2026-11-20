# vector-avator (vendored)

- Upstream: https://github.com/grmchn/vector-avator
- Commit: `f28d35d` ("initial public snapshot")
- Code licence: MIT (`LICENSE`)
- Sample character assets (`sample/usagi.vector.json`): `ASSETS_LICENSE.md`. Free for individuals; companies must ask the author first. Used for tests and the demo only.
- AI motions (`motions/mb_wave.json`) come from NVIDIA MotionBricks, whose terms have not been checked.

Copied: `src/core/*`, `src/renderers/vector/*`, a few motions/poses, and the tests (`tests/shared/vector-avator/`).
Not copied: `src/vviewer`, the Python tools, body-view data.

Also copied, for making characters in Kitta: `.claude/skills/vector-avator/references/parts-spec.md` → `skill/parts-spec.md` (unchanged).

## Kitta additions

- `check.ts`: TypeScript port of `check()` in `tools/vector/check_parts.py` (the structural checks), plus a parse of every path as `prepareVector` reads it and skeleton points on the picture. The pixel and layer checks are not ported; `server/vector-check.ts` draws check pictures instead.

## Local changes

- `canvasFactory.ts` (new): replaces `document.createElement("canvas")` so the server can use `@napi-rs/canvas`.
- `renderers/vector/vectorRenderer.ts`: canvases come from `makeCanvas`; the default background is transparent (`opt.bg = ""`); `dpr` can be fixed.
- `renderers/vector/outline.ts`: canvases come from `makeCanvas`.
