# Step 3 fixes, round 2

Read `version 2 planning/codex-prompts/shared-rules.md` and follow it. This is a very small fix, so one implementer and one fresh reviewer are enough. Don't start step 4.

Everything else from `step-3-fixes.md` passed review. Only `server/set-svg.ts`, `package.json`, the lockfile, and the set tests should need to change.

## Fix

1. **Real Figma and Illustrator files are still refused, because of the underscore in their IDs.** `allowedValue` uses `/^[A-Za-z0-9#.,%+\-\t\n\r ]*$/` for `id`, which doesn't allow `_`. The `fragment` and `localUrl` checks do allow it, so a reference to `#clip0_12_34` passes while the element's own `id="clip0_12_34"` fails. Reproduced against `e25c4f7`:
   - Figma's usual IDs: `clip0_12_34`, `paint0_linear_12_34`, `filter0_d_12_34`. Result: `This SVG uses attribute id`.
   - Illustrator's usual root: `<svg id="Layer_1" …>`. Same result.
   - The filter attributes `result="effect1_dropShadow_12_34"` and `in2="effect1_dropShadow_12_34"` need the same fix.

   Allow `_` in `id`, `result`, `in`, and `in2`. Don't widen the check for other attributes.

2. **Common harmless markup is still refused.** Drop these without complaint, like `version` and `xml:space`:
   - Attributes: `data-*` (Illustrator writes `data-name="Layer 1"`), `aria-*`, `role`, `focusable`, `baseProfile`, and `font-*` on elements. `font-*` is safe to drop because `<text>` stays refused.
   - CSS comments (`/* … */`) in `<style>`. Remove them before checking the rules.
   - CSS properties that aren't on the list, when the value has no `url(`, for example `-inkscape-stroke`, `font-variation-settings`, and `marker`. A value with `url(` on an unlisted property stays refused. The existing `@` and backslash refusals still apply to the whole CSS text.

   Support these, because they change how the art looks and resvg can draw them:
   - `mix-blend-mode` and `isolation` as CSS properties and attributes.
   - `<symbol>` as an element, used through a local `use`.

3. **Tests must use realistic files.** The earlier fixtures avoided underscores, which is why this got through. Add fixtures with these shapes, and check a pixel that proves the art really drew:
   - Figma: `fill="none"` on the root, `clip-path="url(#clip0_12_34)"`, a `paint0_linear_12_34` gradient, and a `filter0_d_12_34` drop shadow using `feFlood`, `feColorMatrix`, `feOffset`, `feGaussianBlur`, and `feBlend`.
   - Current Illustrator: `<svg id="Layer_1" data-name="Layer 1" …>` with `<defs><style>.cls-1{fill:#369;}</style></defs>`.
   - Older Illustrator: the XML line, a `Generator` comment, `version`, `id="Layer_1"`, `xmlns:xlink`, `x="0px"`, `style="enable-background:new 0 0 1280 720;"`, `xml:space="preserve"`, and `<style type="text/css">`.
   - Inkscape: a `style` value that includes `mix-blend-mode:normal;-inkscape-stroke:none;font-variation-settings:normal`.

   Add hostile cases too: `data-x="javascript:1"` must not appear in the rebuilt markup, `marker:url(http://…)` is refused, and `id="a b"` plus `id='a" onload="x'` stay refused. Every existing hostile test must still pass.

4. **Server code now needs `jsdom` and `tsx` at run time, but both are dev dependencies.** `server/set-svg.ts` imports `jsdom`, and `server/sets.ts` starts a child with `--import tsx`. Move both to `dependencies`. Don't change versions.

## Leave alone

- `<text>`, `<image>`, animation, and complex CSS selectors stay refused, with the current clear errors.
- Everything else in Step 3, including the worker, cache, default placement, and SVG scaling. Those all passed.

## Acceptance

1. Import the Figma and current Illustrator fixtures through the UI and use each as a set. Each one draws correctly in the preview and in an exported frame.
2. Hostile SVG check: nothing runs, and a local probe server gets no request.
3. Save the first scene in an episode, and confirm the render's frame hashes still match the step 1 export.

Write the report as `version 2 planning/codex-reports/step-3-fixes-2.md`. List every change, including small ones you made along the way.
