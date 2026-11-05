# First scene findings

Sample: "The Missing Mango", `samples/first-scene`. 4 lines, 5 shots, 10.11 s, 304 frames at 30 fps, voiced by VoiceStudio.

## Render times

| Version | Render time | Per video minute |
|---|---|---|
| Two SVG starters (`first-scene`) | 4.1 s | about 24 s |
| AI character Max + SVG starter (`first-scene-art`) | 20.0 s | about 119 s |

Per video minute = render seconds / (10.111 s / 60). The times are from the re-export after the clip fix (the first export measured 6.8 s and 22.1 s; the difference between the runs was not investigated). They cover frame rendering and encoding only, not the VoiceStudio build (the whole first command took about 37 s wall time including the voices). The AI version is about 4.9 times slower (cause not investigated). Two AI characters remain unmeasured: only one AI character plus one SVG character was exported, and no second character was painted to measure it.

## What I observed

Frame checks were done from extracted MP4 frames (one per shot, both videos). The AI version replaces only Mina with Max; Rafi stays the SVG Milo. Controller browser results: at five paused moments the shot names and cameras were correct, only the speaker's mouth was open, a paused scene held still, and the preview matched the MP4 frames at all five shots. Across 304 frames the two characters never blinked together and their sway was never identical.

- Audio is 10.111 s and video is 10.133 s, a 0.022 s gap, inside the 0.05 s limit. Same for both files.
- All five shots frame the characters with heads inside the frame. No framing numbers needed changing.
- In the wide shot both characters are cut by the bottom edge at scale 0.8, so the lower body is not visible. Acceptable for a talking scene, but a v2 stage may want a visible ground line.
- The two close-ups with 1.8 or 2.0 zoom show a lot of empty set beside the face. The face fills about a third of the width.
- Found and fixed: Mina's pointing hand was cut flat at her character box edge, because the SVG rig's root `<svg>` hides overflow. The root now has `overflow="visible"` and the hand is whole in both videos.
- Expressions read clearly: Mina's confused, thinking and angry faces, and Rafi's worried face, are distinct in both character types.
- Sharing a set works: a painted character and a flat SVG character sit together, but their line weight and shading differ visibly.

## What step 2's data model needs from this

- Per-actor timelines and shots resolved from one source worked without change: no schema problem showed up.
- A per-character ground or feet anchor, so scale and placement do not cut the body at the frame bottom.
- Render time scales with character type, so a progress estimate should depend on whether a character is painted.
- A project records its visual style, because each project uses one style.

## Character decision

The owner watched both videos and found the scene convincing, then decided:

- **Types:** support both SVG and AI characters, with one style per project.
- **SVG style:** Kitta writes the code for each scene.
- **Later option:** Kitta can use external image and video generation models for each scene, through the OpenArt MCP, to generate each scene's illustration as an image and video.
- **Views:** front only for now.
- **Motions:** today's gestures and listener reactions. Walking comes later.

The videos reviewed are `data/scenes/first-scene/first-scene.mp4` and `data/scenes/first-scene-art/first-scene-art.mp4`.
