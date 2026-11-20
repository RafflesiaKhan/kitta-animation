# Settings page, admin password and usage chart

Today every key and model choice lives in `.env`, which many people sharing or trying Kitta don't know how to edit. A **Settings** page lets them set it up in the app instead, and shows how many tokens and how much money Kitta has used, and where. A simple admin password keeps the keys and the spending in one person's hands.

## What the person can do

| Area | In the Settings page |
| --- | --- |
| API keys | Add, replace or remove the OpenAI, Gemini, ElevenLabs and Anthropic keys, and the VoiceStudio address. A **Test** button per key checks it with one cheap call (for example listing models or voices) and says whether it works. |
| Preferred models | Pick the model per job: voice (Gemini TTS, OpenAI TTS, ElevenLabs), text (directions, auto-tag), pictures (Gemini, OpenAI), mouth lookup, and drawing vector characters (OpenAI or Claude, and which model). Each list shows the known models with their price; "Other…" takes any model id. |
| Defaults | Default voice provider, default picture provider, vector drawing provider. |
| Usage | A chart of tokens and cost over time, by provider and model, plus the table the header panel already has. |
| Admin | Set or change the admin password; sign out. |

## Keys and models: where they live

- Saved on the server in `data/settings.json` (`data/` is gitignored), readable only by the user running Kitta (file mode 600). Never sent back to the browser in full: the page shows a key as `sk-…a1b2` with "Replace" and "Remove".
- **What wins:** a value set in Settings, else `.env`, else the built-in default. So existing `.env` setups keep working, and the page marks values that come from `.env`.
- The server reads settings through one function (`server/settings.ts`, `setting('OPENAI_API_KEY')`), replacing the direct `process.env` reads in the providers. A change applies to the next request, with no restart.
- Keys never appear in logs, errors, the usage ledger or exports.

## Admin password (simple user management for now)

- **First run:** the Settings page asks to create an admin password. Until one exists, the app works as today for everything that doesn't need a key.
- Stored as a salted hash (Node's `scrypt`) in `data/settings.json`, never in plain text.
- Signing in sets an HTTP-only session cookie (SameSite=Strict) that lasts until sign-out or 7 days.
- **What needs the password:** opening Settings, changing keys and models, and resetting usage. Viewing characters, animating and exporting don't.
- **Forgot the password:** delete `data/settings.json` (keys go with it) or set `KITTA_ADMIN_RESET=1` once; the README explains both.
- Kitta keeps listening on `127.0.0.1` only. The password guards against someone else using the same machine or browser, not the internet.
- Later: more than one user, each with their own keys and usage (see Later).

## Usage chart

- A bar chart of cost per day for the last 30 days, stacked by provider (Gemini, OpenAI, Claude, ElevenLabs), with a switch between cost and tokens.
- Below it: totals by provider and model (calls, tokens or characters, cost) for the chosen period, and what each was used for (voice, pictures, directions, mouth lookup, vector drawing), from the `kind` already in each ledger line.
- Read from `data/usage.jsonl` by a new `GET /api/usage/history?days=30` that groups by day, provider, model and kind. Older lines without a cost show as estimates (≈), as in the header panel.
- Drawn with a small chart library or plain SVG. Both themes are readable, and each bar shows its numbers on hover.

## Pieces to build

| Piece | Where | Notes |
| --- | --- | --- |
| Settings store | `server/settings.ts` | Read and write `data/settings.json`; `setting(name)` with the Settings → `.env` → default order; masks keys for the browser |
| Admin auth | `server/auth.ts` | Create and check the password (scrypt), sessions, a middleware for the protected routes |
| Settings API | `server/index.ts` | `GET/PUT /api/settings`, `POST /api/settings/test/:provider`, `POST /api/auth/login`, `/logout`, `/setup` |
| Providers | `server/openai.ts`, `gemini.ts`, `anthropic.ts`, `elevenlabs.ts`, `speech.ts`, `images.ts`, `vector-draw.ts` | Read keys and models through `setting()` instead of `process.env` |
| Usage history | `server/usage.ts` | Group the ledger by day, provider, model and kind |
| Page | `src/Settings.tsx`, a **Settings** button in the header (`/?settings`) | Sections: Keys, Models, Defaults, Usage, Admin |
| Tests | `tests/server/settings.test.ts`, `auth.test.ts`, `tests/ui/settings.test.tsx` | Precedence, masking, password hashing and sessions, protected routes, usage grouping, no keys in responses or logs |

## Steps

| Step | Build | Check |
| --- | --- | --- |
| 1 | Settings store and `setting()`; providers read through it | All tests pass with `.env` only; a key set in `data/settings.json` is used without a restart |
| 2 | Admin password and protected routes | Settings needs the password; a wrong password is refused; the hash is in the file, not the password |
| 3 | Settings page: keys (with Test), models, defaults | A person with no `.env` adds an OpenAI key in the app, generates a voice and creates a picture character |
| 4 | Usage history API and chart | The chart matches the header panel's totals for the same period; switching cost and tokens works |
| 5 | README and `.env.example`: Settings first, `.env` as the advanced option | A new person can set Kitta up from the README without opening `.env` |

## Open decisions

- **Key storage:** a plain file with tight permissions (simplest, planned), or the operating system's keychain (safer, more code per platform).
- **What the password covers:** only Settings and spending resets (planned), or the whole app.
- **Spending guard:** whether to add a monthly budget per provider that warns or stops at a limit, now or later.

## Later

- Several users, each with their own password, keys, preferred models and usage.
- Export usage as CSV.
- Price table editing in the page, for when providers change prices.
