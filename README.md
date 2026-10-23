# Kitta Animation

Local app that makes lip-synced cartoon character videos.

## Setup

```
npm i
cp .env.example .env     # then add your GEMINI_API_KEY (optional, see below)
npm run dev
```

Open http://localhost:5173. Lip sync uses Rhubarb, which is bundled as a WASM package, so there is nothing else to install (no `npm run setup`). Needs `ffmpeg` on your PATH.

## How to use

1. **Character**: pick a starter and customise it.
2. **Voiceover**: either upload audio (up to 3 minutes), or write a script and click "Generate voice". "✨ Add expressions" (after an upload) and "✨ Auto-tag expressions" (in the script) let Gemini pick the expression and gesture per line; you can change any of them afterwards.
3. **Export**: choose 16:9 or 9:16, or transparent, and download the MP4/WebM.

Upload, lip sync and export work without a Gemini key. Voice generation, "Add expressions" and "Auto-tag" need `GEMINI_API_KEY`; without one those buttons are disabled. Gemini has a free tier with rate limits; if it is hit, the app shows "Free Gemini limit reached, try again later".

## Gemini features (optional)

The "Write script" tab uses Gemini TTS; auto-tagging and transcription use the text model. Upload, lip sync and export work without it.

1. Get a key from Google AI Studio and put it in `.env` (see `.env.example`): `GEMINI_API_KEY=...`
2. Models come from env: `GEMINI_TTS_MODEL` (default `gemini-3.8-flash-tts`, 24 kHz 16-bit mono audio) and `GEMINI_TEXT_MODEL` (`gemini-3.8-flash`).
3. Prebuilt voices offered: Kore, Puck, Charon, Zephyr, Fenrir, Leda, Aoede, Orus (Gemini has 30 in total).
4. Free tier: the Gemini API has a free tier with rate limits; the docs do not state TTS free-tier limits, check https://ai.google.dev/gemini-api/docs/rate-limits. When the limit is hit the app shows "Free Gemini limit reached, try again later".

Docs: https://ai.google.dev/gemini-api/docs/speech-generation
