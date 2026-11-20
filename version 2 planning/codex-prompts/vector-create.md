# Create vector characters in the app

Read `version 2 planning/codex-prompts/shared-rules.md` and follow it, including the subagent stages. This prompt overrides its **Branch** section (see below). Then read, in `version 2 planning/`: `vector-create-plan.md` (the design for this work), `vector-avator-plan.md` (how vector-avator was added, and its status) and `first-scene-findings.md`.

## Branch

- Work on `feat/vector-avator`. Start with `git fetch origin`, `git checkout feat/vector-avator`, `git pull --ff-only origin feat/vector-avator`.
- The plan files above are on `ccr-273d813e-8aplah`, which is `feat/vector-avator` plus docs only. Bring them in with `git merge --ff-only origin/ccr-273d813e-8aplah`. If that isn't a fast-forward, stop and report.
- Commit small steps and push to `feat/vector-avator`. No PR, no force-push.

## Goal

Today "Create with AI" paints a picture per expression and action, so the character changes by fading between pictures and its gestures jump. A vector-avator character is made of parts on a skeleton, so it moves smoothly. Add a second choice to the create form, **Vector (moves smoothly)**, that makes a new vector-avator character inside Kitta: the image provider paints a front picture and a face sheet, then a drawing model draws the parts as `vector.json` in a draw, check, fix loop that the server runs.

## What exists

- `server/vector.ts`: vector characters in `data/characters/<id>/` (`meta.json` with `kind: 'vector'` plus `vector.json`), `importVectorCharacter`, `parseDoc`, `openStage`, and `useServerCanvas` (`@napi-rs/canvas`).
- `shared/vector-avator/`: the vendored renderer and core (commit `f28d35d` of github.com/grmchn/vector-avator, see `SOURCE.md`), `stage.ts` (`VectorStage`), `kitta.ts` (Kitta's mouths, expressions and gestures mapped onto vector-avator), and the sample `sample/usagi.vector.json`.
- `server/images.ts` (`paint`, `imageProviders`), `server/gemini.ts`, `server/openai.ts` (plain `fetch`, no SDK), `server/usage.ts` (usage panel), `server/characters.ts` (today's create flow, `toPng`).
- `src/steps/CharacterStep.tsx`: the tiles, "Add vector sample", and `CreateForm`.
- `.env.example` already has `ANTHROPIC_API_KEY`.

## The skill this replaces

Clone the source once, outside this repo: `git clone https://github.com/grmchn/vector-avator ../vector-avator && git -C ../vector-avator checkout f28d35d`. Its `.claude/skills/vector-avator/` holds the skill (in Japanese). The parts that matter:

- `references/parts-spec.md`: the `vector.json` format, part names, pivots, skeleton, arms, chains, expressions, and what to complete under other parts. **This is the drawing model's main instruction.**
- `references/fable-brief.md`: the brief the skill gives its drawing model. Its "rules" section is the core of the prompt here: draw parts from scratch, fill only (no strokes, the renderer draws outlines), complete hidden areas, don't draw arms (give skeleton points, widths and colours instead), `_L` and `_R` are the character's own sides, measure coordinates, keep shapes under about 80 segments.
- `references/drawing-workflow.md`, `visual-qa.md`, `troubleshooting.md`: what to check.
- `tools/vector/check_parts.py`: the checks to port.
- `tools/vector/sheets/` (`style_base.md`, `layouts/restyle.md`, the sheet layouts): the picture prompts to adapt.

The skill says a weaker drawing model gives poor parts. That's why the default drawing model is Claude.

## Spending

The owner approves real API calls for this work, up to **3 full drawing runs and 15 image generations** in total. Record each one (what, tokens, time) in the report. Ask before spending more. Tests never call a real API: mock `fetch`.

## Task 1: Claude provider

- `server/anthropic.ts`: the Messages API over plain `fetch`, like `server/openai.ts`. Key `ANTHROPIC_API_KEY`, model `ANTHROPIC_MODEL` (default `claude-opus-5-5`; list the models the key can use with `GET /v1/models` and record the choice). Add `ANTHROPIC_MODEL` to `.env.example`.
- Support images (base64 PNG), one tool (`submit_vector`), and **streaming**: one answer is a whole `vector.json` (the sample is about 80 KB), so non-streamed requests risk timeouts. Set `max_tokens` high enough for that and say what you chose.
- Use prompt caching for the parts spec, the worked example and the reference pictures, since every round resends them.
- Errors map to codes like `OpenAIError` (`no_key`, `bad_key`, `rate_limited`, `busy`, `timed_out`, `failed`). Record usage, including cache reads, in `server/usage.ts` as a new provider, and show it in the usage panel.
- The key never reaches the browser. `/api/config` (or wherever image providers are reported) says only whether a drawing model is available.

## Task 2: checks and check pictures

- Vendor the skill's `references/` into `shared/vector-avator/skill/` unchanged, and add them to `SOURCE.md` (MIT, same commit). The drawing prompt is built from these files.
- `shared/vector-avator/check.ts`: port the structural checks of `check_parts.py` (required parts and variant groups, ids, parents, pivots inside their parts, skeleton points present and on the picture, arm and chain definitions, expression entries point at existing variants, no strokes, segment counts). Return errors and warnings with part ids. Skip the Python script's pixel checks; the pictures below replace them.
- `server/vector-check.ts`: one contact-sheet PNG per round, drawn by `VectorStage` on `@napi-rs/canvas`: neutral, neutral at 50% over the front picture, eyes open, half and closed, each mouth, the 4 expressions, head at -30° and +30°, and the explain and point gestures, each labelled.
- Acceptance: the sample gives 0 errors, and its contact sheet looks right. Then break the sample in a few ways (missing part, pivot outside, a stroke) and confirm each is reported.

## Task 3: the drawing loop, from the command line

- `server/vector-draw.ts`: `drawVector({ front, faceSheet, turnaround?, notes, maxRounds = 4, onProgress })`. Round 1 sends the spec, the rules, the sample `vector.json` as a worked example (say its coordinates must not be copied), the pictures and the notes. Each later round sends the check errors and the new contact sheet and asks for a complete corrected `vector.json` through `submit_vector`. Keep the best version so far (fewest errors). Stop when there are no errors and the model says it's done, or at `maxRounds`.
- A JSON reply that doesn't parse, or a doc that `prepareVector` rejects, counts as a failed round with that error fed back, not a crash.
- `server/vector-draw-cli.ts` (an npm script) runs it on pictures in a folder and imports the result with `importVectorCharacter`.
- Try it first on the sample's own reference pictures in `../vector-avator/public/characters/usagi/vector/ref/` (`front.png`, `sheet_face.png`, `sheet_turnaround.png`). Don't commit those pictures: the sample's licence asks companies to contact the author.
- Acceptance: the result imports, speaks a line with lip sync in the Character step's preview, and plays wave, point and explain without holes or detached parts. Record rounds, time and tokens. **Then stop and report to the owner with the contact sheets before task 4**; the owner decides whether the quality is good enough to continue.

## Task 4: front picture and sheets

- `shared/character/vector-art.ts`: prompts adapted from the skill's `style_base.md`, `layouts/restyle.md` and sheet layouts. Front picture: one character, front view, standing A-pose with a gap under the arms, full body, 2 to 2.5 heads tall, flat colours, no outlines thicker than needed, no highlights in the eyes, plain magenta background like `shared/character/art.ts`. Face sheet: eyes open, half and closed; mouths closed, a, i, u, e, o; expressions neutral, smile, surprised, troubled. Turnaround: front, three-quarter, side, back, and the 4 hand shapes.
- The skill's common style turns every character into a cute animal. Kitta's prompts must keep the description's species (a person stays a person) and take the art style from the form.
- The skill uses a 1024×1536 portrait front picture. Check how `VectorStage` frames a doc by its `width` and `height`, and keep the picture's shape and the doc's coordinates the same.
- Sheets are edits of the front picture through `paint`, so the character stays the same.
- Acceptance: for a person, an animal and a robot description, with each configured image provider, the front picture is full-body, front-facing and in A-pose, and the face sheet matches it. Keep the pictures you judged, and say which failed.

## Task 5: background job, API and form

- `server/vector-create.ts`: a job per creation with stages (front, sheets, drawing round N of M, saving), saved to `data/characters/<id>/work/` after each stage, so a restart or a failed request resumes without paying for finished stages. Cancel stops further calls. One job at a time is fine.
- API: `POST /api/characters/vector` (description, name, style, image provider, optional reference picture) returns a job id; `GET /api/characters/vector/jobs/:id` returns stage, round, errors and the latest contact sheet URL; `POST .../cancel`; `POST .../resume`.
- `CreateForm` gets **Type: Picture / Vector (moves smoothly)**. Vector needs an image provider and a drawing model, otherwise it's disabled with a message naming the missing key. While running, show the stage, the round and the latest contact sheet, and keep the rest of the app usable. When done, select the new character.
- "Improve" on a vector character sends a short note ("ears too small") for one more round, keeping the previous `vector.json` until the new one passes the checks.
- Acceptance: create one character from the form; reload the page mid-job and see it continue; cancel a second job and confirm no further API calls.

## Task 6: projects

- Vector characters can be added to a project like AI characters (`server/projects.ts`, `src/ProjectCharacters.tsx`), and show in the Character step inside projects. Decide which project style they belong to and record it.
- Acceptance: put two vector characters in one scene; only the speaker's mouth moves, they never blink together, and the export matches the preview.

## Not in this work

Settings page and saved keys (step 5), the Director chat, Blender motions, and turning AI picture characters into vector ones.

## Finish

Write `version 2 planning/codex-reports/vector-create.md` as described in the shared rules, plus a **Spending** section (each real call, tokens, time) and the contact sheets' paths. If you stopped after task 3 for the owner's decision, the report covers tasks 1 to 3 only.
