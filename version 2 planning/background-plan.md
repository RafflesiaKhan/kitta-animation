# Backgrounds in the studio

Today the studio (Character, Voiceover, Animate, Export) can only export a character on white or on a transparent background. Someone who wants "my avatar talking in my classroom picture" has to put the two together in another editor. This plan adds a **Background** choice to the studio, so the character talks in front of the picture and the export already has both. It also adds a transparent format that video editors like Premiere and Final Cut open.

## What exists today

| | Studio (4 steps) | Projects (beta) |
| --- | --- | --- |
| Transparent video | Export has "Transparent background (WebM)": VP9 with alpha (`server/render.ts`) | n/a |
| Own background | None: white or transparent only | Import a PNG, JPEG or SVG as an asset and pick it as an episode's set (step 3), one character, no placement |
| Background made by AI | None | Planned with the Director (step 5) |

`server/sets.ts` (`prepareSet`) already turns an uploaded PNG, JPEG or SVG into a safe PNG, with SVGs passing the step 3 sanitizer. The studio should reuse it, not add a second path.

## What the person can do

| Choice | What it does |
| --- | --- |
| **Transparent** | Today's transparent export, now in two formats: **WebM** (browsers, CapCut, DaVinci Resolve) and **MOV, ProRes 4444** (Premiere, Final Cut, After Effects). The page says which editors open which. |
| **Colour** | A solid colour, picked from a swatch. White stays the default for MP4, so today's exports don't change. |
| **Picture** | Upload a PNG, JPEG or SVG. It fills the frame (cover, centred) in 16:9 or 9:16. The last few pictures are kept, so they can be picked again. |
| **Place the character** | Drag the character on the background, resize it with a slider, and flip it to face left or right. The preview shows exactly what the export will. |

A picture or colour turns the export into a plain MP4. The transparent option stays separate, since a background and transparency can't both be in one file.

## Where things live

- Uploaded backgrounds: `data/backgrounds/<id>.png`, the output of `prepareSet`, with a small `meta.json` (name, size, added). They're the owner's files, like characters.
- The choice (background, placement) is kept with the studio's current work, like the timeline, and sent with the export request.
- The studio previews and exports through `CharacterView` (`src/Preview.tsx`, `renderVideo` in `server/render.ts`). The background is drawn as a layer behind it, shared by both, so preview and export stay one code path. If `renderVideo` skips repeated frames by a key, the key must include the background and placement, or a frame can freeze with no failing test.

## How it connects to the rest

- **Talking scene (step 4):** the same background picker becomes the scene's set, and placement becomes each cast member's position. Step 4 reuses this, and doesn't build its own.
- **Projects:** a studio background can be saved into a project as a set asset, and a project set can be used in the studio.
- **Director (step 5):** "make me a sunny classroom" creates a background through the same store, with the cost shown first.
- **Walking (action library step 5):** a Move block walks the character across the background, so placement is a starting point that actions can change over time.

## Steps

| Step | Build | Check |
| --- | --- | --- |
| 1 | Background store and upload, reusing `prepareSet` | A PNG, a JPEG and an SVG each become a safe PNG; a hostile SVG runs nothing and loads nothing external |
| 2 | Background choice and placement in the studio, drawn behind `CharacterView` | Preview and an exported frame match, in 16:9 and 9:16, for a picture, a colour and transparent |
| 3 | MOV (ProRes 4444) as a second transparent format | The MOV opens with transparency in an editor; WebM still works; today's MP4 export is unchanged |

## Open decisions

- **Where the picker sits:** in Animate (where you watch the preview) or in Export (where the format is chosen). Planned: Animate, with Export showing the current choice.
- **Video backgrounds:** a looping video clip behind the character. Later, if wanted; it makes export slower.
- **Background movement with the camera:** a slow zoom or pan on the background. Belongs with the camera lane (action library step 7).
