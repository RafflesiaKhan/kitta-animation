# SVG character skill (phase A)

Read `version 2 planning/codex-prompts/shared-rules.md` and follow it, including the subagent stages. Then read `version 2 planning/svg-character-skill-plan.md`, which is the spec for this prompt.

## Goal

Build an agent skill that lets any coding agent draw a good-looking, **rigged**, original SVG character for Kitta in a flat 2D Indian village cartoon style. Prove it works with two sample characters. **Don't change app code in this step.** Loading packs into Kitta is phase B.

## Style references: style only

Look at the images in `gopal_var_svg_reference/`. They are frames from the *Gopal Bhar* TV series. Learn the **style** from them: flat fills, a dark ink outline, caricature proportions, a bulbous nose, expressive brows, and simple clothing with a few fold lines.

**Never reproduce those characters.** Don't copy their faces, signature outfits, or names, and don't trace them. Every character must be original. Don't commit the reference images: add `gopal_var_svg_reference/` to `.gitignore`.

## Build

1. **`skills/kitta-svg-character/SKILL.md`.** Give it YAML frontmatter with `name` and a `description` that says when to use it ("draw a new rigged SVG character for Kitta"). The body is the workflow: read the brief, pick starting shapes, write the parts, run `check-pack`, open the contact sheet and critique it against the style guide, then fix, for at most 3 rounds. The last stage reports what still looks off. Write it so Claude Code and Codex can both follow it, with no tool names specific to either agent.
2. **`style-guide.md`.** The style rules from the plan, made concrete:
   - outline colour and widths;
   - head-to-body ratio;
   - how to draw eyes, brows, noses, and hands;
   - a palette of 12–16 village colours;
   - a short "looks wrong when…" list, for example: lines of uneven width, gradients on skin, symmetric stiff poses, tiny heads, or more than one shade per material.
3. **`rig-contract.md`.** Document the canvas (1000 × 1000, feet baseline about y 970), part names, pivots, draw order, mouth shapes `A`–`H` and `X`, and the `pack.json` schema with expression parameters for all 11 expressions in `shared/types.ts`. Add a TypeScript type for `pack.json` in `skills/kitta-svg-character/pack.ts`, so phase B can import it.
4. **`shapes/`.** Write reusable starting parts that an agent adapts rather than drawing from nothing:
   - 3 body builds (thin, round, pear);
   - kurta, dhoti, saree, gamchha (scarf), and turban;
   - open, fist, and pointing hands;
   - the 9 mouths.
   They must be original and in the house style.
5. **`scripts/check-pack.ts`**, run with `npx tsx skills/kitta-svg-character/scripts/check-pack.ts <packDir>`.
   - Validate `pack.json` and the required parts. Check that each pivot is inside its part's bounds.
   - Run every SVG through the existing sanitizer, `staticSvg` in `server/set-svg.ts`. Exporting it is the only app-code change allowed in this step.
   - Render a contact sheet PNG with `@resvg/resvg-js`. It shows the neutral full body, the 11 expressions (drawn by applying the expression parameters to brows, lids, and mouth), the 9 mouths, a blink, and wave, point, and shrug arm poses (drawn by rotating the arm parts on their pivots).
   - Print a pass/fail list and the PNG path.
   - Add no new dependency.
6. **Two sample packs** in `skills/kitta-svg-character/examples/`, each made by following the skill yourself:
   - `trickster`: a stout, bald, clever village man with a kurta, dhoti, and scarf.
   - `village-woman`: a stern village woman with a saree and a clay pot.
   Both must be clearly original and must not resemble the reference characters' faces.
7. **Tests** in `tests/server/check-pack.test.ts`, which the existing vitest `node` project already picks up. Add `"skills"` to `include` in `tsconfig.json`, so the typecheck covers the skill. The tests check that:
   - a valid pack passes;
   - a missing mouth shape, a pivot outside its part, and a `<script>` element are each caught;
   - the contact sheet file is written and then cleaned up.

## Not in this step

Don't load packs into the app, change `Character.tsx` (or any other app code besides exporting `staticSvg`), or build anything for Blender. Don't use AI image generation or auto-tracing. Don't add a new dependency.

## Acceptance

1. `npx vitest run` and `npx tsc --noEmit -p .` pass.
2. Both sample packs pass `check-pack`. Share both contact sheet PNG paths in your report. The owner decides whether they look good enough, so say plainly that this judgment is theirs.
3. Write the report to `version 2 planning/codex-reports/svg-character-skill.md`. It covers what you built, how many fix rounds each sample took, what still looks weak, and the changes to the rig contract that phase B will need.
4. The existing characters, sets, and scenes are unchanged.
