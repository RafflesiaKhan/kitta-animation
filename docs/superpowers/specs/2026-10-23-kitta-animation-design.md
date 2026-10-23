# Kitta Animation — Design

Date: 2026-10-23
Status: Draft, waiting for approval

## Intent

A simple 2D tool, in the spirit of Adobe Express "Animate from Audio" and Hedra, for making short videos of a cartoon character talking. You give it a voiceover, either by uploading audio or by writing a script that AI turns into speech. It produces a lip-synced animation in which the character's face changes expression to match what is being said, then exports a video.

Why: the owner wants to make talking-character videos without paying for Adobe or Hedra and without hand-animating mouths, using free or nearly free AI models wherever possible.

## Goals

1. **Character step.** Pick one of 2–3 starter characters, then customize it: skin, hair and clothing colours; hairstyle (a few options); eye style (a few options); outfit (a few options). Changes apply to every expression and mouth shape. Each character has a set of expressions (at least neutral, happy, sad, surprised and angry), and each expression has a full set of mouth shapes.
2. **Voiceover step**, with two tabs:
   - **Upload audio** (mp3, wav or m4a).
   - **Write script**, like Google AI Studio's speech playground: a list of lines, each with a voice, an expression tag, an optional delivery note (e.g. "hushed, gravelly") and optional inline tags such as `<short pause>`. A "Generate voice" button produces the audio.
3. **Expressions.** Every line carries an expression, and optionally a gesture (wave, nod, look down). The user sets them by hand, or presses "✨ Auto-tag", which asks an LLM to tag every line from its text. The same tag steers the voice delivery and the character's face.
4. **Lip sync.** Mouth shapes are timed automatically from the audio (Rhubarb Lip Sync), then drawn using the mouth set for the expression active at that moment.
5. **Preview** in the browser, with audio, mouth, expressions and gestures in sync.
6. **Export** an MP4 video, with a transparent-background option if it's cheap to add.

## Non-goals (v1)

- Realistic, Hedra-style AI video generation (an image animated by a diffusion model). This may come later as a separate mode.
- A drawing or painting tool like Krita.
- A full timeline editor (layout option B). v1 uses the simple step-by-step flow (layout option A). Expressions are edited per line, not dragged on a timeline.
- Multiple characters in one scene, scene backgrounds beyond a solid colour or uploaded image, camera moves.
- User accounts, cloud hosting, sharing.
- AI image generation of new characters. This is the next feature after v1 (see "Later").

## Anti-goals (a failure even if it technically works)

- Lip sync visibly out of step with the audio.
- Paid services needed for the basic flow. Upload audio → lip sync → export must work with no paid API at all.
- The owner's API key exposed in the browser or committed to the repo.
- A UI that needs a manual to use. It should feel like Adobe Express: three steps, obvious buttons.

## Constraints

- **Budget:** free first. A small monthly spend is acceptable for better AI quality, but nothing in the core path may require it.
- **Runs locally** on the owner's Mac (Apple Silicon assumed; no NVIDIA GPU assumed).
- **Gemini** is the default AI provider, since its speech model and free tier are already in use (`gemini-3.8-flash-tts` seen in AI Studio). Free-tier limits are not verified; the builder should check current limits and fail gracefully when they're hit.

## Decisions

From the owner:
- Cartoon look, like Adobe Express, not realistic.
- Layout A: a simple flow of Character → Voiceover → Export.
- Voiceover can be uploaded or generated from a script with expressions, in the style of the Google AI Studio speech UI.
- The character changes expression with the text, using an LLM where it helps.
- Free tools preferred; light paid AI use is acceptable.
- **Characters in v1:** 2–3 starter cartoon characters built in SVG. The user can customize colours, hair, eyes and clothes. AI character creation comes later.

My calls (open to challenge):
- **Platform:** a local web app. The frontend is React, TypeScript and Vite. A small local Node server keeps the Gemini key in `.env` and runs command-line tools (Rhubarb, ffmpeg).
- **Lip sync:** Rhubarb Lip Sync via its WebAssembly port [rhubarb-lip-sync-wasm](https://github.com/danieloquelis/rhubarb-lip-sync-wasm), which runs natively on Apple Silicon. The official CLI is Intel-only and would need Rosetta. It produces the 9 mouth shapes (A–H and X). When the script text is known, it is passed as dialog text for better accuracy.
- **Characters are layered SVG:** body, head, eyes, brows and mouth as separate parts. An expression swaps eyes, brows and the mouth set; a mouth set is 9 SVG mouths. Gestures are simple transforms (arm rotation, head tilt) with idle blinking and a subtle breathing bob.
- **Script → voice:** each line is generated separately with Gemini TTS, so exact start and end times are known for every line and its expression. The voice is chosen from Gemini's prebuilt voices. The expression and delivery note go into the prompt.
- **Uploaded audio → expressions:** speech-to-text with timestamps gives the lines and their times. Then the same Auto-tag step runs.
- **Auto-tag:** one LLM call (Gemini Flash by default) returns structured JSON, `[{line, expression, gesture}]`, from a fixed list of allowed values.
- **Video output:** MP4 in 1920×1080 or 1080×1920 (for Shorts and Reels), at 30 fps. Clips up to about 3 minutes.
- **Free fallback for voices:** a local open-source TTS (e.g. Kokoro) can be added behind the same interface. It is not required for v1.

## Left to the builder

- Which speech-to-text tool gives timestamps for uploaded audio: Gemini audio understanding or a local whisper.cpp. Pick whichever is more reliable for line-level timing.
- How export renders: frame-by-frame to ffmpeg on the server, or another route, as long as audio and video stay in sync.
- Project file format (JSON) and where projects are saved locally.
- Visual styling of the app, within the mockups' simple, friendly feel.

## Later (not v1)

- ✨ AI character creation: generate a character, then its expressions and mouth sets, with an image model.
- Timeline editor (layout B) to drag expressions and gestures.
- Multiple characters having a conversation (Gemini TTS supports two speakers).
- More character styles from [Open Peeps](https://www.openpeeps.com/), a free (CC0) hand-drawn library of mix-and-match faces, hair and bodies. This was suggested by the owner. The faces would need matching mouth sets for lip sync.
- Hedra-style realistic mode via an open model such as MultiTalk or EchoMimicV2, on a rented GPU.

## Reference mockups

`.superpowers/brainstorm/40923-1792786046/content/layout.html` (option A chosen) and `voice-expressions.html`.
