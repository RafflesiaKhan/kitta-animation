# First Scene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export a short hardcoded scene with two characters, one set, VoiceStudio dialogue, and wide, speaker and reaction shots, then use it to decide what a v2 character is.

**Architecture:** A hand-written source file (`samples/first-scene/scene.json`) is voiced and resolved once into a saved `Scene`. Each actor in a `Scene` owns a normal `Timeline`, so `frameAt`, marks and `CharacterView` work unchanged. One `SceneView` component draws a scene at any millisecond, and both the browser preview and the MP4 export use it.

**Tech Stack:** TypeScript, React 18, Express, resvg, ffmpeg, Rhubarb, VoiceStudio, Vitest + Testing Library.

**Spec:** `version 2 planning/implementation-plan.md`, step 1 ("First scene") and "Open decisions".

## Global Constraints

- Today's Character → Voiceover → Animate → Export flow keeps working, and existing tests pass unchanged.
- No new dependencies, and no storage, project or editor UI: those are later steps.
- Every line goes through `speakLine('voicestudio', …)`, and tests never call the real VoiceStudio.
- The stage is `STAGE_W = 1920` × `STAGE_H = 1080`, 16:9 only, 30 fps (the existing `FPS`).
- Shots are hard cuts. No transitions or camera moves.
- Generated files stay in `data/scenes/` (already gitignored). Only the source file and set are committed.
- The sample stays original: its own characters, set and dialogue.

## Review Focus

1. A lip-sync cue that crosses from one speaker's line into the next → it is cut at the line's end, and the listener's mouth stays shut. (Task 2)
2. A zoomed shot aimed near the edge of the set → the camera stops at the edge, so nothing outside the set shows. (Task 2)
3. A typo in the source file (unknown actor, bad line number, first shot not at the start) → a clear error before any voice is generated. (Tasks 2, 5)
4. Two AI characters with pictures of the same file name → each actor draws its own picture. (Task 3)
5. VoiceStudio fails partway through → the command reports it and leaves no half-finished saved scene. (Task 5)

---

### Task 1: Idle timing per character

**Files:**
- Modify: `shared/motion.ts` (`blinkAt`), `shared/timeline.ts` (`frameAt`)
- Test: `tests/shared/timeline.test.ts`

**Interfaces:**
- Produces: `frameAt(t: Timeline, ms: number, idleOffsetMs = 0): FrameState` and `blinkAt(s: Speech | null, ms: number, idleOffsetMs = 0): boolean`.

- [ ] **Step 1: Write the failing tests**

```ts
const quiet: Timeline = { durationMs: 20000, cues: [], lines: [] };

it('shifts bob, sway, tilt and glance by the idle offset', () => {
  const shifted = frameAt(quiet, 5500, 9000), later = frameAt(quiet, 14500);
  expect([shifted.bob, shifted.sway, shifted.tilt, shifted.glance]).toEqual([later.bob, later.sway, later.tilt, later.glance]);
});
it('shifts the regular blinks but keeps phrase-end blinks on the real time', () => {
  for (let ms = 0; ms < 8000; ms += 10) expect(blinkAt(null, ms, 1000)).toBe(blinkAt(null, ms + 1000));
  const speech = { beats: [], spans: [], phraseEnds: [2000] };
  expect(blinkAt(speech, 2100, 5000)).toBe(true);
});
it('gives two offsets different blinks', () => {
  let differs = 0;
  for (let ms = 0; ms < 20000; ms += 33) if (frameAt(quiet, ms).blink !== frameAt(quiet, ms, 1900).blink) differs++;
  expect(differs).toBeGreaterThan(0);
});
it('leaves frames unchanged with no offset', () => {
  for (let ms = 0; ms < 4000; ms += 50) expect(frameAt(t, ms, 0)).toEqual(frameAt(t, ms));
});
```

- [ ] **Step 2: Run them**

Run: `npx vitest run tests/shared/timeline.test.ts`
Expected: the offset tests FAIL.

- [ ] **Step 3: Add `idleOffsetMs`**

`bob`, `sway`, `tilt` (its `drift` term only), `glanceAt` and the slot blinks in `blinkAt` read `ms + idleOffsetMs`. Mouth, talk, beats, marks and phrase-end blinks keep the real `ms`.

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/motion.ts shared/timeline.ts tests/shared/timeline.test.ts
git commit -m "feat: give each character its own idle timing"
```

### Task 2: Scene model

**Files:**
- Create: `shared/scene.ts`
- Test: `tests/shared/scene.test.ts`

**Interfaces:**
- Consumes: `marksFromLines`, `addExpression`, `addAction` from `shared/marks.ts`.
- Produces, in `shared/scene.ts`:

```ts
export const STAGE_W = 1920, STAGE_H = 1080;
export interface LineMoment { line: number; at: number } // `at` is 0..1 through that line
export interface SceneActorSource { id: string; character: CharacterConfig | { artId: string }; voice: string; speaker?: string; x: number; scale: number; flip?: boolean; idleOffsetMs: number }
export interface SceneLineSource { actor: string; text: string; expression: Expression; gesture: Gesture }
export interface ShotSource extends LineMoment { name: string; zoom: number; focusX: number; focusY: number } // focus is 0..1 of the stage
export interface ReactionSource extends LineMoment { actor: string; expression?: Expression; gesture?: ActionMark['gesture'] }
export interface SceneSource { title: string; background: string; actors: SceneActorSource[]; lines: SceneLineSource[]; shots: ShotSource[]; reactions: ReactionSource[] }

export interface SceneActor { id: string; character: AnyCharacter; x: number; scale: number; flip?: boolean; idleOffsetMs: number; timeline: Timeline }
export interface Shot { startMs: number; name: string; zoom: number; focusX: number; focusY: number }
export interface Scene { title: string; audioId: string; durationMs: number; background: string; actors: SceneActor[]; shots: Shot[] } // background is a data URI

export function sceneProblems(source: SceneSource): string[];
export function resolveScene(source: SceneSource, built: { audioId: string; durationMs: number; spans: { startMs: number; endMs: number }[]; cues: MouthCue[]; background: string; characters: Record<string, AnyCharacter> }): Scene;
export function cameraAt(scene: Scene, ms: number): { zoom: number; x: number; y: number; name: string };
```

- [ ] **Step 1: Write the failing tests**

Use two actors, `mina` and `rafi`, with `spans = [{ startMs: 0, endMs: 1000 }, { startMs: 1250, endMs: 2000 }]` and `cues = [{0,900,'D'}, {900,1100,'C'}, {1100,1250,'X'}, {1250,2000,'B'}]`.

```ts
it('gives each actor only its own lines and cues, cut at the line end', () => {
  expect(actor('mina').timeline.cues).toEqual([{ startMs: 0, endMs: 900, shape: 'D' }, { startMs: 900, endMs: 1000, shape: 'C' }]);
  expect(actor('rafi').timeline.cues).toEqual([{ startMs: 1250, endMs: 2000, shape: 'B' }]);
  expect(frameAt(actor('rafi').timeline, 500).mouth).toBe('X');
  expect(frameAt(actor('mina').timeline, 1500).mouth).toBe('X');
});
it('places a listener reaction by its line and position', () => {
  // reaction { actor: 'rafi', line: 0, at: 0.5, expression: 'worried', gesture: 'nod' }
  const t = actor('rafi').timeline;
  expect(frameAt(t, 400).expression).toBe('neutral');
  expect(frameAt(t, 600).expression).toBe('worried');
  expect(frameAt(t, 600).gesture).toBe('nod');
});
it('skips an action with no room, keeping the rest of the scene', () => { /* two gesture reactions at the same moment: one clip remains */ });
it('starts a shot at its line position', () => {
  // shots: wide at { line: 0, at: 0 }, close at { line: 1, at: 0.5 }
  expect(cameraAt(scene, 1624).name).toBe('wide');
  expect(cameraAt(scene, 1625).name).toBe('close');
});
it('aims the camera and stops it at the edges of the set', () => {
  expect(cam(1, 0.5, 0.5)).toMatchObject({ zoom: 1, x: 0, y: 0 });
  expect(cam(2, 0.25, 0.5)).toMatchObject({ x: 0, y: -540 });
  expect(cam(2, 0, 0)).toMatchObject({ x: 0, y: 0 });
  expect(cam(2, 1, 1)).toMatchObject({ x: -1920, y: -1080 });
});
it('names every problem in a bad source', () => {
  expect(sceneProblems(good)).toEqual([]);
  expect(sceneProblems({ ...good, lines: [{ ...line, actor: 'nobody' }] })).toContain('Line 1: unknown actor "nobody"');
  expect(sceneProblems({ ...good, shots: [{ ...shot, line: 9 }] })).toContain('Shot "wide": no line 9');
  expect(sceneProblems({ ...good, shots: [{ ...shot, at: 0.5 }] })).toContain('The first shot must start at line 0, at 0');
  expect(sceneProblems({ ...good, shots: [{ ...shot, zoom: 0.5 }] })).toContain('Shot "wide": zoom must be at least 1');
  expect(sceneProblems({ ...good, reactions: [{ actor: 'mina', line: 0, at: 2 }] })).toContain('Reaction 1: at must be 0..1');
  expect(sceneProblems({ ...good, lines: [] })).toContain('The scene has no lines');
});
```

`cam(zoom, focusX, focusY)` is a local helper that builds a scene with one shot and calls `cameraAt`.

- [ ] **Step 2: Run them**

Run: `npx vitest run tests/shared/scene.test.ts`
Expected: FAIL, module missing.

- [ ] **Step 3: Implement `shared/scene.ts`**

A moment is `startMs + at * (endMs - startMs)` of its line. An actor's marks start from `marksFromLines` of its own lines, then reactions apply in order through `addExpression` and `addAction`; `addAction` returning `null` leaves the marks as they were. Sort resolved shots by `startMs`. The camera offset is `STAGE_W / 2 - focusX * STAGE_W * zoom`, clamped to `[STAGE_W - STAGE_W * zoom, 0]`, and the same for y.

- [ ] **Step 4: Run them**

Run: `npx vitest run tests/shared/scene.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/scene.ts tests/shared/scene.test.ts
git commit -m "feat: scene model with per-actor timelines and shots"
```

### Task 3: SceneView

**Files:**
- Create: `shared/SceneView.tsx`
- Test: `tests/shared/scene-view.test.tsx`

**Interfaces:**
- Consumes: `Scene`, `cameraAt`, `STAGE_W`, `STAGE_H`; `frameAt(t, ms, idleOffsetMs)`; `CharacterView`.
- Produces: `SceneView({ scene, ms, width = STAGE_W, height = STAGE_H, resolve }: { scene: Scene; ms: number; width?: number; height?: number; resolve?: (characterId: string, file: string) => string })`.

- [ ] **Step 1: Write the failing tests**

Render with `renderToStaticMarkup` and check the resulting string, as `tests/shared/character.test.tsx` does.

```ts
it('moves only the speaker\'s mouth', () => { /* at 500 ms: mina data-shape="D", rafi data-shape="X" */ });
it('draws the set behind the actors, inside the camera', () => { /* data-part="set" comes before data-actor="mina"; both sit inside data-part="camera" */ });
it('applies the shot\'s camera', () => { /* at a 2× shot focused at 0.25, 0.5: transform="translate(0 -540) scale(2)" */ });
it('places an actor by x and scale, bottom-anchored', () => {
  // x 0.25, scale 1: box 864 → translate(48 216)
});
it('mirrors a flipped actor', () => { /* the actor's transform includes translate(864 0) scale(-1 1) */ });
it('resolves pictures per character', () => {
  // two art actors, both with images.neutral.file = 'neutral-a.png', ids 'a' and 'b'
  // resolve = (id, file) => `${id}/${file}` → the markup contains a/neutral-a.png and b/neutral-a.png
});
it('draws the same markup for the same millisecond', () => { /* two renders at 700 ms are equal */ });
```

- [ ] **Step 2: Run them**

Run: `npx vitest run tests/shared/scene-view.test.tsx`
Expected: FAIL, module missing.

- [ ] **Step 3: Implement `shared/SceneView.tsx`**

The root is `<svg xmlns viewBox="0 0 1920 1080" width height>`, holding `<g data-part="camera" transform="translate(x y) scale(zoom)">`, the set as `<image data-part="set" href={scene.background} width={STAGE_W} height={STAGE_H} />`, then one `<g data-actor={id}>` per actor. The actor's box is `Math.round(STAGE_H * 0.8 * scale)` square, centred on `x * STAGE_W`, with its bottom on the stage's bottom edge. `resolve` is passed to an art character as `(file) => resolve(character.id, file)`, and left undefined when not given, so the browser uses the existing API route. Do not change `CharacterView`.

- [ ] **Step 4: Run them**

Run: `npx vitest run tests/shared/scene-view.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/SceneView.tsx tests/shared/scene-view.test.tsx
git commit -m "feat: SceneView draws a scene at any moment"
```

### Task 4: Render a scene to video

**Files:**
- Modify: `server/render.ts`
- Test: `tests/server/render-scene.test.ts`

**Interfaces:**
- Consumes: `SceneView`, `Scene`, `frameAt`, `cameraAt`.
- Produces: `renderScene({ scene, images, audioPath, outPath, onProgress }: { scene: Scene; images?: Record<string, Record<string, string>>; audioPath: string; outPath: string; onProgress?: (frame: number, total: number) => void }): Promise<void>`. `images` is keyed by character id, then file name.

- [ ] **Step 1: Write the failing tests**

Use `tests/fixtures/hello.wav` (1840 ms) prepared as in `tests/server/render.test.ts`, a solid red SVG set as a data URI, a wide shot at 0 and a 2× shot at 900 ms.

```ts
it('renders 1920x1080 MP4 with the exact frame count and matching audio', async () => {
  expect([v.width, v.height]).toEqual([1920, 1080]);
  expect(parseInt(v.nb_read_frames)).toBe(frameCount(1840));
  expect(Math.abs(parseFloat(a.duration) - parseFloat(v.duration))).toBeLessThan(0.05);
}, 60_000);
it('shows the set where no actor stands', async () => { /* a pixel at the top-left corner decodes as mostly red */ }, 60_000);
it('cuts between shots', async () => { /* the same stage position differs between frames at 0.5 s and 1.2 s */ }, 60_000);
it('rejects when ffmpeg exits non-zero', async () => { /* an outPath in a missing folder rejects with 'ffmpeg failed' */ }, 60_000);
```

- [ ] **Step 2: Run them**

Run: `npx vitest run tests/server/render-scene.test.ts`
Expected: FAIL, `renderScene` missing.

- [ ] **Step 3: Share the encoder**

Move the ffmpeg setup and write loop out of `renderVideo` into a private `encodeFrames(size, format, audioPath, outPath, total, keyAt, svgAt, onProgress)`. `renderVideo` keeps its signature and behaviour. Keep the skip for identical consecutive frames.

- [ ] **Step 4: Add `renderScene`**

It calls `encodeFrames` with 1920×1080 and `{ aspect: '16:9', transparent: false }`. `svgAt(i)` is `renderToStaticMarkup(<SceneView scene={scene} ms={i * 1000 / FPS} resolve={(id, file) => images[id]?.[file] ?? ''} />)`. Use `createElement`, as `frameSvg` does, because `render.ts` isn't a `.tsx` file.

- [ ] **Step 5: Run the render tests**

Run: `npx vitest run tests/server/render-scene.test.ts tests/server/render.test.ts`
Expected: PASS, with `render.test.ts` unchanged.

- [ ] **Step 6: Commit**

```bash
git add server/render.ts tests/server/render-scene.test.ts
git commit -m "feat: render a scene to video with the shared encoder"
```

### Task 5: Build and save a scene

**Files:**
- Create: `server/scene.ts`, `server/scene-cli.ts`
- Modify: `package.json` (script `"scene": "tsx server/scene-cli.ts"`)
- Test: `tests/server/scene-build.test.ts`

**Interfaces:**
- Consumes: `sceneProblems`, `resolveScene`, `concatWithGaps`, `runRhubarb`, `plainText`, `getCharacter`, `imageDataUris`, `renderScene`, `speakLine`, `ensureVoiceStudio`.
- Produces, in `server/scene.ts`:
  - `SCENES_DIR = join('data', 'scenes')`
  - `class SceneError extends Error { problems: string[] }`
  - `buildScene(source: SceneSource, sourceDir: string, speak: (line: ScriptLineInput) => Promise<Buffer>): Promise<Scene>`
  - `saveScene(name: string, scene: Scene): Promise<void>`, writing `data/scenes/<name>/built.json`
  - `loadScene(name: string): Promise<Scene | null>`, returning `null` when the file is absent
  - `sceneImages(scene: Scene): Promise<Record<string, Record<string, string>>>`

- [ ] **Step 1: Write the failing tests**

`speak` is a `vi.fn` that resolves to `tests/fixtures/hello.wav`. Remove generated audio afterwards, as `tests/server/api-tts.test.ts` does.

```ts
it('voices each line with its actor\'s voice, in order', async () => {
  const scene = await buildScene(source, dir, speak);
  expect(speak.mock.calls.map(([l]) => [l.text, l.voice, l.speaker])).toEqual([['Hello', 'default', 'woman'], ['Hi', 'default', 'man']]);
  expect(speak.mock.calls[0][0].variability).toBe('steady');
  expect(scene.durationMs).toBeGreaterThan(0);
  expect(scene.background.startsWith('data:image/svg+xml;base64,')).toBe(true);
}, 30_000);
it('reports source problems before generating any voice', async () => {
  await expect(buildScene(bad, dir, speak)).rejects.toBeInstanceOf(SceneError);
  expect(speak).not.toHaveBeenCalled();
});
it('reports a missing background before generating any voice', async () => { /* SceneError, speak not called */ });
it('saves nothing when a voice fails', async () => {
  speak.mockRejectedValueOnce(new Error('down'));
  await expect(buildScene(source, dir, speak).then((s) => saveScene('t', s))).rejects.toThrow('down');
  expect(await loadScene('t')).toBeNull();
});
it('round-trips a saved scene', async () => { /* saveScene then loadScene returns an equal Scene; clean up */ });
it('loads the images of art actors, keyed by character id', async () => { /* use a temp character as tests/server/characters.test.ts does */ });
```

- [ ] **Step 2: Run them**

Run: `npx vitest run tests/server/scene-build.test.ts`
Expected: FAIL, module missing.

- [ ] **Step 3: Implement `server/scene.ts`**

Order: `sceneProblems`, then read the background (`.svg` or `.png`) and load `{ artId }` characters, then speak lines one at a time, `concatWithGaps`, `runRhubarb(path, dialog)` with the joined `plainText`, and `resolveScene`. A scene name must match `/^[a-z0-9-]{1,64}$/`, else `loadScene` returns `null` and `saveScene` throws `SceneError`.

- [ ] **Step 4: Implement `server/scene-cli.ts`**

`npm run scene -- <sourceDir> [--rebuild] [--art <characterId>]`:
1. Load `.env`. If `VOICESTUDIO_URL` is unset, print "Set VOICESTUDIO_URL in .env" and exit 1.
2. The scene name is the folder's name. `--art` replaces the first actor's character with `{ artId }` and adds `-art` to the name.
3. Use the saved scene unless `--rebuild` is given or none exists. To build, `ensureVoiceStudio()` must return true, else print "VoiceStudio isn't running" and exit 1. Then `buildScene` with `(line) => speakLine('voicestudio', line)`, and `saveScene`.
4. `renderScene` with `sceneImages(scene)` to `data/scenes/<name>/<name>.mp4`, printing progress.
5. Print `Rendered <n> frames in <s> s (<x>× realtime)` and the file path. A `SceneError` prints each problem on its own line and exits 1.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/server/scene-build.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/scene.ts server/scene-cli.ts package.json tests/server/scene-build.test.ts
git commit -m "feat: build, save and export a scene from the command line"
```

### Task 6: Scene preview page

**Files:**
- Create: `src/ScenePreview.tsx`
- Modify: `src/main.tsx`, `src/api.ts`, `server/index.ts`
- Test: `tests/ui/scene-preview.test.tsx`, `tests/server/api-scene.test.ts`

**Interfaces:**
- Consumes: `SceneView`, `loadScene`, the existing `/api/audio/:id` and `/api/characters/:id/:file` routes.
- Produces: `GET /api/scenes/:name` → the `Scene`, or 404 `{ error: 'Scene not found. Run npm run scene first.' }`. `api.getScene(name: string): Promise<Scene>`. `ScenePreview({ name }: { name: string })`. Opened at `http://localhost:5173/?scene=first-scene`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/server/api-scene.test.ts
it('returns 404 for a missing scene and for a bad name', async () => { /* 'no-such-scene' and 'BAD..NAME' both 404 with the error above */ });
it('returns a saved scene', async () => { /* saveScene, then GET it; clean up */ });

// tests/ui/scene-preview.test.tsx, with fake timers and a mocked fetch, as in tests/ui/preview.test.tsx
it('draws the scene at audio.currentTime', async () => {
  // audio.currentTime = 0.5 → mina's mouth D, rafi's X; audio src is /api/audio/<audioId>
});
it('shows the current shot name', async () => { /* the text "wide", then the next shot's name after moving currentTime */ });
it('shows the error when the scene is missing', async () => { /* role="alert" contains the server's message */ });
```

- [ ] **Step 2: Run them**

Run: `npx vitest run tests/server/api-scene.test.ts tests/ui/scene-preview.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement the route, `api.getScene`, and `ScenePreview`**

`ScenePreview` follows `Preview`: the `<audio>` element is the only clock, read every animation frame. Unlike `Preview`, a paused scene holds still, so it can be compared with a frame of the export. Show `SceneView` at 960×540, the audio controls, and the shot name.

- [ ] **Step 4: Choose the page in `src/main.tsx`**

Render `ScenePreview` when the URL has a `scene` parameter, otherwise `App`. `App.tsx` doesn't change.

- [ ] **Step 5: Run all tests and the type check**

Run: `npx vitest run && npx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ScenePreview.tsx src/main.tsx src/api.ts server/index.ts tests/ui/scene-preview.test.tsx tests/server/api-scene.test.ts
git commit -m "feat: scene preview page"
```

### Task 7: Make the sample and decide

**Files:**
- Create: `samples/first-scene/scene.json`, `samples/first-scene/set.svg`, `version 2 planning/first-scene-findings.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: `npm run scene`, the `?scene=first-scene` page.

- [ ] **Step 1: Draw the set**

`set.svg` is a 1920×1080 original market lane: flat shapes, a warm palette, and an open area in the lower two-thirds where the characters stand.

- [ ] **Step 2: Write `scene.json`**

Actors: `mina` is the `kit` starter, `{ voice: 'default', speaker: 'woman', x: 0.3, scale: 0.8, idleOffsetMs: 0 }`. `rafi` is the `milo` starter, `{ voice: 'default', speaker: 'man', x: 0.7, scale: 0.8, flip: true, idleOffsetMs: 1900 }`.

| Line | Actor | Text | Expression | Gesture |
|---|---|---|---|---|
| 0 | mina | Rafi, the basket is empty. Where did the last mango go? | confused | point |
| 1 | rafi | Mango? What mango? I haven't seen any mango. | worried | shrug |
| 2 | mina | There is juice on your chin. | thinking | none |
| 3 | rafi | That is from a different mango. | worried | none |

| Shot | Starts at | Zoom | Focus x, y |
|---|---|---|---|
| wide | line 0, at 0 | 1 | 0.5, 0.5 |
| rafi speaks | line 1, at 0 | 1.8 | 0.7, 0.55 |
| mina reacts | line 1, at 0.6 | 1.8 | 0.3, 0.55 |
| rafi reacts | line 2, at 0.6 | 2 | 0.7, 0.55 |
| wide again | line 3, at 0 | 1 | 0.5, 0.5 |

Reactions: `rafi` at line 0, at 0.5, `worried`. `mina` at line 1, at 0.6, `angry`. `mina` at line 3, at 0.6, gesture `nod`. Adjust framing numbers if a head is cut off.

- [ ] **Step 3: Export it with VoiceStudio**

Run: `npm run scene -- samples/first-scene --rebuild`
Expected: `data/scenes/first-scene/first-scene.mp4` and a printed render time.

- [ ] **Step 4: Check it with the tools**

Open `http://localhost:5173/?scene=first-scene` through the preview tools. Pause at one moment in each of the five shots and screenshot it. Extract the matching frames from the MP4 with ffmpeg. Confirm that each pair matches, that only the speaker's mouth moves, and that the two characters don't blink or sway together. Use `ffprobe` to confirm that the audio and video lengths are within 0.05 s.

- [ ] **Step 5: Export the AI character version**

Run: `npm run scene -- samples/first-scene --rebuild --art 11d2def4-2c05-4eec-bd4e-724484b7e982`

This uses Max, the AI character already saved on this machine, so it paints nothing new. It shows an AI character and an SVG character sharing a set, with a second render time. Don't paint a second AI character without asking, because image generation can cost money.

- [ ] **Step 6: The project owner watches both videos**

Stop here and share both MP4 paths. The owner judges whether the scene is convincing and whether listeners behave well, including their idle glances away from the speaker. Fix what the owner flags, repeating Steps 3 to 5.

- [ ] **Step 7: Write the findings and commit**

`first-scene-findings.md` records: both render times per video minute; what looked wrong or right; **the owner's decision on what a v2 character is** (which views, which motions, which character types must support them); and what step 2's data model needs from this. Add a short "First scene" section to the README with the two commands.

```bash
git add samples/first-scene "version 2 planning/first-scene-findings.md" README.md
git commit -m "feat: first two-character scene sample and findings"
```
