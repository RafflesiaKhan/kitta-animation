# Kitta Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local web app with three steps: pick a starter cartoon character and customize it, add a voiceover (uploaded audio or a Gemini-generated script with per-line expressions), and preview and export a lip-synced MP4.

**Architecture:** A Vite + React frontend and a small Express server in one package. All character drawing and animation timing lives in `shared/` as pure functions: React SVG components plus `frameAt(timeline, ms)`. The browser preview and the server-side export therefore draw identical frames. The server owns secrets and command-line tools: Gemini, Rhubarb, ffmpeg, and resvg for rasterizing frames.

**Tech Stack:** Node 26, TypeScript, React 18, Vite, Express, Vitest + @testing-library/react, `@google/genai`, `@resvg/resvg-js`, `multer`, ffmpeg (Homebrew, already installed), Rhubarb Lip Sync 1.14.0 (macOS zip, vendored by a script).

**Spec:** `docs/superpowers/specs/2026-10-23-kitta-animation-design.md`

## Global Constraints

- Runs locally on Apple Silicon macOS. No NVIDIA GPU, no cloud hosting.
- Upload audio → lip sync → export must work with **no** `GEMINI_API_KEY` set.
- The Gemini key is read only on the server, from `.env`. `.env` is gitignored, and the key never appears in any response or frontend bundle.
- Expressions: `neutral | happy | sad | surprised | angry`. Gestures: `none | wave | nod | lookDown`. Mouth shapes: Rhubarb's `A B C D E F G H X`.
- Video: 30 fps, 1920×1080 or 1080×1920, MP4 (H.264 + AAC). Transparent option: WebM (VP9 with alpha).
- Maximum audio length is 180 000 ms (3 minutes).
- Model IDs come from env: `GEMINI_TTS_MODEL` (default `gemini-3.8-flash-tts`) and `GEMINI_TEXT_MODEL`. The defaults are unverified, so check them against current Gemini docs in Task 6.
- Layout is the simple step flow: Character → Voiceover → Export. No timeline editor.

## Review Focus

1. **Wrong file type or a corrupt upload** (e.g. a renamed `.txt`). The user expects a clear "couldn't read this audio" message, not a server crash. Test is in Task 3.
2. **Audio longer than 3 minutes.** The user expects it to be rejected up front with the limit stated. Test is in Task 3.
3. **No Gemini key, or the Gemini free-tier limit hit (HTTP 429).** The script tab and Auto-tag should show "Gemini key missing" or "Free Gemini limit reached, try again later", while upload and export keep working. Tests are in Tasks 6 and 7.
4. **The LLM returns an expression or gesture outside the allowed list.** It should be coerced to `neutral` / `none`, never crash the renderer. Test is in Task 7.
5. **Exported video drifting out of sync with the audio.** The frame count must equal `ceil(durationMs * 30 / 1000)`, and each frame must use `frameAt(i * 1000/30)`. Test is in Task 5.

---

## File Structure

```
package.json, tsconfig.json, vite.config.ts, vitest.config.ts, .env.example, .gitignore, README.md
scripts/setup-rhubarb.sh          downloads Rhubarb 1.14.0 macOS into vendor/rhubarb/
shared/types.ts                   all shared types (below)
shared/timeline.ts                frameAt(): pure animation state at a time
shared/character/mouth.ts         mouthPath(shape, expression): parametric mouth SVG path
shared/character/starters.ts      the 3 starter characters + customization option lists
shared/character/Character.tsx    <Character config frame /> pure SVG
server/index.ts                   Express app + routes (createApp() exported for tests)
server/audio.ts                   ffmpeg: normalize, probe duration, concat with gaps
server/rhubarb.ts                 run Rhubarb CLI, parse cues
server/gemini.ts                  tts, autoTag, transcribe (Gemini SDK wrapper)
server/render.ts                  frames → resvg → ffmpeg → mp4/webm
src/main.tsx, src/App.tsx         stepper
src/api.ts                        typed fetch wrappers for /api/*
src/steps/CharacterStep.tsx
src/steps/VoiceoverStep.tsx       tabs: UploadTab, ScriptTab
src/steps/ExportStep.tsx
src/Preview.tsx                   audio element + rAF loop drawing <Character>
tests/…                           mirrors the tree above
tests/fixtures/hello.wav          short spoken clip (generate with `say -o` + ffmpeg)
data/                             runtime audio/exports (gitignored)
```

### Shared types (`shared/types.ts`, defined in Task 1, used everywhere)

```ts
export type Expression = 'neutral' | 'happy' | 'sad' | 'surprised' | 'angry';
export type Gesture = 'none' | 'wave' | 'nod' | 'lookDown';
export type MouthShape = 'A'|'B'|'C'|'D'|'E'|'F'|'G'|'H'|'X';
export const EXPRESSIONS: Expression[]; export const GESTURES: Gesture[];
export interface MouthCue { startMs: number; endMs: number; shape: MouthShape }
export interface Line { text: string; startMs: number; endMs: number; expression: Expression; gesture: Gesture }
export interface Timeline { durationMs: number; cues: MouthCue[]; lines: Line[] }
export interface FrameState { expression: Expression; mouth: MouthShape; gesture: Gesture; gestureProgress: number; blink: boolean; bob: number }
export type StarterId = 'kit' | 'milo' | 'pip';
export interface CharacterConfig { starter: StarterId; skin: string; hairStyle: string; hairColor: string; eyeStyle: string; outfit: string; outfitColor: string }
export interface ScriptLineInput { text: string; voice: string; expression: Expression; gesture: Gesture; note?: string }
export type ExportFormat = { aspect: '16:9' | '9:16'; transparent: boolean };
```

---

### Task 1: Project scaffold, shared types, timeline

**Files:**
- Create: the root config files, `shared/types.ts`, `shared/timeline.ts`
- Test: `tests/shared/timeline.test.ts`

**Interfaces:**
- Produces: all types above; `frameAt(t: Timeline, ms: number): FrameState`; `FPS = 30`; `frameCount(durationMs: number): number`.

- [ ] **Step 1:** Run `git init`. Create `package.json` with scripts `dev` (runs `vite` and `tsx watch server/index.ts` together via `concurrently`), `test` (`vitest run`) and `setup` (`bash scripts/setup-rhubarb.sh`). Vite proxies `/api` to the server on port 5175. Gitignore `.env`, `node_modules`, `vendor/`, `data/` and `.superpowers/`.
- [ ] **Step 2: Write failing tests** in `tests/shared/timeline.test.ts`:
  - `frameAt` returns the cue's shape inside a cue and `'X'` between cues or after the end.
  - The expression is the containing line's; between lines it is the previous line's; before the first line it is `'neutral'`.
  - `gesture` applies only inside its line, with `gestureProgress === (ms - startMs) / (endMs - startMs)` and `'none'` outside.
  - `blink` is deterministic: the same `ms` always gives the same value; it is true for 150 ms in every 3 500 ms window starting at 3 350 ms.
  - `bob` is within [-2, 2].
  - `frameCount(1000) === 30` and `frameCount(1001) === 31`.
- [ ] **Step 3:** Run `npx vitest run tests/shared/timeline.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 4:** Implement `shared/types.ts` and `shared/timeline.ts`. Look up cues and lines by binary search, since the arrays are sorted by `startMs`. Use `bob = 2 * sin(2π · ms / 3000)`.
- [ ] **Step 5:** Run the tests. Expected: PASS.
- [ ] **Step 6:** Commit with message `feat: scaffold project with shared timeline`.

### Task 2: Starter characters with expressions and customization

**Files:**
- Create: `shared/character/mouth.ts`, `shared/character/starters.ts`, `shared/character/Character.tsx`
- Test: `tests/shared/character.test.tsx`

**Interfaces:**
- Consumes: `FrameState`, `CharacterConfig`, `Expression`, `MouthShape` (Task 1).
- Produces: `mouthPath(shape: MouthShape, expression: Expression): string`; `STARTERS: Record<StarterId, CharacterConfig & { name: string }>`; `OPTIONS: { hairStyles: string[]; eyeStyles: string[]; outfits: string[] }` (3 or more each); `<Character config={CharacterConfig} frame={FrameState} width height />` rendering a single `<svg viewBox="0 0 1000 1000">`.

The mouths are generated by formula instead of drawn 45 times. `mouthPath` builds each Rhubarb shape: A is closed "M/B/P", B is slightly open, C is open, D is wide open, E is rounded, F is puckered, G is "F/V" with teeth on the lip, H is "L" with the tongue showing, X is at rest. The expression then bends the shape: happy turns the corners up, sad turns them down, surprised makes it taller and rounder, angry makes it flatter and wider. Expressions also set the brows (angle and height) and eyes (happy = curved, surprised = larger). Gestures: `wave` rotates the right arm with `sin(progress·4π)·25°`; `nod` sets head y-offset to `sin(progress·2π)·12`; `lookDown` moves the pupils down 8 units and lowers the head by 6. `blink` replaces the eyes with closed lines. `bob` translates the whole body on y.

- [ ] **Step 1: Write failing tests:**
  - `mouthPath('A','happy') !== mouthPath('A','sad')`.
  - Every shape × expression pair (45 of them) returns a non-empty path starting with `M`.
  - Rendering each starter with each expression doesn't throw and contains `<svg`.
  - Changing `hairColor` to `#123456` makes `#123456` appear in the rendered markup.
  - `blink: true` renders no element with `data-part="pupil"`.
  - For `wave` at progress 0.125, the element with `data-part="arm-right"` has a non-zero rotation.
  - `Object.keys(STARTERS).length === 3`.
- [ ] **Step 2:** Run `npx vitest run tests/shared/character.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement the three files. The three starters must look clearly different: **Kit** is a round-faced kid, **Milo** a tall teen with glasses as an eye style, **Pip** a small animal-like mascot with ears. Use thick dark outlines and flat colours to match the mockup. Give every part a `data-part` attribute.
- [ ] **Step 4:** Run the tests. Expected: PASS. Then add a temporary dev page that renders all starters × expressions and check them by eye in the browser.
- [ ] **Step 5:** Commit with message `feat: starter SVG characters with expressions and gestures`.

### Task 3: Audio upload and lip sync on the server

**Files:**
- Create: `scripts/setup-rhubarb.sh`, `server/audio.ts`, `server/rhubarb.ts`, `server/index.ts`
- Test: `tests/server/audio.test.ts`, `tests/server/rhubarb.test.ts`, `tests/server/api-lipsync.test.ts`, `tests/fixtures/hello.wav`

**Interfaces:**
- Consumes: `MouthCue` (Task 1).
- Produces:
  - `normalizeAudio(inputPath: string, id: string): Promise<{ path: string; durationMs: number }>` converts to 16-bit mono WAV at 44.1 kHz in `data/audio/<id>.wav`, and throws `AudioError('unreadable' | 'too_long')`.
  - `parseRhubarbJson(json: string): MouthCue[]`.
  - `runRhubarb(wavPath: string, dialogText?: string): Promise<MouthCue[]>` uses `-f json --extendedShapes GHX` and, when dialog is given, `--dialogFile`.
  - `createApp(): Express` with these routes:
    - `POST /api/audio` (multipart field `file`) returns `{ audioId, durationMs }`, or 400 `{ error }`.
    - `GET /api/audio/:id` streams the WAV.
    - `POST /api/lipsync { audioId, dialog? }` returns `{ cues }`.
    - `GET /api/health` returns `{ rhubarb: boolean, gemini: boolean }`.

- [ ] **Step 1:** Write `scripts/setup-rhubarb.sh`. It downloads `Rhubarb-Lip-Sync-1.14.0-macOS.zip` from the GitHub release into `vendor/rhubarb/`, runs `xattr -dr com.apple.quarantine` on it, and does nothing if it's already present. Run it, then `vendor/rhubarb/rhubarb --version`. Expected output: `1.14.0`. Create the fixture with `say -o hello.aiff "Hello there, welcome back"` followed by ffmpeg conversion to `tests/fixtures/hello.wav`.
- [ ] **Step 2: Write failing tests:**
  - `parseRhubarbJson` maps `{mouthCues:[{start:0,end:0.12,value:'X'}]}` to `[{startMs:0,endMs:120,shape:'X'}]`.
  - `normalizeAudio(fixture)` returns `durationMs` within ±100 ms of the fixture's real length.
  - A text file renamed to `.mp3` makes it throw `AudioError` with code `unreadable` (Review Focus 1).
  - A generated 181-second silent WAV makes it throw `too_long` (Review Focus 2).
  - API: uploading the fixture returns 200 with an `audioId`; uploading the bad file returns 400 with an `error` containing "couldn't read"; lipsync on the fixture returns at least 3 cues, all with shapes from the allowed list and sorted in time.
- [ ] **Step 3:** Run `npx vitest run tests/server`. Expected: FAIL.
- [ ] **Step 4:** Implement. Use ffmpeg/ffprobe via `child_process.execFile`, never with shell strings. Use `multer` writing to `data/uploads/`. Generate IDs with `crypto.randomUUID()`, and only ever resolve a client-supplied `audioId` against `data/audio/` after checking it is a UUID.
- [ ] **Step 5:** Run the tests. Expected: PASS.
- [ ] **Step 6:** Commit with message `feat: audio upload and Rhubarb lip sync API`.

### Task 4: The step flow, Character step, Upload tab and preview (first usable milestone)

**Files:**
- Create: `src/main.tsx`, `src/App.tsx`, `src/api.ts`, `src/steps/CharacterStep.tsx`, `src/steps/VoiceoverStep.tsx` (Upload tab only for now), `src/Preview.tsx`
- Test: `tests/ui/character-step.test.tsx`, `tests/ui/preview.test.tsx`

**Interfaces:**
- Consumes: `<Character>`, `STARTERS`, `OPTIONS`, `frameAt`, and the Task 3 routes.
- Produces:
  - App state `{ character: CharacterConfig; timeline: Timeline | null; audioId: string | null }`, held in `App.tsx` and passed down as props.
  - `api.uploadAudio(file): Promise<{audioId,durationMs}>`, `api.lipsync(audioId, dialog?): Promise<MouthCue[]>`.
  - `<Preview character timeline audioUrl />`.

The layout follows mockup A (`.superpowers/brainstorm/40923-1792786046/content/layout.html`): pills for 1 Character / 2 Voiceover / 3 Export; a character grid plus customization controls on the left and a large preview on the right. In the Upload tab, picking a file uploads it, runs lip sync, and builds a timeline with one line spanning the whole clip (`neutral`, `none`).

- [ ] **Step 1: Write failing tests:**
  - Clicking the "Milo" tile changes the preview's `starter`.
  - Picking a hair colour updates the rendered SVG fill.
  - With fake timers and `audio.currentTime = 0.5`, `<Preview>` renders the mouth shape of the cue that covers 500 ms.
  - Upload errors from the API are shown as text in the Upload tab.
- [ ] **Step 2:** Run `npx vitest run tests/ui`. Expected: FAIL.
- [ ] **Step 3:** Implement. `Preview` drives a `requestAnimationFrame` loop that reads `audio.currentTime * 1000`, so the audio element is the master clock and frames can't drift from it.
- [ ] **Step 4:** Run the tests. Expected: PASS. Then run `npm run dev`, upload `tests/fixtures/hello.wav`, and confirm by eye that the mouth moves in time and blinking and breathing happen.
- [ ] **Step 5:** Commit with message `feat: character step, audio upload and live preview`.

### Task 5: Video export

**Files:**
- Create: `server/render.ts`, `src/steps/ExportStep.tsx`; Modify: `server/index.ts` (add the route)
- Test: `tests/server/render.test.ts`

**Interfaces:**
- Consumes: `<Character>`, `frameAt`, `frameCount`, `FPS`, `ExportFormat`.
- Produces:
  - `renderVideo(opts: { character: CharacterConfig; timeline: Timeline; audioPath: string; format: ExportFormat; outPath: string; onProgress?: (frame: number, total: number) => void }): Promise<void>`.
  - `POST /api/export { character, timeline, audioId, format }` streams progress as NDJSON `{progress}` lines, then `{done, url}`; the file is served from `GET /api/exports/:file`.

For each frame `i`, call `frameAt(timeline, i*1000/FPS)`, then `renderToStaticMarkup(<Character/>)` at the target size. The character is centred, filling 80% of the frame height, on a white background unless `transparent`. Rasterize with resvg and write raw RGBA to ffmpeg's stdin (`-f rawvideo -pix_fmt rgba -s WxH -r 30 -i - -i audio.wav`). Output MP4 uses `libx264 -pix_fmt yuv420p` + `aac -shortest`; output WebM uses `libvpx-vp9 -pix_fmt yuva420p` + `libopus`.

- [ ] **Step 1: Write failing tests** (Review Focus 5):
  - Rendering the fixture timeline to MP4 at 16:9 gives an ffprobe stream size of 1920×1080 and an `nb_frames` equal to `frameCount(durationMs)`.
  - The audio stream's duration is within ±50 ms of the video's.
  - A 9:16 render gives 1080×1920.
  - A transparent render gives a WebM whose `pix_fmt` (or the `alpha_mode` tag) shows alpha.
- [ ] **Step 2:** Run `npx vitest run tests/server/render.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `render.ts`, the route, and `ExportStep` (aspect toggle, transparent checkbox, progress bar, download link).
- [ ] **Step 4:** Run the tests. Expected: PASS. Then export a video from the UI and watch it in QuickTime to check lip sync by eye.
- [ ] **Step 5:** Commit with message `feat: MP4/WebM export rendered from shared frames`.

### Task 6: Script tab with Gemini voices

**Files:**
- Create: `server/gemini.ts`; Modify: `server/audio.ts` (add concat), `server/index.ts`, `src/steps/VoiceoverStep.tsx` (add ScriptTab), `src/api.ts`
- Test: `tests/server/gemini.test.ts`, `tests/server/api-tts.test.ts`, `tests/ui/script-tab.test.tsx`

**Interfaces:**
- Consumes: `ScriptLineInput`, `Line`, `normalizeAudio`, `runRhubarb`.
- Produces:
  - `class GeminiError { code: 'no_key' | 'rate_limited' | 'failed' }`.
  - `tts(line: ScriptLineInput): Promise<Buffer>` returns a WAV. Gemini TTS returns 24 kHz 16-bit mono PCM; wrap it in a WAV header.
  - `concatWithGaps(wavs: Buffer[], gapMs: 250): Promise<{ path; durationMs; spans: {startMs,endMs}[] }>`.
  - `VOICES: string[]`, a few Gemini prebuilt voice names.
  - `POST /api/tts { lines: ScriptLineInput[] }` returns `{ audioId, durationMs, lines: Line[], cues }`. It runs lip sync with the joined script text as dialog. On failure it returns 400 `{error:'Gemini key missing — add GEMINI_API_KEY to .env'}` or 429 `{error:'Free Gemini limit reached, try again later'}`.

Prompt for each line: `Say in a ${expression} tone${note ? ', ' + note : ''}: ${text}`. Inline tags such as `<short pause>` pass through unchanged. Lines with empty or whitespace-only text are rejected with 400 `{error:'Line N is empty'}`.

- [ ] **Step 1:** Check the current Gemini TTS model ID, voice names and free-tier availability in the Gemini API docs. Put what you find in `.env.example` and the README. If `gemini-3.8-flash-tts` isn't the right ID, use the correct one.
- [ ] **Step 2: Write failing tests**, with the SDK mocked using `vi.mock('@google/genai')`:
  - `tts` builds the prompt above and returns a buffer that starts with `RIFF`.
  - With no env key it throws `no_key`; when the SDK throws status 429 it throws `rate_limited` (Review Focus 3).
  - `concatWithGaps` on two 1 s clips gives `durationMs ≈ 2250`, with spans `[0,1000]` and `[1250,2250]` (±20 ms).
  - API: 2 lines give 200 with `lines[1].startMs ≥ lines[0].endMs`; an empty line gives 400; a 429 is passed through.
  - UI: add, delete and reorder lines; the expression dropdown lists `EXPRESSIONS`; an API error is shown inline.
- [ ] **Step 3:** Run `npx vitest run tests/server/gemini.test.ts tests/server/api-tts.test.ts tests/ui/script-tab.test.tsx`. Expected: FAIL.
- [ ] **Step 4:** Implement. The ScriptTab follows `voice-expressions.html`: line cards each with an expression chip, gesture chip and optional delivery note, a voice picker, and a "▶ Generate voice" button.
- [ ] **Step 5:** Run the tests. Expected: PASS. Then generate a 3-line script with a real key and check by eye that the face changes expression at each line.
- [ ] **Step 6:** Commit with message `feat: script-to-voice with Gemini TTS and per-line expressions`.

### Task 7: Auto-tag, and expressions for uploaded audio

**Files:**
- Modify: `server/gemini.ts`, `server/index.ts`, `src/steps/VoiceoverStep.tsx`, `src/api.ts`
- Test: `tests/server/autotag.test.ts`, `tests/ui/autotag.test.tsx`

**Interfaces:**
- Consumes: `GeminiError`, `EXPRESSIONS`, `GESTURES`.
- Produces:
  - `autoTag(texts: string[]): Promise<{ expression: Expression; gesture: Gesture }[]>`, using JSON-schema structured output constrained to the enums. It always returns the same length as the input.
  - `transcribe(wavPath: string): Promise<{ text; startMs; endMs }[]>`, sentence-level with timestamps.
  - `POST /api/autotag { texts }` and `POST /api/transcribe { audioId }`.

In the Script tab, "✨ Auto-tag expressions" fills the chips. The user can still change any chip afterwards. In the Upload tab, a new "✨ Add expressions" button runs transcribe, then autoTag, and replaces the single neutral line with tagged lines. If no key is set, the button is disabled with a tooltip "Needs GEMINI_API_KEY".

- [ ] **Step 1: Write failing tests**, with the SDK mocked:
  - The model returns `{expression:'excited', gesture:'jump'}`, and `autoTag` coerces it to `{expression:'neutral', gesture:'none'}` (Review Focus 4).
  - The model returns fewer items than lines; the missing ones are padded with neutral/none.
  - `transcribe` maps `"00:01.500"`-style or seconds timestamps to ms, sorted, with overlaps clipped.
  - UI: clicking Auto-tag updates every chip; with health `gemini:false` the button is disabled.
- [ ] **Step 2:** Run `npx vitest run tests/server/autotag.test.ts tests/ui/autotag.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the full suite with `npm test`. Expected: all PASS. Then try the whole flow by hand: upload → Add expressions → preview → export. Also try it with `GEMINI_API_KEY` removed and confirm upload → export still works.
- [ ] **Step 5:** Write the README (setup: `npm i`, `npm run setup`, copy `.env.example` to `.env`, `npm run dev`). Commit with message `feat: AI auto-tagging of expressions and gestures`.
