# Step 5a: Proposal for how Kitta writes scene code

Read `version 2 planning/codex-prompts/shared-rules.md`. Then read `version 2 planning/first-scene-findings.md`, the "Open decisions" section of `version 2 planning/implementation-plan.md`, and `docs/superpowers/specs/2026-10-31-script-director-design.md`.

**Write no product code in this step. The owner makes this decision.**

## The question

The owner decided that in the SVG style, Kitta writes the code for each scene. Today, AI only picks from fixed expressions and actions, and fixed code draws the result. The script director design ruled out generating code at run time. We need to decide what generated code may do, and how it stays safe.

## Use subagents

- One subagent studies what the current fixed approach can and can't express, using `SceneView`, `Character.tsx`, and marks.
- One subagent works out the safety and reliability risks of running generated SVG or code in the browser and in the export.
- One fresh subagent challenges the draft proposal before you finish it.

## Write

`version 2 planning/scene-code-proposal.md`, short enough to read in five minutes:

1. **What "writes code" could mean:** at least these three options, with a concrete example scene for each:
   - **Scene data:** AI writes structured data, and fixed code draws it.
   - **SVG markup:** AI writes SVG for sets and props, which is checked and cleaned before use, while characters stay on the rig.
   - **Runnable code:** AI writes code that runs for each scene.
2. **A comparison:** what each can show, how each keeps the export matching the preview, what can go wrong (script injection, broken output, slow frames, cost), and how much work it is.
3. **A recommendation:** one option, with your reasons and how it could grow later.
4. **How the owner's later OpenArt option fits:** without building it.
5. **Owner's decision:** leave this heading empty for the owner to fill in.

Base claims on this codebase. Test a small piece in a scratch folder outside the repo if it settles a question, such as whether `resvg` draws a given SVG feature, and say what you tested.

## Finish

Commit the proposal, and write the report as the shared rules describe, as `step-5a.md`. In its Acceptance section, list the claims you tested and those you didn't. Then stop for the owner.
