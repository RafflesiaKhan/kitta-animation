# Kitta Animation version 2 implementation plan

Use [the product plan](product-plan.md) and [the HTML prototype](product-poc.html) as the starting point. Build one small workflow at a time and verify it through the UI before expanding it.

| Step | Build | Acceptance check |
| --- | --- | --- |
| 1. Projects and storage | Add project and episode records with stable IDs and a project-scoped asset library. Persist project metadata and references to media. | Create two projects, import an image, SVG, and audio, then reopen the app and confirm each project has the correct assets. |
| 2. Characters and worlds | Add reusable characters, backgrounds, props, creatures, and scene templates. Start with the character editor and reusable poses. | Use the same character and set in two episodes and confirm an episode can keep its own performance choices. |
| 3. Scripts and voices | Save episode scripts, choose narration or dialogue, assign VoiceStudio voices, and attach audio to narrator or speaker cues. Reuse Kitta’s existing single-character lip-sync workflow where it fits. | Play a short narrated beat and a two-speaker exchange. Confirm the intended voice is attached to each cue and only the active speaker receives mouth cues. |
| 4. Director actions | Connect OpenAI through a server-side integration. Start with script drafting, scene proposals, and background generation. Expose explicit project actions with validated inputs and show success only after saving. | Generate a background from chat, reopen the project, and select it in a scene. Accept a scene draft and verify it attaches to the correct episode. Retry a failed request without duplicating saved assets. |
| 5. Scene composition | Place cast and props on a set, choose poses and motions, and switch cameras. Preview with recorded dialogue. | Assemble a wide shot, a speaker shot, and a listener reaction with two characters and one set. Review a short sample with sound. |
| 6. Editing and export | Add scene order, transitions, timeline adjustments, audio mix, and episode export. Select the renderer after the scene preview is proven. | Render a short episode, then check shot boundaries, sync, continuity, audio, and exported playback. |

## Storage and service boundaries

The HTML prototype uses IndexedDB for a local demonstration. For a desktop-first implementation, **SQLite for project metadata plus a managed media directory** is the proposed starting point. Store project, episode, asset, scene, cue, and generation-job records in SQLite. Store image, SVG, audio, and video files in the media directory. Record each file’s location, media type, and provenance in its asset record. Revisit this choice if shared or hosted projects become a requirement.

The OpenAI model would run through the app server and invoke validated actions for the active project. Keep API keys on the server. A generation job should track pending, failed, and completed states. Save media and metadata before exposing an asset in the library, and use the job ID to make retries safe. VoiceStudio owns generated speech. The scene preview and final renderer consume the saved episode plan and media.

The first useful production milestone is a short original scene with two characters, one set, VoiceStudio dialogue, and a reaction cut. Use that sample to test which parts of Kitta’s existing character workflow can carry over and what the episode compositor needs to add.
