# Create a vector character in the app

Today "Create with AI" paints a picture with Gemini or OpenAI, then paints one more picture per expression and action. The character moves by fading from one picture to the next, so gestures jump instead of moving. A vector-avator character is built from parts on a skeleton (`feat/vector-avator`), so its arms bend, its head turns and its ears swing smoothly. The only vector character so far is the bundled sample, because making one needs the vector-avator skill run by hand in a coding agent.

This plan adds a second choice to the create form: **Picture** (today's flow) or **Vector (moves smoothly)**. The vector choice runs the skill's steps inside Kitta.

## How the skill makes a character, and what Kitta uses instead

| Skill step | Skill tool | In Kitta |
| --- | --- | --- |
| Notes on the character | Person writes them | The description in the create form, plus an optional reference picture |
| Front standing picture (A-pose, 2 to 2.5 heads tall, flat colours) | Codex imagegen | Kitta's image provider (OpenAI or Gemini), with a new prompt |
| Turnaround and face sheets | Codex imagegen | Same provider, as edits of the front picture. The face sheet matters most: it shows the eyes, mouths and expressions to draw. |
| Angle references (optional) | MiniMax H3 | Skipped |
| Drawing the parts as fill-only SVG paths, into `vector.json` | Fable 5.2 agent, about 25 minutes | **The Director model** (Claude by default), in a draw, check, fix loop run by the server |
| Checks | `check_parts.py` and the viewer | A TypeScript port of the main checks, plus check pictures drawn by the real renderer (`VectorStage` on `@napi-rs/canvas`) |

The skill warns that drawing the parts with a weaker model gives poor results, so the drawing model matters more than anything else here.

## The drawing loop

1. The server sends the model the parts spec (`parts-spec.md` and the drawing notes from the skill, vendored with the code), the sample `vector.json` as a worked example, the front picture and the sheets.
2. The model answers by calling one tool, `submit_vector(doc)`.
3. The server validates it: JSON shape, `prepareVector` parses every path, required parts and variants exist, pivots sit inside their parts, skeleton points sit on the picture, and so on.
4. The server draws check pictures with the real renderer: neutral overlaid on the front picture, eyes and mouths, the 4 expressions, head turned ±30°, and explain and point gestures. It sends them back with the list of problems.
5. The model fixes and submits again. It stops when there are no errors and it judges the pictures right, or after a set number of rounds (default 4). The best version so far is kept.

Each round is one long request with images, so a character takes several minutes. The skill's own run took about 280,000 tokens. Kitta records the tokens in the existing usage panel.

## Pieces to build

| Piece | Where | Notes |
| --- | --- | --- |
| Claude provider | `server/anthropic.ts` | Messages API with images and tool use. Key: `ANTHROPIC_API_KEY` (already in `.env.example`), model from `ANTHROPIC_MODEL`. Becomes one implementation of the shared LLM interface from the v2 plan. OpenAI is the fallback, labelled lower quality. |
| Vector prompts | `shared/character/vector-art.ts` | Front picture, turnaround sheet and face sheet prompts, adapted from the skill's `sheets/` layouts. |
| Checks | `shared/vector-avator/check.ts` | Port of the structural checks in `check_parts.py`; the pixel and layer checks become the check pictures. |
| Check pictures | `server/vector-check.ts` | One contact sheet PNG per round from `VectorStage`. |
| Creation job | `server/vector-create.ts` | Runs the steps in the background: front, sheets, drawing rounds, save. Progress, cancel, and resume after a failed request without paying for finished steps again. Work files in `data/characters/<id>/work/`. |
| API | `server/index.ts` | `POST /api/characters/vector` starts a job; `GET /api/characters/vector/jobs/:id` returns its stage, round, latest check picture and errors. |
| Form | `src/steps/CharacterStep.tsx` | "Type: Picture / Vector (moves smoothly)". Vector shows the steps as they finish and the latest check picture, and opens the character when done. Disabled with a message when there is no drawing model key. |
| Fix after creation | same | "Improve" sends the model a note from the person ("ears too small") for one more round. |

## Steps

| Step | Build | Acceptance check |
| --- | --- | --- |
| 1 | Claude provider and the validation and check pictures, run on the bundled sample | The sample passes the checks with 0 errors, and its check picture shows all expressions and both gestures. |
| 2 | The drawing loop as a command-line script on a fixed front picture and face sheet | One run produces a `vector.json` that Kitta imports, speaks a line with lip sync, and waves without broken parts. Record time, rounds and tokens. |
| 3 | Picture and sheet generation with OpenAI and Gemini | For three descriptions (a person, an animal, a robot), the front picture is front-facing, A-pose and flat, and the face sheet matches it. |
| 4 | Background job, API and form | Create a character from the form, close and reopen the app during the job, and the job finishes or can be resumed. Cancel stops spending. |
| 5 | Projects | Vector characters can be added to a project with the vector style (today they only appear outside projects). |

## Open decisions

- **Drawing model:** Claude (recommended, closest to the skill's Fable 5.2), with OpenAI as a fallback, or both offered in Settings.
- **Cost:** a character costs a few image generations plus one long multi-round drawing job. Show an estimate before starting.
- **Style:** the skill's common style draws characters as cute animals and creatures. Kitta needs a style setting per project (flat cartoon people, animals, mascots) that goes into the picture prompts.
- **Licence:** the skill's text and code are MIT. The sample character is for testing only, so it can be the worked example in the prompt but not a shipped starter.
