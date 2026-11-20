# Better SVG characters: agent skill plan

Today's SVG characters are three code-drawn starters (Kit, Milo, Pip) built from ellipses in `shared/character/Character.tsx`. They animate well but look plain. This plan adds a reusable **agent skill** that any coding agent (Claude Code, Codex) can follow to draw a much better, **rigged** SVG character. Kitta then loads it like any other character. Blender comes later as a second, separate skill for full-body motion.

## Style target

Use the references in `gopal_var_svg_reference/` (frames from the *Gopal Bhar* TV series) **for style only**. The skill draws original characters and never copies Gopal, his wife, or any other existing character's face, outfit, or name. Keep that folder out of git.

What the style looks like, written down so the agent can check its own work:

- **Flat colour fills** with at most one cel-shade tone per material, and no gradients on skin.
- **One dark ink outline** (`#2d2a32`, about 5 units on a 1000-unit canvas), slightly thinner on inner detail lines such as fabric folds, nails, and the chin.
- **Caricature proportions:** a big head (about a third of the body height), a round or pear-shaped torso, short legs, small feet, and expressive hands with clearly separated fingers.
- **Faces:** a big bulbous nose, small round eyes with thick brows that carry the emotion, ears set low, and a bald crown or simple hair masses with a few strands drawn as lines.
- **Clothing as simple shapes with a few fold lines:** kurta, dhoti, saree, gamchha (scarf), and turban, in saturated village colours such as turmeric yellow, vermilion, indigo, and leaf green.
- **Front view only for now**, matching the owner's v2 decision.

## How it works

```
brief ──▶ agent drafts parts ──▶ check-pack renders a contact sheet ──▶ agent looks, fixes (≤ 3 rounds)
                                          │
                                          ▼
                              character pack (folder) ──▶ Kitta imports it as a "rig" character
```

**Why the agent writes SVG by hand rather than vectorising an AI painting:** auto-traced art (potrace or vtracer) gives one flat tangle of paths with no parts, pivots, or mouth shapes, so it can't move. Hand-written parts are rig-ready from the start. Quality comes from the **render → look → fix** loop and from a library of reusable shapes, not from a single attempt.

### The character pack (the contract between the skill and Kitta)

The pack is a folder holding one `pack.json` file plus one SVG file per part. It uses a 1000 × 1000 canvas, the same as today's rig, with the feet on a baseline at y ≈ 970.

| Part group | Parts | Pivot (in `pack.json`) |
|---|---|---|
| Body | `leg-left`, `leg-right`, `torso`, `accessory-*` (scarf, pot) | hips, for legs (needed later for Blender walks) |
| Arms | `arm-{side}-upper`, `arm-{side}-fore`, `hand-{side}-{open,fist,point}` | shoulder, elbow, wrist |
| Head | `head` (face base + ears), `hair`, `nose` | neck, for head tilt and nod |
| Face | `brow-{side}`, `eye-{side}` (open), `lid-{side}` (blink), mouth shapes `A`–`H` and `X` (Rhubarb visemes) | brow centre, eye centre, `mouthAnchor` |

`pack.json` holds the name, the palette, the draw order, each part's file and pivot, and **expression parameters** (brow angle and lift, lid closure, and mouth mood for each of the 11 expressions). Most expressions then come from moving parts rather than drawing 11 faces. A pack may still add an override eye or brow drawing for an expression that needs it.

Every SVG must pass the existing sanitizer (`staticSvg` in `server/set-svg.ts`), so nothing generated is ever executed.

### What the skill contains

```
skills/kitta-svg-character/
  SKILL.md              workflow the agent follows (brief → parts → check → fix → hand off)
  style-guide.md        the style rules above, with good and bad examples
  rig-contract.md       part names, pivots, canvas, pack.json schema
  shapes/               reusable starting parts: bodies (thin, round, pear), kurta, dhoti, saree, gamchha, turban, hands, 9 mouths
  scripts/check-pack.ts validates a pack and renders a contact sheet PNG
```

`check-pack.ts` reuses `staticSvg` from `set-svg.ts` (made exported) and `@resvg/resvg-js`, both already dependencies. It does three things:

1. It checks that every required part exists and that each pivot sits inside its part.
2. It renders a contact sheet: a neutral full-body pose, all 11 expressions, all 9 mouths, a blink, and 3 gestures (wave, point, shrug).
3. It prints the problems it finds. The agent opens the PNG, compares it with the style guide and the brief, and fixes what's off.

## Plan

| Phase | What | Done when |
|---|---|---|
| **A. The skill** | Write `skills/kitta-svg-character/` and `check-pack.ts`, plus **two sample original characters**: a stout village trickster and a stern village woman with a clay pot, matching the reference style without copying it. | Both packs pass `check-pack`, and their contact sheets are shown to the owner, who judges whether they're "nice-looking enough". |
| **B. Kitta loads packs** | A new character kind, `rig`, that draws a pack from `FrameState`. Brows, lids, and mouth come from the expression parameters and the existing mouth cues, and arms reuse the `reach`/gesture angles. Packs are imported into a project like sets. | A pack character speaks with lip sync in a scene, and preview and export match. Kit, Milo, Pip, and AI characters are unchanged. |
| **C. Blender skill (later, separate)** | `skills/kitta-blender-motion/`: headless `blender -b --python` scripts (Blender 5.2.3 is installed). They import a pack's parts as layers, build a 2D armature on the pivots, and key a walk, sit, or stand. Then they **bake the part transforms per frame to JSON**, which Kitta replays on the SVG. | One walk-in clip plays on a pack character in Kitta, and the feet don't slide. This replaces or feeds step 8 (CMU). |

**Why Blender bakes JSON instead of rendering video:** the character stays vector, lip sync and expressions stay in Kitta, and preview and export still use one `SceneView`. Blender is only the motion tool. No Blender MCP or new npm dependency is needed: the scripts run through the `blender` CLI.

## Open decisions for the owner

1. **Order:** do phase A now, alongside step 4? It touches no app code. Phase B would then come before or right after step 4.
2. **Skill location:** in this repo (`skills/`, versioned with the rig contract), or also copied to `~/.claude/skills` for use in other projects?
3. **Sample cast:** are the two sample characters above the right first test, or do you have specific original characters in mind?
