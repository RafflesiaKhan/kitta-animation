# Kitta Animation version 2 implementation plan

Use [the product plan](product-plan.md) and [the HTML prototype](product-poc.html) as the starting point. Build one small workflow at a time and verify it through the UI before expanding it.

Start with the hardest question: can two characters act convincingly in one scene? The first step answers it with a hardcoded sample, and the data model then follows from what that sample needed.

| Step | Build | Acceptance check |
| --- | --- | --- |
| 1. First scene | Hardcode a short original scene in a JSON file: two characters, one set, VoiceStudio dialogue, and a wide shot, a speaker shot, and a listener reaction. Add a scene view that preview and export both use. Give each character its own mouth cues and its own idle timing. | Export an MP4 and review it with sound. Only the active speaker's mouth moves, the characters don't blink or sway in unison, and the export matches the preview. Record the render time and the character decision below. |
| 2. Projects and storage | Add project, episode, asset, scene, and cue records with stable IDs and a project-scoped asset library, shaped by what step 1 needed. Bring saved AI characters into a project. | Create two projects, import an image, SVG, and audio, then reopen the app and confirm each project has the correct assets. Save the step 1 scene in an episode, reopen it, and confirm it renders the same. Existing AI characters are still available. |
| 3. Characters and sets | Add reusable characters and backgrounds. Start with the character editor and reusable poses. | Use the same character and set in two episodes. Change an expression in one episode and confirm the other keeps its own performance choices. |
| 4. A talking scene | Save episode scripts, choose narration or dialogue, and assign VoiceStudio voices, splitting mouth cues by speaker. Place several characters on a set, choose poses, and switch cameras, using the Animate timeline as each shot's editor. | Rebuild the step 1 scene through the UI and confirm it plays like the hardcoded version. In a two-speaker exchange, the intended voice is on each line and only the active speaker's mouth moves. |
| 5. Settings and Director | Add the Settings page with saved API keys. Connect the chosen LLM through the app server. Start with script drafting, scene proposals, and background generation. Expose explicit project actions with validated inputs and show success only after saving. | Save a key, restart the app, and confirm the page shows it masked. Generate a background from chat, reopen the project, and select it in a scene. Accept a scene draft and verify it attaches to the correct episode. Retry a failed request without duplicating saved assets. With no key, AI actions are disabled and manual editing still works. |
| 6. Editing and export | Add scene order, transitions, audio mix, and episode export. | Render a short episode, then check shot boundaries, sync, continuity, audio, and exported playback. |
| 7. Wider library | Add props, creatures, and scene templates. | Place a prop and a creature in a scene, save it as a template, and start a new scene from that template. |
| 8. Full-body motion (optional) | Test CMU motion capture with one "walk in" clip on one legged character. Build a clip library only if the test looks right. **Replaced by [action-library-plan.md](action-library-plan.md):** the model writes the walk first, and a CMU clip is the fallback if it looks stiff. | Review the clip beside the hand-built gestures. It reads as the same cartoon style, the feet don't slide, and the export matches the preview. |

## What carries over

The Character → Voiceover → Animate → Export flow is replaced, but its core functions carry over instead of being rewritten.

- **Reuse:** `frameAt`, marks and their edit functions, `CharacterView`, `renderVideo`, Rhubarb lip sync, `speakLine`, script tag parsing, and image painting.
- **Extend:** `frameAt` takes an idle timing offset per character, because blinks, bobbing, and swaying currently depend only on the time. `frameSvg` draws a scene instead of one centred character.
- **Replace:** the four-step app shell and the single-character state in `App.tsx`.

`server/director.ts` matches script tags to expressions and actions. Rename it when the AI Director arrives, so the two aren't confused.

## Renderer

Extend today's renderer rather than choosing a new one later. Preview and export already share `CharacterView`, which is what keeps them matching. A benchmark with placeholder images, excluding video encoding, puts a 3-minute 1080p video with two AI characters and a background at about 9 minutes. Step 1 replaces that estimate with a real measurement.

## Storage and service boundaries

The HTML prototype uses IndexedDB for a local demonstration. **One JSON file per project plus a managed media directory** is the proposed starting point, matching how `server/characters.ts` stores characters today and adding no dependency. Store project, episode, asset, scene, cue, and generation-job records in the project file. Store image, SVG, audio, and video files in the media directory. Record each file's location, media type, and provenance in its asset record. Move to SQLite if projects outgrow this, or if shared or hosted projects become a requirement.

The chosen LLM runs through the app server and invokes validated actions for the active project. A generation job should track pending, failed, and completed states. Save media and metadata before exposing an asset in the library, and use the job ID to make retries safe. VoiceStudio is the voice for generated speech, called through the existing `speakLine`. The scene preview and final renderer consume the saved episode plan and media.

## Settings and API keys

Creators bring their own API keys, starting with OpenAI and Claude. Gemini stays available because the app already uses it. Build the page so more configuration can be added later.

- **Key safety:** the local server stores keys in a protected file or the macOS Keychain, outside the repo. The browser only ever sees a masked key.
- **Provider code:** add one shared LLM interface covering text, structured output, and the Director's tool calls. `server/gemini.ts` and `server/openai.ts` move behind it, and Claude is added as a new provider.
- **Separate choices:** select the Director model and the image provider independently, because an LLM provider may not generate images. A voice provider choice can follow later.
- **No key:** AI actions are disabled with a message pointing to Settings. Upload, manual editing, lip sync, and export need no key, as in version 1.

## Motion capture

CMU motion capture is for full-body moves Kitta can't do today, such as walking, sitting, and standing. It needs a rig with legs and probably a side view, and it can't drive AI-painted characters directly because they have no joints.

- **Clips:** an offline script turns a few CMU clips into 2D joint angles saved as JSON, so the app never reads mocap files while running. Each bone is rotated to match the motion's 2D direction.
- **Playback:** a clip plays through the existing action clip progress, so preview and export stay matched. Walking also needs a character position from scene editing.
- **Style:** reduce clips to key poses and hold them, so they suit economical animation.
- **Licence:** confirm the terms on CMU's own site before shipping. Use CMU's files or the cgspeed BVH conversion, because at least one FBX conversion is marked non-commercial.

Don't use CMU for small acting moves such as "leans forward" or "hand over heart". The torso has no joints, and hand-built gestures are cheaper and more cartoon-like.

## Decisions made

- **Packaging:** version 2 stays a local web app, with no packaged desktop app.
- **What "Kitta writes the code for each scene" means:** in the SVG style, everything is drawn by code: the rig, lip sync, gestures, idle movement, and SVG backgrounds. That's how Kitta already works, while the AI style uses painted pictures. The Director writes scene data and may draw SVG sets that pass the step 3 sanitizer. Nothing generated is ever executed.
- **Fewer, larger steps:** the old steps 4, 5a, and 5b became one step, a talking scene, and the separate scene code proposal was dropped. Steps 4 to 6 give a usable version 2. Steps 7 and 8 wait until the owner has used it.
- **What a character is (step 1):** today's SVG rig is front-facing with no legs, and AI characters are front-facing pictures that swap. Decide which views and motions version 2 needs, and which character types must support them. Each extra view for an AI character means more painted images and more mouth measuring.
- **Character art source (step 1):** evaluate open illustration libraries and the planned rigged SVG workflow before choosing the first reusable cast. See [Character sources](#character-sources).

## Character sources

Existing illustration libraries can supply character art, as long as their licence allows bundling the files in Kitta. Check each licence on the library's own site before shipping.

| Library | Licence | What it offers | Use in Kitta |
| --- | --- | --- | --- |
| [Open Peeps](https://www.openpeeps.com) | CC0 | Hand-drawn, mix-and-match heads, faces, hair, accessories and body poses (standing, sitting) as SVG | **Use.** Faces map to expressions and body poses map to actions, swapped like AI character poses. The face's mouth is covered by Kitta's talking mouth, as for AI characters. [`@dicebear/open-peeps`](https://dicebear.com/styles/open-peeps) builds the busts from code. |
| [Humaaans](https://www.humaaans.com) | Free; sources disagree on the exact licence | Mix-and-match full bodies with legs: heads, tops, bottoms, standing, sitting and walking poses | **Inspiration first.** Faces are too simple for expressions and lip sync, but the separate legs suit step 9. Confirm the licence before bundling any file. |
| [Open Doodles](https://www.opendoodles.com) | CC0 | Whole hand-drawn scenes, not split into parts | **Sets and props.** Not a rig, so not for characters. |
| [Getillustrations](https://www.getillustrations.com) | Paid, tiered; the free tier needs a visible credit | Packs of finished illustrations | **Inspiration only.** Its terms don't allow bundling the files in a product for end users without the Extended licence. Creators can still import packs they bought through the asset library. |

Open Peeps is the first library candidate to evaluate for reusable character parts. It must pass the same expression, talking-mouth and idle-motion checks as a hand-built rig before adoption. One scene should use one art style, so it should not be mixed with the current flat SVG rig without an explicit style decision.
