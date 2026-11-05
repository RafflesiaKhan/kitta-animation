# Step 6: Settings and the AI Director

Read `version 2 planning/codex-prompts/shared-rules.md` and follow it, including the subagent stages. Then read `version 2 planning/codex-reports/step-5b.md`, and the "Settings and API keys" section of `version 2 planning/implementation-plan.md`.

Security matters most here. Have the final reviewer check key handling specifically.

## Goal

Creators bring their own API key, choose their LLM, and get a Director that can draft and propose work, which they then approve.

## Build Settings

- A Settings page where creators add and save API keys for OpenAI and Claude. Gemini stays available because the app already uses it. Build it so more settings can be added later.
- The local server stores keys outside the repo, in a file only the user can read or in the macOS Keychain. The browser only ever receives a masked key. No route may return a full key, and logs and errors must not contain one.
- Choose the Director model and the image provider separately, because an LLM provider may not generate images.
- A saved setting takes priority over `.env`, and `.env` keeps working for anyone already using it.
- Check current model names in each provider's official docs instead of relying on memory. Let creators pick the model.

## Build the provider code

One shared LLM interface covering text, structured output, and tool calls. Move `server/gemini.ts` and `server/openai.ts` text calls behind it, and add Claude. Existing features, including Auto-tag and script direction matching, must keep working. Rename `server/director.ts` to something like tag matching, so it isn't confused with the AI Director.

## Build the Director

- A floating robot button that opens a panel while keeping the project visible. It knows the current project, episode, and relevant assets.
- It answers creative questions, and calls explicit project actions with validated inputs. Start with script drafting, scene proposals, and background generation.
- Scene proposals stay drafts until the creator accepts them. Show success only after saving.
- Generation jobs track pending, failed, and completed, and the job ID makes retries safe. Save media and metadata before showing an asset in the library.
- Treat model output as untrusted: validate it before saving, and never run it.

**Testing and cost:** tests use mocks. Real checks need the owner's key and spend money, so ask before each paid run, and keep them few and small.

## Not in this step

The OpenArt MCP, voice provider settings, and an unbounded list of Director actions.

## Acceptance

1. Save a key, restart the app, and confirm the page shows it masked. Search server responses and logs to confirm the full key isn't there.
2. Generate a background from chat, reopen the project, and select it in a scene.
3. Accept a scene draft, and verify it attaches to the correct episode.
4. Retry a failed request, and confirm no saved asset is duplicated.
5. With no key, AI actions are disabled with a message pointing to Settings, while upload, manual editing, lip sync, and export still work.
6. Today's Auto-tag and directed scripts still work.
