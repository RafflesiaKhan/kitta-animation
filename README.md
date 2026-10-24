# Kitta Animation

Local app that makes lip-synced cartoon character videos.

[![alt text](/demo.png)](/demo.mov)


## Setup

```
npm i
cp .env.example .env     # then add your GEMINI_API_KEY (optional, see below)
npm run dev
```

Open http://localhost:5173. Lip sync uses Rhubarb, which is bundled as a WASM package, so there is nothing else to install (no `npm run setup`). Needs Node 21.7 or newer (the server uses `process.loadEnvFile`) and `ffmpeg` on your PATH.

## How to use

1. **Character**: pick a starter and customise it, or **＋ Create with AI** (see below).
2. **Voiceover**: either upload audio (up to 3 minutes), or write a script and click "Generate voice". "✨ Add expressions" (after an upload) and "✨ Auto-tag expressions" (in the script) let Gemini pick the expression and gesture per line; you can change any of them afterwards, for uploads too (each line of an uploaded clip is listed under the upload button).
   Expressions: neutral, happy, sad, surprised, angry, excited, thinking, confused, worried, wink, sleepy. Gestures: wave, nod, look down, celebrate, shrug. The Character step shows your character's whole expression set.
3. **Export**: choose 16:9 or 9:16, or transparent, and download the MP4/WebM.

Upload, lip sync and export work without a Gemini key. Voice generation, "Add expressions" and "Auto-tag" need `GEMINI_API_KEY`; without one those buttons are disabled (you can still set the expression and gesture by hand). Gemini has a free tier with rate limits; if it is hit, the app shows "Free Gemini limit reached, try again later".

## Creating characters with AI

Works like [Masko](https://masko.ai/): describe a character (or upload a reference picture to redraw), pick a style, and Gemini paints it. Then press "✨ Draw all missing poses" (or draw them one by one) to get its expressions, a blink frame and its actions (wave, look down, celebrate, shrug). Each pose is an edit of the first picture, so it stays the same character. Poses are saved as they arrive in `data/characters/`, so a failure halfway keeps what was drawn.

- The image model draws on a magenta backdrop, which ffmpeg removes to make transparent PNGs (needed for transparent export).
- Lip sync: Gemini finds the mouth in each picture; while the character talks, the app's cartoon mouth shapes are drawn over it. Pictures stay mouth-closed.
- Animation: expressions crossfade, the blink frame is shown during blinks, action poses fade in for the line's gesture; nod and the breathing bob move the whole picture. An expression that isn't drawn yet shows the neutral picture.
- Needs `GEMINI_API_KEY` and an image model (`GEMINI_IMAGE_MODEL`, see `.env.example`). Image generation may not be in Gemini's free tier; a full set is 16 pictures plus one mouth lookup each.

## How expressions work

Each expression is a preset of face parameters (brows, eyelids, smile squint, pupil direction, blush, mouth mood) in `shared/character/expressions.ts`, not a separate drawing, so every starter and every customisation gets the full set. When a new line starts, the face morphs from the previous line's expression over 250 ms. Between lines the character idles: it blinks, breathes and now and then glances to the side. To add an expression, add one entry to `FACES` and `TONES` and to `EXPRESSIONS` in `shared/types.ts`; validation, auto-tag and the dropdowns pick it up from there.

## Gemini features (optional)

The "Write script" tab uses Gemini TTS; auto-tagging and transcription use the text model. Upload, lip sync and export work without it.

1. Get a key from Google AI Studio and put it in `.env` (see `.env.example`): `GEMINI_API_KEY=...`
2. Models come from env: `GEMINI_TTS_MODEL` (default `gemini-3.8-flash-tts`, 24 kHz 16-bit mono audio) and `GEMINI_TEXT_MODEL` (`gemini-3.8-flash`).
3. Prebuilt voices offered: Kore, Puck, Charon, Zephyr, Fenrir, Leda, Aoede, Orus (Gemini has 30 in total).
4. Free tier: the Gemini API has a free tier with rate limits; the docs do not state TTS free-tier limits, check https://ai.google.dev/gemini-api/docs/rate-limits. When the limit is hit the app shows "Free Gemini limit reached, try again later".

Docs: https://ai.google.dev/gemini-api/docs/speech-generation
