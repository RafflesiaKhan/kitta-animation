# Shared rules for every Kitta v2 prompt

Follow these rules for every step. If a step's prompt disagrees with them, the step's prompt wins.

## Read first

- `version 2 planning/product-plan.md`: what we're building.
- `version 2 planning/implementation-plan.md`: the steps, reuse list, storage, Settings, and motion notes.
- `version 2 planning/first-scene-findings.md`: what step 1 proved, and the owner's character decision.

The owner's decisions so far: SVG and AI characters are both supported with one style per project, characters are front-facing only for now, and motions are today's gestures and listener reactions. External image and video generation through the OpenArt MCP comes later, so don't build it.

## Branch

- Work on `test-cd/kitta-v2-first-scene`. Start with `git fetch origin` and `git pull --ff-only origin test-cd/kitta-v2-first-scene`.
- Commit small steps and push directly to this branch.
- Don't open a PR, merge to `main`, rebase pushed commits, or force-push.
- If the tree has changes you didn't make, stop and report them. Don't stash, overwrite, or delete them.

## Subagents

Use subagents for this work, and keep the main agent as coordinator:

1. **Planner:** reads the code and writes a short task plan to `docs/superpowers/plans/<today>-v2-step-<N>.md`, listing files, signatures, and the tests for each task.
2. **Implementer, one per task:** builds one task with tests, commits it, and reports. Run implementers one at a time, so two never edit the same files.
3. **Reviewer, one fresh agent per task:** reads that task's diff against the plan and these rules. It never edits code, and it reports Critical, Important, and Minor findings with file and line. The implementer fixes Critical and Important findings, and the reviewer checks those fixes.
4. **Final reviewer:** reads the whole step's diff after the last task, using the most capable model available. Apply one round of fixes, then re-check them.

Give each subagent only what it needs: its task, the files involved, and the path to these rules. If subagents aren't available in your environment, do the same stages yourself in that order and say so in your report.

## Building

- Reuse before adding. `SceneView`, `frameAt`, marks, `CharacterView`, `renderScene`, `speakLine`, `runRhubarb`, and `paint` already exist.
- Preview and export must keep using the same `SceneView`, so they can't differ.
- Keep today's four-step flow working and reachable. Nothing removes it until the owner says so.
- No new dependency without the owner's approval. Keep to what the step asks, and match the existing style.
- Write the failing test first. Run `npx vitest run` and `npx tsc --noEmit -p .` before each commit.
- Tests must never call the real VoiceStudio or any paid API, and must clean up what they create in `data/`.

## Checking it for real

Check each acceptance item through the running app, not only through tests. The dev server uses fixed ports, 5173 and 5175, and a server from another checkout can answer instead of yours. Before trusting a browser result, confirm that the process on those ports runs from your checkout. Don't stop a process you didn't start without asking the owner.

If something can't be checked, write that plainly. Don't report it as passing.

## Safety

- Never print, log, or commit `.env` or API keys, and keys must never reach the browser.
- `data/` is gitignored and holds the owner's characters and audio. Don't delete anything there that your work didn't create.
- Don't run anything that spends money, including image generation, without the owner's approval. VoiceStudio is local and fine to use for the real checks.

## Decisions

Make small decisions yourself and record them. Stop and ask only for something destructive, something that spends money, or when every way forward would be a guess.

## Finish

Stop when this step is done. Don't start the next one.

Write `version 2 planning/codex-reports/step-<N>.md`, commit it, and push. It has:

- **Commits:** each short SHA and subject.
- **Acceptance:** one row per check, with what you did and what you saw.
- **Tests:** the final counts from both commands.
- **Decisions I made:** each with what it costs if wrong.
- **Not done or not verified:** say so plainly, or write "None".
- **Review findings left open:** with your reason for each.

End your reply with the report's path. The owner will ask Claude to review the step from that report.
