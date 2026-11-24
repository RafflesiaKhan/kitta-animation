# Kitta v2 settings steps 1–3 plan

Branch: `feat/settings-page` in `/Users/rafflesiakhan/Documents/ChatGPT/html-animated-vedio/slide/kitta-animation-settings`.

## Baseline findings

- The checkout is clean and currently has no `server/settings.ts`, `server/auth.ts`, Settings page, or settings/auth tests.
- Provider configuration is read directly from `process.env` in `server/openai.ts`, `gemini.ts`, `anthropic.ts`, `elevenlabs.ts`, `speech.ts`, `images.ts`, `vector-draw.ts`, `director.ts`, and the health/vector-job routes in `server/index.ts`.
- `server/usage.ts` persists JSONL and exposes session/all-time totals through `usageReport()`; it does not yet provide date/provider/model/kind history.
- The existing UI has `src/App.tsx`, `src/api.ts`, `src/styles.css`, and `src/UsagePanel.tsx`; the header has no Settings navigation. Existing tests use Vitest, Supertest, Testing Library, mocked provider clients, and `KITTA_USAGE_FILE=off`/temporary directories for isolation.
- The shared rules require failing tests first, no paid or real provider calls, secret redaction, preservation of the four-step flow, and explicit live-check evidence. The user’s `feat/settings-page` branch takes precedence over the shared prompt’s older branch name.

## Step 1 — settings store and provider resolution

1. Add `server/settings.ts`.
   - Define the persisted settings shape for secret keys, VoiceStudio URL, model IDs, provider defaults, and the salted admin-password record reserved for step 2.
   - Implement `readSettings(): Promise<SettingsFile>`, `writeSettings(next: SettingsFile): Promise<void>`, `setting(name: string): string | undefined`, `setSettings(patch: SettingsPatch): Promise<void>`, `removeSetting(name: string): Promise<void>`, and `publicSettings(): Promise<PublicSettings>`.
   - Resolve values in the required order: `data/settings.json` → `process.env` → built-in default. Write atomically under `data/`, create the file with mode `0o600`, and never return raw secrets. Mask values as a short prefix/suffix such as `sk-…a1b2`.
   - Keep the file path injectable or resettable for tests; do not read or delete the owner’s real `data/` during tests.
2. Replace direct environment reads in the provider seams with `setting()` while retaining existing exported behavior and defaults: model selectors and credentials in `server/openai.ts`, `gemini.ts`, `anthropic.ts`, `elevenlabs.ts`; provider discovery and VoiceStudio URL in `server/speech.ts`; image/mouth discovery in `server/images.ts`; vector provider/model selection in `server/vector-draw.ts`; director availability in `server/director.ts`; and health/vector-job checks in `server/index.ts`.
3. Add `tests/server/settings.test.ts` and extend focused provider tests where needed.
   - First failing cases: env-only compatibility, stored value overriding env without restart, env fallback after removal, built-in defaults, atomic/0600 persistence, masking, and no secret in returned JSON or captured logs.
   - Verify `imageProviders()`, `ttsProviders()`, health, and at least one mocked provider call use a newly stored key/model without a module reload.

## Step 2 — admin password and protected routes

1. Add `server/auth.ts`.
   - Implement `hasAdminPassword(): Promise<boolean>`, `createAdminPassword(password: string): Promise<void>`, `verifyAdminPassword(password: string): Promise<boolean>`, `requireAdmin(req, res, next): void`, `createSession(): string`, `readSession(req): boolean`, `clearSession(res): void`, and `adminResetRequested(): boolean` (or equivalent signatures preserving the same boundaries).
   - Hash with Node `scrypt` and a random salt; compare with a timing-safe method. Store only the hash/salt in `data/settings.json`.
   - Use an unguessable in-memory session token, an HTTP-only cookie with `SameSite=Strict`, loopback-only deployment assumptions, and a seven-day expiry. Sign-out must invalidate the token.
2. Update `server/index.ts` with `POST /api/auth/setup`, `POST /api/auth/login`, `POST /api/auth/logout`, and an auth-status endpoint if the UI needs it. Protect `GET/PUT /api/settings` and usage reset; leave character viewing, animation, and export reachable without admin auth as specified. Return generic authentication errors and never echo passwords, hashes, cookies, or keys.
3. Add `tests/server/auth.test.ts` and protected-route cases in `tests/server/settings.test.ts`.
   - First failing cases: first-run setup, wrong password, correct login, cookie expiry/sign-out, hash-not-plaintext, protected settings and `DELETE /api/usage`, unprotected existing routes, reset-flag behavior, and no credential leakage in responses/errors/logs.
   - Use a temporary settings file and isolated cookie agents; do not use real credentials or network calls.

## Step 3 — Settings page: keys, Test, models, defaults

1. Add the settings API contract in `server/index.ts`.
   - `GET /api/settings` returns masked key metadata, source (`settings`, `env`, or `default`), current model/default selections, known model catalog entries and prices, and auth state.
   - `PUT /api/settings` accepts a validated patch for replacement/removal of keys, VoiceStudio URL, model IDs, and provider defaults; reject unknown fields, oversized values, malformed model IDs/URLs, and invalid providers.
   - `POST /api/settings/test/:provider` performs one explicitly requested, mocked-in-tests cheap provider check (model/voice listing where available), with bounded timeout and redacted errors. It must not persist a submitted test key unless the normal update endpoint was used.
2. Extend `src/api.ts` with typed `getSettings()`, `updateSettings(patch)`, `testSettingProvider(provider)`, `login(password)`, `setupPassword(password)`, and `logout()` helpers. Handle 401/403 without exposing response bodies containing secrets.
3. Add `src/Settings.tsx` and wire a Settings button/route into `src/App.tsx` without removing or breaking Character → Voiceover → Animate → Export. Render Keys, Models, Defaults, and Admin sections; show masked values and source labels; make Replace/Remove/Test states explicit; keep raw values only in controlled inputs and clear them after save.
4. Add scoped styles in `src/styles.css`, reusing the existing theme and accessible form/button conventions. Avoid adding a chart library in steps 1–3; usage history/chart remains step 4, though the Settings page may link to the existing `UsagePanel` totals.
5. Add `tests/ui/settings.test.tsx`.
   - Cover first-run setup/login, masked keys and source labels, replace/remove/test flows, model/default selections, validation/error states, sign-out, and preserving the existing app flow.
   - Mock `src/api.ts`; assert no raw key is rendered after save and no network/provider call is made by component tests.

## Verification and security checklist

- Before each implementation commit: run the new focused tests, `npx vitest run`, and `npx tsc --noEmit -p .`; this planning task itself makes no commit.
- Verify the running app on the checkout-owned fixed ports only after confirming the listener process belongs to this worktree; do not stop another checkout’s server. Use a disposable key-shaped test value and a mocked/local provider for acceptance, not a paid call.
- Keep `data/settings.json` and sessions out of Git; enforce `0600`, atomic replacement, bounded JSON/body sizes, strict field allowlists, and no secret values in logs, errors, usage records, browser payloads, exports, or test snapshots.
- Treat `KITTA_ADMIN_RESET=1` as a one-time local recovery path and document that deleting settings also deletes stored keys; do not make it a remote/browser-triggerable bypass.
- Preserve `127.0.0.1` binding and the existing unauthenticated character/animation/export behavior. Do not broaden auth to the whole app or add external dependencies without owner approval.

## Out of scope for steps 1–3

Usage history grouping/chart (`GET /api/usage/history?days=30`), README/`.env.example` updates, editable price tables, multi-user accounts, budget limits, keychain storage, OpenArt integration, and any implementation commit/report are later work.
