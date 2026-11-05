# Step 9 (optional): Test full-body motion with CMU

Run this only if the owner asks for it. Read `version 2 planning/codex-prompts/shared-rules.md` and follow it, including the subagent stages. Then read the "Motion capture" section of `version 2 planning/implementation-plan.md`.

## Goal

Find out whether one CMU "walk in" clip looks right on a cartoon character. This is a test. Don't build a clip library.

## First, check the licence

Read the terms on CMU's own site, `mocap.cs.cmu.edu`. An earlier check couldn't open it, and other sites disagree. Quote the relevant terms and the source in your report. **If you can't confirm them, stop and tell the owner before downloading anything.**

Use CMU's own files or the cgspeed BVH conversion, because at least one FBX conversion is marked non-commercial. Tell the owner the file, source, and size before downloading. Keep it outside the repo. Commit only the small baked clip, with its source noted, and only if the licence allows it.

## Build

- A legged character for one test: a new SVG rig variant with hips, knees, and ankles, probably side-on. Don't change the existing rigs.
- An offline script that turns one clip into 2D joint angles saved as JSON: project each bone onto a plane, then rotate the 2D bone to match, keeping bone lengths fixed. The app never reads mocap files while running.
- Playback through the existing action clip progress, so preview and export stay matched. Add a character position over the clip for walking, through `SceneView`, and update `renderScene`'s frame-skip key.
- Reduce the clip to key poses and hold them, so it suits economical animation.

Keep this behind the test, away from the normal character list, until the owner decides.

## Not in this step

AI-painted characters, because they have no joints. Small acting moves such as "leans forward", which hand-built gestures handle better. More than one clip.

## Acceptance

1. Render the walk-in beside a hand-built gesture from the same scene, and share the MP4 path for the owner to judge. Say plainly that this judgment is theirs.
2. It reads as the same cartoon style, and the feet don't slide along the ground. Report frames where they do.
3. Export matches preview at several points in the walk.
4. Existing characters and scenes are unchanged.
5. The report gives a recommendation: build a library, or stop, with reasons and the licence result.
