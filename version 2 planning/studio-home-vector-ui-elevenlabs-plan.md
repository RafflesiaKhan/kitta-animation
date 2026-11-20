# Character Studio home, vector characters in the UI, ElevenLabs voices

Three changes before more model testing. Kitta is a public repository, so the page people land on should be the part that works today (the Character Studio), and the unfinished parts should say so.

No new paid model runs are needed to build or check these. They are tested with the characters Kitta already has: the starters (Kit, Milo, Pip), the AI picture characters (Max, Pearl), and the vector characters (Kariusagi sample, Pearl (vector), Rusty).

## 1. Character Studio is the home page; Projects is Beta

| Today | After |
| --- | --- |
| `/` opens Projects | `/` opens the Character Studio |
| Character Studio is at `/?character-studio`, linked from Projects | Projects is at `/?projects`, a header button labelled **Projects** with a **Beta** badge |
| Character Studio header has a "Projects" link | Projects header has a "Character Studio" link back to the home page |

- Old links keep working: `/?character-studio` still opens the Character Studio.
- The Beta badge has a tooltip: "Projects is still being built: scenes, episodes and sets may change."
- Files: `src/main.tsx` (routing), `src/App.tsx` and `src/Projects.tsx` (header links), `src/styles.css` (badge).

**Check:** opening `/` shows the Character Studio; the Projects button shows "Beta" and opens Projects; `/?character-studio` and `/?scene=…` still work.

## 2. Vector characters in the UI

### 2a. Creating one: its own button with presets

Today a vector character is made from **Create with AI → Type: Vector**. That works but is easy to miss, and the two flows differ (time, cost, what you get). So:

- A separate tile, **Create vector character**, next to **Create with AI** (which becomes picture characters only).
- Its form:
  - **Kind** presets as buttons: Person, Animal, Robot, Mascot. Each fills the description with a starter text to edit (for example Animal: "A small [animal] with [main colour] fur and a [colour] scarf. Calm, friendly face."). The presets also choose the extra prompt rule that keeps the kind (a person stays a person).
  - **Description** (required unless a reference picture is given), **Name**, **Reference picture** (optional: redraw your own character).
  - **Pictures by** (OpenAI or Gemini, whichever has a key).
  - **Before you start**: time and cost estimate (5 to 10 minutes, about $1.50 to $2.50 with gpt-6.2-astra), and that it runs in the background.
- Disabled with a message when the drawing model has no key.
- The progress card, Cancel, Resume and Discard stay as built in step 4.

### 2b. Showing what a vector character is and can do

When a vector character is selected, show a sheet like the one the picture characters have (today it only shows a line of text and Remove):

| Section | Contents |
| --- | --- |
| How it was made | The front picture and the face sheet it was drawn from, and the final check picture (click to enlarge). The bundled sample has none of these, so the section is hidden for it. |
| Expressions | Live tiles for Kitta's 11 expressions, each with a note of what it shows: the character has 4 drawn faces (neutral, smile, surprised, troubled), so for example "angry → troubled" and "sleepy → neutral, half-closed eyes". |
| Talking | A tile that loops the mouth shapes (a, i, u, e, o, closed), so you see the lip sync. |
| Actions | Live tiles for the gestures: explain, point, think, shrug, celebrate, nod, wave, look down. |
| Head turn and blink | A tile that turns the head left and right and blinks. |
| Details | Number of parts, who drew it and when, and the cost from the job. |
| Actions on it | Remove; later **Improve** (send a note such as "ears too small" for one more drawing round). |

All tiles use the live renderer (`CharacterView`), so they show exactly what a scene will.

Files: `src/steps/CharacterStep.tsx` (new `VectorSheet`, new create form), `server/vector-create.ts` and `server/index.ts` (serve the pictures of a finished character, and its job details), `src/api.ts`.

**Check:** selecting Rusty shows its pictures, every expression, talking, gestures and head turn; selecting the sample shows the live tiles without the "How it was made" section; creating from the new button runs as before.

## 3. ElevenLabs as a voice option

Today the Voiceover step offers Gemini, OpenAI and VoiceStudio (local), each when it has a key or is running. ElevenLabs becomes the fourth.

| Piece | Where | Notes |
| --- | --- | --- |
| Key and model | `.env` | `ELEVENLABS_API_KEY` (you add it), `ELEVENLABS_MODEL` (default chosen when building, from ElevenLabs' current model list) |
| Speech | `server/elevenlabs.ts` | Text to speech for one line with the chosen voice; audio goes through the existing normalising and Rhubarb lip sync like the other voices. Errors map to the same messages (bad key, out of credit, busy). |
| Voices | same | The list of voices on your ElevenLabs account, shown in the voice picker when ElevenLabs is selected. Kitta's own voice names (the Gemini ones) map to a default ElevenLabs voice so existing scripts still speak. |
| Provider list | `shared/voices.ts`, `server/speech.ts` | `elevenlabs` added to the providers, offered when the key is set. |
| Cost | `shared/prices.ts`, `server/usage.ts` | ElevenLabs bills by characters, not tokens. Calls are recorded with their character count and priced from ElevenLabs' published rate, so they appear in the usage panel with a cost. |
| Tests | `tests/server/elevenlabs.test.ts` | Request shape, voice list, error mapping, usage; no real calls. |

**Check:** with the key set, the Voiceover step offers ElevenLabs, lists your voices, speaks a two-line script with lip sync, and the usage panel shows the calls and their cost. Without the key, ElevenLabs is not offered.

## Order

1. Home and Beta (small, no risk).
2. Vector character sheet (2b), then the separate create button and presets (2a).
3. ElevenLabs.

Each lands as its own commit, with tests and a check in the browser.

## Decisions (made 2026-11-20)

- **Vector create button:** a separate **Create vector character** tile with presets; **Create with AI** becomes picture characters only.
- **ElevenLabs voices:** the voices on the person's ElevenLabs account, fetched from it.
- **Projects while Beta:** fully usable behind a **Projects · Beta** header button.

## Later (after these, when we want polish)

- More drawing tests: the same character with each model at a quiet time (gpt-6.2-sol was cheapest at $0.81 but took 45 minutes on a busy day), and three new characters with the default model.
- Gemini pictures for vector characters (blocked today by the key's quota).
- Proportions of people (the teacher came out about 3.5 heads tall instead of 2 to 2.5) and a style setting per project.
- Improve after creation, and resuming a drawing from its last round instead of round 1.
- Step 5 of the vector plan: vector characters in Projects.
