# Kitta Animation

Local app that makes lip-synced cartoon character videos.

## Gemini voices (optional)

The "Write script" tab uses Gemini TTS. Upload, lip sync and export work without it.

1. Get a key from Google AI Studio and put it in `.env` (see `.env.example`): `GEMINI_API_KEY=...`
2. Models come from env: `GEMINI_TTS_MODEL` (default `gemini-3.8-flash-tts`, 24 kHz 16-bit mono audio) and `GEMINI_TEXT_MODEL` (`gemini-3.8-flash`).
3. Prebuilt voices offered: Kore, Puck, Charon, Zephyr, Fenrir, Leda, Aoede, Orus (Gemini has 30 in total).
4. Free tier: the Gemini API has a free tier with rate limits; the docs do not state TTS free-tier limits, check https://ai.google.dev/gemini-api/docs/rate-limits. When the limit is hit the app shows "Free Gemini limit reached, try again later".

Docs: https://ai.google.dev/gemini-api/docs/speech-generation
