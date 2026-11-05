# Codex prompts for Kitta v2

Give Codex one prompt at a time, in this order. After each one, ask Claude to review it, for example "review step 2", and fix anything found before moving on.

| Order | Prompt | What it does |
|---|---|---|
| 1 | [00-save-draft-and-sync.md](00-save-draft-and-sync.md) | Saves the uncommitted draft in the other checkout and syncs to the branch. Run this first, once. |
| 2 | [step-2-projects-and-storage.md](step-2-projects-and-storage.md) | Projects, episodes, and storage. |
| 3 | [step-3-characters-and-sets.md](step-3-characters-and-sets.md) | Reusable characters and backgrounds. |
| 4 | [step-4-scripts-and-voices.md](step-4-scripts-and-voices.md) | Episode scripts, narration or dialogue, and voices. |
| 5 | [step-5a-scene-code-proposal.md](step-5a-scene-code-proposal.md) | A written proposal for how Kitta writes scene code. No code. |
| 6 | [step-5b-scene-editing.md](step-5b-scene-editing.md) | Placing the cast, poses, cameras, and shot timelines. |
| 7 | [step-6-settings-and-director.md](step-6-settings-and-director.md) | Bring-your-own-key Settings and the AI Director. |
| 8 | [step-7-editing-and-export.md](step-7-editing-and-export.md) | Scene order, transitions, audio mix, and episode export. |
| 9 | [step-8-wider-library.md](step-8-wider-library.md) | Props, creatures, and scene templates. |
| 10 | [step-9-full-body-motion.md](step-9-full-body-motion.md) | Optional: a test with one CMU walk clip. |

Paste the whole file as the prompt. Each one points Codex to [shared-rules.md](shared-rules.md), so you don't need to paste that too.

## Decisions for you

- **Before step 2:** does "desktop-first" mean today's local web app or a packaged desktop app? The step 2 prompt assumes the local web app. Change that line if you decide otherwise.
- **After step 5a:** read the proposal and write your choice under its "Owner's decision" heading before running step 5b.
- **Before step 9:** decide whether you want walking yet.
