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

## Voices

The "Write script" tab can speak with three providers ("Voice by" appears when more than one is set up):

- **Gemini TTS** (`GEMINI_API_KEY`): the default. A neutral line with no delivery note is sent as just its text; otherwise the expression and note go in separate director's notes, so they shape the delivery without being read out.
- **OpenAI** (`OPENAI_API_KEY`, `OPENAI_TTS_MODEL`, default `gpt-4o-mini-tts`): the line's expression and delivery note become speaking instructions.
- **VoiceStudio (local, free)**: [VoiceStudio](https://github.com/debpalash/VoiceStudio) runs open voice models on your own machine (voice cloning, 600+ languages). Start it, then set `VOICESTUDIO_URL=http://localhost:3900`. The script tab then shows whether it is running, an **Engine** picker (the engines installed in VoiceStudio, e.g. OmniVoice, KittenTTS, MLX-Audio), your saved and cloned voices by name, and VoiceStudio's personas (designed voices such as Narrator or Storyteller, shown with their icon). Clone or design new voices in VoiceStudio itself; they appear here automatically. With VoiceStudio running, "Add expressions" on an upload transcribes locally (free, offline); without a Gemini key the lines arrive untagged, ready to tag by hand.

Each line has its own voice controls, like Murf's blocks:

| Control | VoiceStudio | OpenAI / Gemini |
|---|---|---|
| Voice | saved/cloned voice, persona, or the engine's default | the provider's voices |
| Language | its `language`; English accents (US, UK, AU, CA, India) as a voice attribute | spoken direction ("with a British accent", "in French") |
| Style | Whisper is real (its only delivery style) | spoken direction |
| Pitch % (±25) | shifted afterwards with ffmpeg, length kept, so it also works on cloned voices | same |
| Speed % (±50) | its own `speed` | ffmpeg afterwards |
| Variability | Steady (one seed per voice: the same take every time) or Varied (a new take each time) | n/a |
| ▶ | plays just that line, no lip sync | same |

**Add pause** puts `[pause 0.5s]`, `[pause 1s]` or `[pause 2s]` at the cursor (any `[pause Ns]` / `[pause Nms]` up to 10 s works, as do Gemini-style `<short pause>` / `<long pause>`). The app splits the line there and inserts real silence, because VoiceStudio's speech endpoint reads timed pause tags out loud. **✦ Cue** adds a delivery cue at the cursor, or around the selected words: `[whisper]`, `[excited]`, `[happy]`, `[surprised]`, `[sad]`, `[calm]`, `[angry]`. A cue lasts until its closing tag (`[/excited]`), the next cue or the end of the line. OpenAI and Gemini perform cues as direction. VoiceStudio's default engine has no emotions (only whisper), so it *approximates* the others with a small speed and pitch change on those words. On OmniVoice the menu also offers its reaction sounds: `[laughter]`, `[sigh]`, `[surprise-oh]`, `[surprise-wa]`, `[question-en]`, `[confirmation-en]`, `[dissatisfaction-hnn]`. Other engines would read these out loud, so the app drops them there. A delivery note containing "whisper" still whispers.

Not possible with the VoiceStudio engines installed by default: real emotional styles (Conversational, Promo, Angry…), emphasis on a word, and breaths. VoiceStudio's opt-in engines can do some of this (IndexTTS2 for emotion, CosyVoice 3 for `[breath]` and emphasis), but the app doesn't use them yet. Each pause or cue means one more call to the voice provider for that line.

## Natural movement

While the character talks it nods slightly and moves its hands on stressed syllables, lifts its brows at the start of a phrase, tilts and sways a little, and blinks at uneven intervals and at the end of phrases. The amount follows the expression (sad slumps and moves less, excited bounces, confused tilts, worried clasps the hands). Gestures: wave, nod, look down, celebrate, shrug, think (hand on chin), point and explain (open palms). All of it comes from the lip-sync timing, so it works with every voice source and the exported video matches the preview.

When a provider is overloaded or rate-limited, each line is retried for about 25 seconds before giving up; the error then suggests the other providers you have set up. The server terminal logs the provider's own error message for every failure.

## Token usage

The 🔢 button in the header shows how many tokens Gemini and OpenAI used this session; click it for a breakdown per provider and model (calls, input, output, total), all-time totals and the latest calls. The counts are the ones each provider reports. OpenAI speech and VoiceStudio report none, so they show as calls only. Every call is also logged in the server terminal (`[usage] gemini gemini-3.8-flash-tts voice: 42 in + 1210 out = 1252 tokens`) and kept in `data/usage.jsonl`. "Reset" clears it.

## Creating characters with AI

Works like [Masko](https://masko.ai/): describe a character (or upload a reference picture to redraw), pick a style, and Gemini paints it. Then press "✨ Draw all missing poses" (or draw them one by one) to get its expressions, a blink frame and its actions (wave, look down, celebrate, shrug). Each pose is an edit of the first picture, so it stays the same character. Poses are saved as they arrive in `data/characters/`, so a failure halfway keeps what was drawn.

- The image model draws on a magenta backdrop, which ffmpeg removes to make transparent PNGs (needed for transparent export).
- Lip sync: Gemini (or OpenAI, if Gemini fails) gives a rough mouth box for the neutral picture; the app then measures the painted mouth in the pixels near it (the stroke that stands out from the skin and is wider than tall) and measures every other pose around that spot, with no further AI calls. While the character talks, a patch of the sampled skin colour covers the painted mouth and the app's cartoon mouth shapes are drawn over it. Pictures stay mouth-closed, and the prompts ask for a simple, clearly drawn mouth so it can be measured. If a mouth can't be measured (e.g. a soft 3D face without an outlined mouth), the AI's box is used. During "look down" the face is turned away and the mouth stays still. Characters made before this, or with a missing mouth, show "Find mouths again" on the character sheet.
- Animation: expressions crossfade, the blink frame is shown during blinks, action poses fade in for the line's gesture; nod and the breathing bob move the whole picture. An expression that isn't drawn yet shows the neutral picture.
- Providers: Gemini (`GEMINI_API_KEY`, `GEMINI_IMAGE_MODEL`) or OpenAI (`OPENAI_API_KEY`, `OPENAI_IMAGE_MODEL`, default `gpt-image-2`); see `.env.example`. Set either or both. With both, the Create form has a "Drawn by" choice, and each character keeps drawing its poses with the provider that painted it. The mouth lookup uses Gemini when its key is set, otherwise an OpenAI vision model (`OPENAI_VISION_MODEL`).
- Image generation is usually paid (Gemini's free tier may not include it); a full set is 16 pictures plus one mouth lookup each. Voice, auto-tag and transcription still use Gemini.

## How expressions work

Each expression is a preset of face parameters (brows, eyelids, smile squint, pupil direction, blush, mouth mood) in `shared/character/expressions.ts`, not a separate drawing, so every starter and every customisation gets the full set. When a new line starts, the face morphs from the previous line's expression over 250 ms. Between lines the character idles: it blinks, breathes and now and then glances to the side. To add an expression, add one entry to `FACES` and `TONES` and to `EXPRESSIONS` in `shared/types.ts`; validation, auto-tag and the dropdowns pick it up from there.

## Gemini features (optional)

The "Write script" tab uses Gemini TTS; auto-tagging and transcription use the text model. Upload, lip sync and export work without it.

1. Get a key from Google AI Studio and put it in `.env` (see `.env.example`): `GEMINI_API_KEY=...`
2. Models come from env: `GEMINI_TTS_MODEL` (default `gemini-3.8-flash-tts`, 24 kHz 16-bit mono audio) and `GEMINI_TEXT_MODEL` (`gemini-3.8-flash`).
3. Prebuilt voices offered: Kore, Puck, Charon, Zephyr, Fenrir, Leda, Aoede, Orus (Gemini has 30 in total).
4. Free tier: the Gemini API has a free tier with rate limits; the docs do not state TTS free-tier limits, check https://ai.google.dev/gemini-api/docs/rate-limits. When the limit is hit the app shows "Free Gemini limit reached, try again later".

Docs: https://ai.google.dev/gemini-api/docs/speech-generation
