# First scene implementation notes

Open Kitta and select **Scene sample**. The sample script is in [scene-sample.json](../shared/scene-sample.json). Generate the scene to record three lines with local VoiceStudio, derive mouth cues with Rhubarb, and render an MP4. The audio drives the browser preview. The preview and exporter use the same [SceneView](../shared/SceneView.tsx).

The sample uses two existing SVG starters behind a market counter, with a wide shot, speaker close-up, and a listener cut before the final line. The initial character choice is front-facing SVG rigs for dialogue scenes. This keeps the acting editable with Kitta's existing poses and avoids requiring side views, walking rigs, or painted pose sets for the first milestone. Those choices remain open for later scenes.

The browser-generated sample took 4.4 seconds to render on this Mac, excluding speech synthesis and cue preparation. The MP4 is 7.13 seconds at 1920 × 1080 and 30 fps, with H.264 video and AAC audio. Browser generation, the wide preview, and the download link were checked. Full listening and shot-by-shot preview/export comparison are still open.
