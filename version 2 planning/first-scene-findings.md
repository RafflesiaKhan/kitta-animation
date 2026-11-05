# First scene findings

Sample: "The Missing Mango", `samples/first-scene`. 4 lines, 5 shots, 10.11 s, 304 frames at 30 fps, voiced by VoiceStudio.

## Render times

| Version | Render time | Per video minute |
|---|---|---|
| Two SVG starters (`first-scene`) | 6.8 s | about 40 s |
| AI character Max + SVG starter (`first-scene-art`) | 22.1 s | about 131 s |

Per video minute = render seconds / (10.111 s / 60). The times cover frame rendering and encoding only, not the VoiceStudio build (the whole first command took about 37 s wall time including the voices). The AI version is about 3.3 times slower (cause not investigated).

## What I observed

Checked from extracted MP4 frames only (one per shot, both videos); the browser check and judging the feel are not done here.

- Audio is 10.111 s and video is 10.133 s, a 0.022 s gap, inside the 0.05 s limit. Same for both files.
- All five shots frame the characters with heads inside the frame. No framing numbers needed changing.
- In the wide shot both characters are cut by the bottom edge at scale 0.8, so the lower body is not visible. Acceptable for a talking scene, but a v2 stage may want a visible ground line.
- The two close-ups with 1.8 or 2.0 zoom show a lot of empty set beside the face. The face fills about a third of the width.
- Wide shot, SVG version: Mina's pointing hand ends in a flat vertical cut at about x = 920 (the arm is clipped). Looks like a clip rectangle around the arm or gesture drawing; not looked into.
- Expressions read clearly: Mina's confused, thinking and angry faces, and Rafi's worried face, are distinct in both character types.
- In the AI version the wide frame shows Mina pointing with a drawn hand and no clipping; the hand clip is specific to the SVG character.
- Sharing a set works: a painted character and a flat SVG character sit together, but their line weight and shading differ visibly.

## What step 2's data model needs from this

- Per-actor timelines and shots resolved from one source worked without change: no schema problem showed up.
- A per-character ground or feet anchor, so scale and placement do not cut the body at the frame bottom.
- Gesture drawing that is not clipped (see the hand above).
- Render time scales with character type, so a progress estimate should depend on whether a character is painted.

## Character decision

Pending the owner's review.

Which views, which motions, and which character types a v2 character must support is for the owner to decide after watching both videos:

- `data/scenes/first-scene/first-scene.mp4`
- `data/scenes/first-scene-art/first-scene-art.mp4`
