# Reference image → reusable SVG character pack

Status: proposed implementation plan; no feature code implemented by this document.
Date: 2026-11-28.
Target checkout: `/Users/rafflesiakhan/Documents/ChatGPT/html-animated-vedio/slide/kitta-animation-talking-scene`, branch `better-character` (inspected at `06f8a64`).

## 1. Feature and completion boundary

Add a **+ Create from reference (SVG)** tile to Kitta's character screen. The user uploads a reference image, selects Claude or OpenAI and a supported model, optionally describes the character, and clicks Create. Kitta generates a reusable character with views, expressions, speech shapes, gestures and body actions, then saves it to the character library.

Preserve all current starters, picture characters, vector-avator creation/import, saved projects, voiceover, script and export flows. This is an additional character option. Existing SVG projects must be able to save and reuse the new character. Do not build a replacement episode editor, change project styles, introduce Blender, or replace the existing render engine.

Generate the richer properties now and provide a character-sheet preview of all of them. Connect the subset supported by today's Animate controls immediately. Adding timeline lanes for views, simultaneous gestures, locomotion and the extended expression catalog is a separate subsequent task. A generated preset must be real and previewable even when the timeline cannot yet select it.

This plan extends the older `svg-character-skill-plan.md` and `action-library-plan.md`. Their front-only and small expression-set assumptions do not define this new feature. Keep those files as history. Some code references `vector-create-plan.md`; that document was not present in this checkout.

## 2. What the existing code already supplies

| Existing area | Reuse / required extension |
| --- | --- |
| `server/anthropic.ts`, `server/openai.ts`, `server/tool-chat.ts` | Existing server-side credentials, image input and structured tool output. Add bounded per-stage request options while preserving current callers. |
| `server/vector-create.ts`, `shared/vector-job.ts` | Follow the existing durable job, cancellation, restart and resume pattern. Use a separate SVG job schema and endpoints. |
| `server/usage.ts` | Record usage per stage, retries and complete job. |
| `shared/character/CharacterView.tsx`, `shared/SceneView.tsx`, `server/render.ts` | Add one renderer dispatch branch; retain the same preview/export composition. |
| `shared/types.ts`, `shared/marks.ts`, `shared/actions.ts` | Adapt existing FrameState, eleven legacy expressions, A–H/X speech cues and compatible actions. Current single-gesture marks do not provide a multilayer timeline. |
| `src/steps/CharacterStep.tsx` | Add tile, creation form, job card and character-sheet browser. Existing create tiles are hidden in project context; explicitly enable this new SVG option in SVG projects. |
| `src/ProjectCharacters.tsx`, `shared/scene.ts`, `server/projects.ts`, character loaders | Add a persisted SVG-pack reference, preserving old starter configs and `{artId}` records. Project integration requires these changes, not just a new tile. |

Today's vector export uses a 768-pixel intermediate image (`server/vector.ts`). That is a plausible source of softness when enlarged, not a measured diagnosis of every user export. This new path keeps artwork as SVG until rasterization at the final output resolution. TypeScript itself does not guarantee sharpness; the rendering path does. Repairing the existing vector export is separate scope.

## 3. Architecture: generate artwork and bindings once, reuse motion

Use **LLM-generated SVG parts and structured pose data, rendered by trusted TypeScript**. The output is editable code-drawn artwork, not a flattened image. Do not execute arbitrary model-generated TypeScript on the server. A validated pack can later be exported as a deterministic TypeScript module without making executable source the storage format.

Separate three things:

1. Character artwork: silhouette, face, hair, clothing, hands/paws, proportions and view-specific drawings.
2. Character bindings: pivots, joints, hand anchors, feet, facial controls, view-specific layering and motion adjustments.
3. Shared behavior recipes: timing and movement for wave, walk, blink, talk, etc. Each character receives validated bindings and overrides for those recipes.

Do not generate a complete drawing for every expression × mouth × gesture × view combination. Compose independent channels, with special replacement drawings where rotation alone would look wrong. Bent elbows, foreshortened hands, crossed arms and seated clothing often need replacement shapes.

### Proposed pack contract

A versioned `SvgCharacterPack` contains:

- Identity, source-reference hash, selected provider/model, generation version and provenance.
- Body family and capabilities: hands, paws, wings, tail, supported views and contact anchors.
- Full-body dimensions, waist-up/full-body framing bounds, safe customization ranges.
- Per-view SVG parts, stable IDs, parent hierarchy, pivots, draw order and occlusion masks.
- Facial controls and replacement shapes; expression presets with intensity ranges.
- A–H/X mouth variants for each speaking view; explicit invisible-mouth status for rear views.
- Gesture and action bindings, timing overrides, allowed channels and required capabilities.
- Completeness manifest, preview assets, validation results and immutable pack version.

Store under the existing character storage root, using a new discriminator such as `kind: 'svg-rig'`. Add an explicit type guard. Audit places where “not art and not vector” currently means “starter”; otherwise the new character may accidentally enter starter-only code.

For saved scenes/projects, introduce a versioned SVG reference (for example `{svgId, packVersion}`) and retain existing `{artId}` and starter formats. Regeneration creates a new pack version so old scenes remain reproducible.

### Body shape and framing

Infer original proportions from the reference. Offer bounded changes to height, torso width/belly, head ratio, shoulder width and limb lengths. Recompute joints and ground contacts; do not merely stretch the entire SVG. Major edits outside the authored range regenerate affected parts while retaining identity and presets.

Waist-up and full-body are camera/framing choices over the same complete character. If the uploaded image hides the legs or back, the model must infer those areas consistently; record that they are inferred, rather than claiming exact reconstruction.

## 4. Proposed preset catalog

This is the target catalog for the feature, not a claim that it is already implemented or an exhaustive list of human emotion. Stable IDs allow later additions. Every preset needs a visual specification and a rendered example, not just its name.

### Views

Front, three-quarter left, three-quarter right, profile left, profile right, back. Preserve identity, clothing and asymmetric accessories across views. Mirroring is allowed only when it preserves those details. View changes initially use authored switches/crossfades; arbitrary smooth rotation is not promised.

### Facial expressions: 36 starting presets

| Group | Presets |
| --- | --- |
| Neutral / attention | neutral, attentive, focused, thinking, curious |
| Positive | happy, content, excited, delighted, laughing, proud, affectionate, relieved |
| Distress | sad, crying, worried, scared, panicked, embarrassed, shy, disappointed |
| Conflict / judgment | angry, furious, annoyed, disgusted, determined, suspicious, skeptical, smug, unimpressed |
| Surprise / uncertainty | surprised, shocked, confused |
| Low energy / playful | sleepy, tired, wink |

Preserve all eleven existing expression IDs. The extended catalog stays pack-level until timeline/schema expansion; do not silently collapse distinct presets to the same legacy face and call them complete.

Each definition describes brow angle/height, eyelid shape, gaze, cheek tension, mouth corners and optional head posture. Support separate left/right controls and expression intensity. Wink is technically a facial action but remains a compatibility preset. Crying and laughing need timed behavior as well as a still pose. Add any tears as optional parts, not baked raster effects.

### Speech and idle behavior

Provide the existing nine A–H/X mouth states in every speaking view. Preserve emotion while talking: speech controls aperture/viseme, while expression retains brows, lids and compatible mouth-corner shaping. Validate teeth/tongue clipping, closed-mouth silence and transitions with real Rhubarb cues.

Idle controls: blink, double blink, glance, look toward target, breathing, slight head tilt, subtle weight shift and listener nod. Use seeded timing and explicit time; no wall-clock animation loops or unseeded randomness in exports.

### Gestures: 24 initial recipes

Wave, point left, point right, point up, point down, present left, present right, explain with both hands, shrug, palms-up question, stop, beckon, thumbs-up, clap, folded arms, hands on hips, chin touch/thinking, hand to chest, greeting/namaste, salute, head nod, head shake, head scratch, facepalm.

Each specifies anticipation, main pose, hold/repetition, recovery, hand shape, affected joints and blend rules. A wave includes shoulder/elbow support and wrist follow-through, rather than rotating a detached hand.

### Body actions: 14 initial recipes

Stand/idle, walk, run, tiptoe, turn toward target, sit down, seated idle, stand up, bend/reach, crouch, jump/land, bow, recoil, celebrate.

Walk/run expose cycle phase and speed; root travel is separate from leg cycling. Define contact intervals, pelvis motion, knee bend, arm counter-swing and start/stop transitions. Seated actions accept a seat anchor; reach accepts a target. Prop artwork and physical interactions are not generated for every possible object.

### Animal capabilities

Humans and upright animal characters share biped recipes, with species-specific hands/paws, muzzle/beak, ears and tail. Quadrupeds require a separate four-leg gait/contact profile; birds need wing-specific bindings. Do not claim a human skeleton supports arbitrary animals automatically.

Implement and validate biped humans and upright animals first. Add quadruped and bird profiles as explicit subsequent feature slices before advertising general animal support. The creation form must state supported body families. A missing mandatory binding is an incomplete generation, not an invisible fallback. Optional tail/ear/wing behaviors are marked not applicable when the body lacks that feature.

### Composition rules

A deterministic pose evaluator layers root travel, lower-body locomotion, torso, arms/hands, head/gaze, expression, speech and blink. Gesture ownership masks suppress only overlapping walk arm-swing channels. Speech must not erase the rest of the face. Conflicting same-channel actions use explicit priority/crossfade rules.

A character-sheet composition test must demonstrate **walking + waving + talking** before timeline expansion. The future timeline will feed this evaluator rather than invent another animation system.

## 5. Open-source references and generation skills

Use these as curated reference material. Their presence is not a reason to add runtime dependencies or transmit whole repositories to every model request.

| Source | Useful reference | Boundary |
| --- | --- | --- |
| [critter-heads](https://github.com/Elgen69/critter-heads) | SVG characters, facial/body pose separation, character-specific acting and deterministic rendering. Inspected `rig.js`, `poses.js` and related parts. | MIT; animal examples guide bindings, not a replacement for reference-image likeness. |
| [kabi-mascot](https://github.com/bryllim/kabi-mascot) | 29 poses, layered moods and rigged gesture timing; shoulders, wrists and follow-through. | CC BY 4.0; retain attribution for adapted materials. Rive runtime is not required. |
| [OpenBone](https://github.com/UXCentury/open-bone) | Track mixing, crossfades, constraints and animation baking. | MIT code; verify example artwork separately before copying it. |
| [Kugutu](https://github.com/neka-nat/kugutu) | JSON + SVG character packs, semantic controls, expressions, gestures and speech bindings. | MIT verified. Pack design reference; browser CSS playback does not prove Kitta seek/export compatibility. |
| [blob-avatar](https://github.com/c0le0ni/blob-avatar) | 26 named facial expressions and SVG expression examples. | MIT verified. Face vocabulary reference; blob anatomy is not a human body template. |
| [Grimace](https://github.com/grimace-project/grimace) | TypeScript facial expression blending and intensity across six base emotions. | MIT verified. Study feature relationships, do not impose its one face/style on all characters. |

`emotive-engine` is secondary material for emotion-driven timing/effects, not necessary to this feature. `Awesome-Real-Time-2D-Character-Animation` is a discovery directory, not an expression implementation.

Before incorporating examples, create a source registry recording exact commit, file, license, attribution and whether code or art is reused. Current repository inspection is a shortlist, not a completed reusable dataset or compatibility test.

### Skill package

Extend the existing planned `skills/kitta-svg-character/` concept with:

- `SKILL.md`: pipeline contract, outputs, completeness and repair rules.
- `reference-to-design.md`: likeness, silhouette, proportions, costume and inferred views.
- `rig-contract.md`: SVG parts, anchors, channels, supported body families.
- `expressions.md` and `speech.md`: facial construction and viseme interaction.
- `gestures.md` and `locomotion.md`: key poses, timing, contact and blending.
- `views.md`: consistency, occlusion and asymmetric details.
- `quality.md`: visual and structural acceptance checks.
- `references/`: compact source-derived cards and rendered pose examples.
- Validation/contact-sheet scripts used by the actual generation service.

These files must be loaded by the app's server-side generation pipeline. A skill installed only in a coding assistant does not automatically influence Claude/OpenAI API requests.

A reference card contains a semantic recipe, affected channels, representative key poses/timing, constraints, a small licensed/adapted example and source provenance. Retrieve only relevant cards for the current stage and body family. Do not send all libraries or all skills each time.

## 6. One Create button, staged generation internally

1. **Inspect reference:** infer identity, silhouette, proportions, outfit, body family and required capabilities; produce a compact blueprint.
2. **Draw canonical character:** generate layered full-body SVG, anchors and neutral face. Render it and compare with the reference. Repair weak likeness or detached parts before multiplying the design into views.
3. **Create views:** derive consistent alternate drawings and per-view bindings from the approved internal design state.
4. **Create face/speech sets:** generate facial primitives, expression definitions and mouths in bounded batches.
5. **Bind gestures/actions:** attach shared recipes, generate replacement poses where needed and add character-specific timing/shape overrides.
6. **Validate and repair:** render expression sheets, view sheets, action keyframes and short motion previews. Repair named parts/presets, not the entire character document.
7. **Publish:** save the complete pack and thumbnails, then expose it as a ready library item.

The user does not approve every internal stage. Show progress, cancel, retry and resume. Save intermediates and stage dependencies so fixing one expression does not repeat reference analysis or redraw all views. Structural or visual failures remain visible as incomplete jobs; publish only when required presets pass. Never copy the existing behavior of accepting output merely because some document was returned.

### Tokens and model selection

Snapshot provider/model per job; use existing configured credentials on the server. Expose a safe supported-model/capabilities endpoint rather than sending secrets or relying on the admin Settings interface. Models must support reference-image input and structured output.

Use a compact contract plus relevant cards per stage, stable part IDs and targeted replacement operations. Reuse the reference blueprint and accepted artwork. Set output and retry budgets per stage and a total job limit; report budget exhaustion with resumable progress. Conversation caching may help but is not a substitute for measuring billed tokens.

Measure total input/output tokens, retries, time and quality for the same reference against the existing vector flow. Do not promise a percentage saving in advance. Complete multiview artwork necessarily costs more than generating one basic front-facing character.

## 7. Validation and sharp export

Structural checks: schema/version, all required presets, finite transforms, valid bounds, unique IDs, joint references, supported view/action combinations and sane complexity limits. Sanitize SVG and reject scripts, external fetches and embedded bitmap character art. Reuse/extract the existing SVG sanitizer rather than writing an unrelated import path.

Visual checks: recognizable silhouette, stable costume across views, expressive eyes/brows/mouth, connected joints, consistent stroke weight, correct front/back overlap, planted feet and purposeful anticipation/recovery. More preset names do not by themselves produce natural-looking acting.

Render from explicit scene time through the shared SVG composition. Test random seeks, repeat seeks, loop seams and frame-rate independence. Render selected frames at final output resolution; avoid a fixed low-resolution character PNG intermediate. Verify both opaque video and the existing transparent export path, including edge quality.

No complete Cartesian-product test is required. Cover every preset individually, every view, all speech shapes, critical action boundaries and selected combinations such as walk+wave+talk, angry speech, seated speech and profile walking. Test at least two distinct human proportions and an upright animal. A contact sheet catches shape issues; motion previews are required to judge timing and foot sliding.

## 8. Delivery order and acceptance gates

| Slice | Work | Exit condition |
| --- | --- | --- |
| 1. Contract and reference cards | Pack schema, catalog, source registry, focused skill documents and one manually authored fixture. | Required sets are explicit; fixture renders and validates without an LLM call. |
| 2. Renderer and motion composition | New SVG character kind, view evaluator, facial/speech composition, body customization, framing and action bindings. | Same fixture previews/exports through SceneView; combination and repeat-seek tests pass. |
| 3. Generation jobs | Provider adapters, stage prompts, durable intermediate assets, usage limits, resume/cancel, targeted repair and publish gate. | Mocked Claude/OpenAI responses cover success, malformed output, missing preset, cancel and restart. |
| 4. New tile and integration | Reference/model form, progress, pack browser, compatible Animate selection and SVG-project persistence. | Create/select/save/reload works; existing character options and old projects still work. |
| 5. Real generation and visual acceptance | Approved provider calls, full catalog review, voiceover playback and final export comparison. | Human and upright-animal examples meet visual/structural requirements; actual usage and remaining limitations recorded. |
| Later | Extended timeline lanes and additional body families. | Separate scoped plans; no implication these controls already exist. |

Implementation should use focused tests for schema, deterministic composition, storage compatibility and job failure/resume. Run the repository's full required test/type checks at integration, then exercise the real UI from this exact checkout. Do not interfere with a server owned by another session.

The repository's shared rules prohibit unapproved paid generation tests. Planning and mocked tests do not need live provider calls. Request approval only when a concrete live test, selected models and spending bounds are ready.

## 9. What success means

A user uploads a reference, selects a model and clicks Create. One reusable character appears with a reviewable sheet of the promised views, expressions, speech shapes, gestures and actions. They can select waist-up/full-body framing, make supported body adjustments, use current voiceover/Animate controls, save the character in an SVG project and export crisp video. Existing Kitta choices continue working.

The complete property set is reusable and prepared for later timeline expansion. The important proof is recognizable artwork performing believable motion with measured token usage—not merely valid SVG, a large expression dropdown or a successful API response.
