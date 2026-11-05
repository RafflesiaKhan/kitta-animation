# Kitta Animation version 2 product plan

Kitta becomes a workspace for creating recurring 2D cartoons. A creator builds a cast and a world once, then uses them to produce individual episodes with AI assistance. The reference is the production pattern observed in Gopal Bhar: reusable characters and locations, economical poses and gestures, dialogue and reaction cuts, and occasional full-body action.

This journey replaces today's Character → Voiceover → Animate → Export flow. Kitta's existing animation, lip-sync, voice, and export functions carry over rather than being rewritten. Full-body action arrives after dialogue scenes are working.

## Creator journey

1. **Create a project.** Name the series and capture its premise, visual direction, and recurring cast. Recommend creating a character first while keeping every section accessible.
2. **Build the asset library.** Create or import characters, backgrounds, reusable scene templates, props, creatures, and audio. A character can have multiple views, expressions, poses, motions, and a default voice. An episode can override that voice.
3. **Write an episode.** Enter a script or ask the Director to draft one. Choose narration or character dialogue. In narration mode, the narrator carries the story while characters act silently. In dialogue mode, assign a voice to each speaking character and derive mouth cues from their audio. Use VoiceStudio for generated speech.
4. **Direct the scenes.** Ask the Director to propose a scene breakdown from the script and available assets. Review the proposal before adding it. For each scene, pick a background, cast the characters, place props, assign dialogue or narration cues, and choose motions, expressions, and camera angles. Create missing assets from the scene and make them reusable in the project.
5. **Edit and review.** Set scene order, transitions, and timing after the scene plan is in place. Review a representative shot with actual sound before assembling the episode. Check character continuity, voice timing, reactions, and cuts before export.

## AI Director

The Director opens from a floating robot button, leaving the project visible. It should know the current project, episode, and relevant assets. It can answer creative questions, draft scripts, propose scenes, and call specific project actions. For example, a background request should return a preview and a library entry that can be selected in any scene. Scene proposals remain drafts until the creator accepts them. The Director uses the LLM the creator chose in Settings.

## Settings

Creators bring their own API keys. On the Settings page they add a key for the LLM they want to use, such as OpenAI or Claude, and save it. They choose the Director model and the image provider separately, because an LLM provider may not generate images. Saved keys appear masked. Without a key, AI actions are disabled and everything manual keeps working. Settings will hold more configuration in future.

## Current prototype

Open [product-poc.html](product-poc.html) and choose **Explore a sample project** to inspect the workflow. The chat uses scripted responses. It can demonstrate saving a template-generated SVG background and drafting a script for a blank episode. IndexedDB stores the current prototype workspace and imported media in the browser. Live AI, Settings, voice generation, scene rendering, and final export are implementation work.
