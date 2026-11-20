# Codex prompts for Kitta v2

Give Codex one prompt at a time, in this order. After each one, ask Claude to review it, for example "review step 4". Claude fixes tiny problems itself and writes a fix prompt only for real ones.

## Done

| Prompt | What it did |
|---|---|
| [00-save-draft-and-sync.md](00-save-draft-and-sync.md) | Saved the draft in the other checkout and synced it to the branch. |
| [step-2-projects-and-storage.md](step-2-projects-and-storage.md), [step-2-fixes.md](step-2-fixes.md) | Projects, episodes, and storage. |
| [step-3-characters-and-sets.md](step-3-characters-and-sets.md), [step-3-fixes.md](step-3-fixes.md), [step-3-fixes-2.md](step-3-fixes-2.md) | Reusable characters and backgrounds. |

## Next: a usable v2 in three runs

| Order | Prompt | What it does |
|---|---|---|
| 4 | [step-4-talking-scene.md](step-4-talking-scene.md) | Script, voices, several characters, poses, and camera cuts in one scene, built in the app. |
| 5 | [step-5-settings-and-director.md](step-5-settings-and-director.md) | Bring-your-own-key Settings, and the AI Director that drafts scripts, scenes, and backgrounds. |
| 6 | [step-6-editing-and-export.md](step-6-editing-and-export.md) | Scene order, transitions, audio mix, and whole-episode export. |

## Vector characters

| Order | Prompt | What it does |
|---|---|---|
| on `feat/vector-avator` | [vector-create.md](vector-create.md) | "Create with AI" can make a vector character that moves smoothly: the image provider paints a front picture and a face sheet, then Claude draws the parts. Stops after task 3 for your quality check. |

## Later, after you've used it

| Order | Prompt | What it does |
|---|---|---|
| 7 | [step-7-wider-library.md](step-7-wider-library.md) | Props, creatures, and scene templates. |
| 8 | [step-8-full-body-motion.md](step-8-full-body-motion.md) | Optional: a test with one CMU walk clip. Decide first whether you want walking yet. |

Paste the whole file as the prompt. Each one points Codex to [shared-rules.md](shared-rules.md), so you don't need to paste that too.
