# Save the uncommitted draft and sync to the branch

Work only in this checkout: `/Users/rafflesiakhan/Documents/ChatGPT/html-animated-vedio/slide/kitta-animation`

It's on a local branch named `test-cd/kitta-v2-first-scene`, at `c0dc4e5`, with uncommitted work: a first scene sample and the start of a projects feature. Meanwhile, another session finished step 1 and pushed it to `origin/test-cd/kitta-v2-first-scene`. Both versions include a `shared/SceneView.tsx`. Nothing may be lost.

This is a small task, so one agent is enough. Use a separate read-only subagent for the comparison in step 5 if you can.

1. Run `git status` and `git log -1`. If HEAD isn't `c0dc4e5`, or the branch has commits of its own, stop and report what you see.
2. Save the draft: `git switch -c codex/first-scene-draft`, stage the changed and untracked files by name, and commit them with the message `wip: first scene and projects draft`. Never stage `.env` or anything in `data/`. Push this branch to `origin` as a backup.
3. Sync: `git switch test-cd/kitta-v2-first-scene`, then `git pull --ff-only origin test-cd/kitta-v2-first-scene`. Stop and report if the fast-forward fails. Don't merge or force anything.
4. Run `npm install`, `npx vitest run`, and `npx tsc --noEmit -p .`. Report the results.
5. Compare `codex/first-scene-draft` with the branch, without changing either one. Write `version 2 planning/codex-reports/draft-comparison.md`, covering:
   - **First scene:** the pushed step 1 is the version we keep. List anything the draft does better, such as its browser "Generate" button or its sample's framing.
   - **Projects:** go through `server/projects.ts`, `shared/projects.ts`, `src/Projects.tsx`, and `tests/server/projects.test.ts`. Say what step 2 can reuse, what must change, and why. Step 2 is described in `version 2 planning/implementation-plan.md`.
6. Commit that report alone to `test-cd/kitta-v2-first-scene` and push it. Don't open a PR. Don't merge the draft in. Don't delete the draft branch.
7. A dev server from this checkout may be running on ports 5173 and 5175. If you can tell it's safe, restart it so it serves the synced code. Otherwise tell the owner to restart it.

End your reply with the comparison report's path and any step that didn't go as written.
