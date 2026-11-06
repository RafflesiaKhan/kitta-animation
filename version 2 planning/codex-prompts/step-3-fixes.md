# Step 3 fixes from Claude's review

Read `version 2 planning/codex-prompts/shared-rules.md` and follow it. This is a small fix round, so one implementer and one fresh reviewer are enough. Don't start step 4.

Each of items 1-4 was reproduced against commit `e6d6806`. Write its failing test first.

## Fix

1. **Real SVG files can't be used as sets.** Step 3 asks to "import an image or SVG, and pick one as a scene's set", but `staticSvg` in `server/sets.ts` refuses almost every file a design tool exports. These were all refused:
   - A Figma-style file: `clip-path`, `<clipPath>`.
   - An Illustrator-style file: `<!DOCTYPE svg PUBLIC …>`, `<style>`, `class`, `xmlns:xlink`, `xml:space`. Step 2 was fixed so these import, and they now fail when picked.
   - An Inkscape-style file: `<metadata>`, `sodipodi:*`, `style="…"`.
   - A simple file with only a `<title>` or `version="1.1"` added.

   Keep the allowlist and keep rebuilding the output from approved pieces, but widen it:
   - Drop without complaint: `<title>`, `<desc>`, `<metadata>`, `version`, `xml:space`, `xmlns:*`, and elements or attributes from editor namespaces such as `sodipodi:` and `inkscape:`.
   - Accept a `<!DOCTYPE>` with no internal subset. Still refuse one with `[…]` or any entity.
   - Add `clipPath`, `mask`, `pattern`, and `use`, with `clip-path`, `mask`, `filter`, and `href` or `xlink:href` allowed only as a local `#id` reference.
   - Add `filter` and the `fe*` primitives, except `feImage`.
   - Accept `style="…"` and `<style>` plus `class` when the CSS passes a strict check: only allowed properties and simple selectors, no `@` rules, no backslash escapes, and `url()` only for a local `#id`. If inlining the rules is simpler than passing CSS through, do that.
   - Keep refusing `<text>` for now. Fonts are off, so it would silently disappear.
   - Make the error name what was refused, for example `This SVG uses <text>, which sets don't support yet. Convert text to outlines, or use a PNG.`

   Test: fixtures shaped like each of the files above render, and they must really show their shapes. Every hostile case in `tests/server/sets.test.ts` is still refused before resvg sees it. Add hostile `use`, `style`, and `feImage` cases that point outside the file.

2. **A very small SVG can freeze the whole server.** `prepareSet` renders on the request thread with no time limit, and repeats that work every time a scene is opened or rendered.
   - A 2048 × 2048 file of repeated large circles with `stroke-dasharray="0.1"` took 12.6 s at 8 KB. A file near the 1 MB limit didn't finish in 2 minutes.
   - With a 4 KB file, an unrelated `GET /api/projects` took 6.2 s instead of under 1 ms, both when picking the set and again on reopening the scene.
   - Prepare SVG sets off the request thread, for example in a worker or a child process, with a time limit that ends in a clear `SetError`.
   - Prepare each set only once. Store the PNG beside the asset and reuse it for preview and render. An interrupted write must not leave a broken file.
   - The ffmpeg raster path also blocks through `spawnSync`, so give it the same treatment if it's simple to share. Mention it in your report if not.
   - Test: an over-limit SVG gets the clear error, other requests are answered while one is being prepared, and a second open doesn't prepare it again.

3. **A new scene's default placement shows the body's cut edge.** `EpisodeSceneForm` defaults the stage ground to 0.85, with the anchor at 1. Our characters are busts with no legs, so the flat bottom of the body hangs above the bottom of the frame: Max's edge is visible in an export at 0.9, and Kit's torso ends above the road with the hands dangling below it. Step 1 avoided this because the bottom of the box met the bottom of the frame.
   - Default the stage ground to 1, so a new scene hides the cut.
   - The form's hint should say that a value below 1 can show where the body ends.
   - Kit's drawing also extends past its box: the torso reaches about 1.03 of the box height and the hands about 1.13. Don't change the rig. Make sure the hint about the anchor doesn't promise that 1 is the very bottom of an SVG character.
   - Test the form default, then compare a browser screenshot with an exported frame for Kit and Max using default values. Neither should show a cut edge.

4. **SVG sets ignore their own scale.** A set with `viewBox="0 0 160 90"` becomes a 160 × 90 PNG, then gets stretched to fill the stage and blurs, which defeats the point of a vector set. A 3840 × 2160 file is refused, even though it could simply be drawn smaller.
   - Render every SVG set to fit inside 1920 × 1080, keeping its aspect ratio and using resvg's `fitTo`. Remove the 2048 limit on its stated size.
   - Keep a limit that stops absurd sizes from using too much memory.
   - Test: both of these files produce a PNG whose longer side fits 1920 × 1080 exactly.

5. **Small clean-up:** the client no longer calls `addProjectCharacter`, but `POST /:id/assets` still accepts `characterId`. A saved character added that way shows in Assets, can't be used in a scene, and doesn't appear in Characters. Remove that branch of the route and its orphaned tests. Keep reading older `character` asset records so old projects still open.

## Leave alone

- The Step 1 bundled set's path, which must stay hash-identical.
- One character per new scene, and silent scenes. Steps 4 and 5b cover those.
- The preview opening at time 0, before a gesture has started. Step 5b brings the timeline.
- Upscaling or cropping for images that aren't 16:9.

## Acceptance

1. Import the Figma-style, Illustrator-style, and Inkscape-style fixtures through the UI and use each as a set. Each one draws correctly in the preview and in an exported frame.
2. Repeat the hostile SVG check in the UI: no script runs, and a local probe server gets no request.
3. Pick a heavy SVG as a set, and confirm other requests still respond quickly and the UI shows the clear error.
4. A new Kit scene and a new Max scene, both on default values, show no cut edge, and each preview matches its export.
5. A `160 × 90` viewBox set is sharp in an exported frame.
6. Save the first scene in an episode, and confirm the render's frame hashes still match the step 1 export.
7. Today's four-step flow still works, including an export.

Write the report as `version 2 planning/codex-reports/step-3-fixes.md`. List every change, including small ones you made along the way.
