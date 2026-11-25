# Kitta Action Library Plan

Nov 24, 2026 · @Raff Kafia

## Summary

Make each action once, save it to a library, and drop it onto the timeline in every episode. Vector characters all share one skeleton, so a clip made once works on all of them: 10 characters × 20 actions means 20 clips, not 200 generations. After that, a 10-minute episode costs only its voiceover: about $0.70 on ElevenLabs, or nothing with VoiceStudio. The same 10 minutes of Masko talking animation would cost about $150.

The plan uses only what Kitta already has. Claude or OpenAI write each new action as a clip for your existing vector skeleton, the same way they already draw your characters, and Kitta checks it on a real character before saving it. No GPU and no extra software. A **+ New action** tile in the Animate palette starts it, and a few new timeline blocks add walking, two-person scenes and camera shots.

## What Kitta already has

Most of the engine is built. The gaps are the action list, the number of drawn faces, and moving through space.

| Piece | Where in the repo | State |
| --- | --- | --- |
| Lip sync | Rhubarb (WASM), `shared/vector-avator/core/lipsync.ts` | Done, free |
| Natural movement (nods, beats, blinks) | `shared/motion.ts` | Done, driven by lip-sync timing |
| Animate timeline | `src/steps/AnimateStep.tsx` | Done: drag or click a tile to add it at the playhead |
| 11 expressions | `shared/character/expressions.ts`, mapped in `shared/vector-avator/kitta.ts` | Vector characters draw only 4 faces (neutral, smile, surprised, troubled), so sad, angry, worried and confused all show "troubled" |
| 9 actions | `GESTURES` in `shared/types.ts`, 7 clips in `shared/vector-avator/motions/` | Hard-coded list; no way to add one from the UI |
| Legs and planted feet | `core/skeleton.ts`, `renderers/vector/vectorRenderer.ts` | Done, but no walk clip and no movement across the frame |
| Turned body (about 30°) | `renderers/vector/bodyView.ts`, reads `body30.json` | The renderer supports it; Create vector character does not draw one yet |
| Two actors, shots, listener reactions | `shared/scene.ts`, `samples/first-scene` | Works from `scene.json` and `npm run scene`; not in the Animate timeline |

The + cards today are in the Character step (starter, AI and vector character). The Animate palette has no tile for creating an action yet, so that is where the new one goes.

## How Create action works

Click **+ New action**, describe the move in words, and Kitta does the rest: the model writes the clip, Kitta checks it on a real character, and you approve it into the palette.

**Flow:** describe the move → the model writes keyframes → Kitta checks them on a real character (up to 4 rounds) → you approve → saved to the library.

It is the same loop Create vector character already uses, pointed at motion instead of drawing.

- **You type** "jumps back, shocked" and choose once, loop or hold.
- **Claude or OpenAI** gets the skeleton's bone list, two existing clips as examples and the rules, and returns keyframes.
- **Kitta checks** for unknown bones and draws frames at several points with the `vector-check` renderer; the model compares them with your words and fixes them, up to 4 rounds.
- **You approve** after previewing it on two or three characters, and it is saved to the library.

## The action library

An action is one JSON file in the format the clips already use (`think.json`: bone rotations, face and hands at key times), plus a few fields that let the palette list it and the timeline play it the right way.

```json
{
  "name": "scratch_head",
  "label": "Scratch head",
  "play": "once",
  "duration": 2.4,
  "tags": ["confused", "thinking"],
  "needs": [],
  "source": { "route": "describe", "model": "claude", "prompt": "scratches the back of the head, unsure" },
  "keys": [ { "t": 0, "bones": { "rightUpperArm": [0, 0, 70] } } ]
}
```

- **Three play modes.** `once` plays over its block (wave, shocked jump). `loop` repeats while the block lasts (walk, typing, laughing). `hold` eases in, holds the pose, then eases out when the block ends (arms crossed, hand on chin).
- **A face can ride along.** Clips already carry face keys, so "shocked" is one action: surprised face, jump back, squash.
- **`needs`** marks clips that only work on some characters, for example `legs` for a walk or `body30` for a turned pose. The palette greys them out for a character that lacks the part.
- **Shared by default.** Every vector character uses the same clip. A clip saved under one character's folder (a tail wag, say) overrides or adds to the shared set for that character only.
- **Expressions work the same way.** Draw more faces when a character is created (angry, sad, sleepy, excited), then map all 11 expressions one to one instead of onto 4.
- **Painted characters** still need one painted pose per action per character; they can't share clips.

In code, `Gesture` becomes a string id from the library, `GESTURE_MOTION` becomes a lookup, and `ActionMark.gesture` stores that id. Existing timelines keep working because today's nine names stay as ids.

## Walking, reactions, two-person talk and camera

Each of these is a clip plus one new kind of timeline block. Only a new camera angle needs new drawings.

| Want | How it works | New timeline block | Extra cost per character |
| --- | --- | --- | --- |
| Walking | A `loop` walk-cycle clip plays while a Move block slides the actor from one x to another; feet stay unplanted while moving | **Move** (from x, to x, over the block) | None |
| Shocked, laughing, jumping | `once` clips carrying their own face, written by the model | Action, as today | None |
| Talking with another person | Scenes already hold two actors with x, flip and listener reactions. Animate gets one set of lanes per actor; a **Look at** block turns the head (and the 30° body, if drawn) toward the other actor; the listener nods on the speaker's beats | **Look at** | None |
| Wide, medium, close-up | Scenes already have shots with zoom and focus; put them on a Camera lane | **Shot** | None |
| Reverse shot | Flip the stage and swap the actors' sides for a cut | **Shot** with flip | None |
| Three-quarter angle | The renderer already switches to `body30.json` past 15° of turn; Create vector character would draw that body once | Uses Look at or Shot | One extra drawing, cost to be measured |
| Profile or back view | Needs full new drawings per angle | Not planned yet | High; skip for now |

From the front, a walk reads as stepping toward the camera. A sideways walk across the frame looks best with the 30° body turned toward the direction of travel.

## Costs

You pay once per character and once per action. After that, each episode costs only its voice.

| Item | Cost | How often |
| --- | --- | --- |
| New vector character | $1.50 to $2.50 (Kitta README) | Once per character |
| Extra faces or a 30° body | To be measured on one character; show the estimate before starting, as vector creation does | Once per character |
| New action | A few text calls plus check renders; read it off the usage panel on the first 5 actions | Once per action, shared by all characters |
| Lip sync, animation, export | $0 | Every episode |
| Voice for a 10-minute episode | About $0.70 on ElevenLabs ($0.08 per 1,000 characters, about 8,500 characters); $0 on VoiceStudio | Every episode |
| Same 10 minutes on Masko, for comparison | About $150 ($0.25 per second of talking, [Masko pricing](https://masko.ai/docs/credits)) | Every episode |

The 8,500 characters assume about 150 spoken words a minute.

## Build steps

Start with the library and the + New action tile. Each step below fits one prompt in `version 2 planning/codex-prompts/`.

1. **Action library.** Load clips from `shared/vector-avator/motions/` and `data/motions/`; string ids; `once`, `loop` and `hold` play modes; the palette lists the library. Today's nine actions keep their names.
2. **+ New action tile** at the end of the Actions row: a text box, play mode and length, the cost shown before it starts, running in the background like vector creation.
3. **Keyframe writer and check loop.** The model writes the clip; Kitta validates the bones, renders check frames and sends them back for fixes.
4. **More faces.** Draw angry, sad, sleepy and excited when a vector character is created, and map all 11 expressions one to one.
5. **Walking.** A walk-cycle clip plus the Move block, which moves the character across its background from the placement set in [background-plan.md](background-plan.md).
6. **Two-person Animate.** Lanes per actor, the Look at block and listener nods, built on `shared/scene.ts`.
7. **Camera lane.** Shot blocks (wide, medium, close-up, reverse), then the optional 30° body drawing at character creation.

## Open-source search (not needed)

Nothing from the GitHub search is needed for this plan. The text-to-motion models (HY-Motion, Kimodo) and video capture (GVHMR) it turned up need an NVIDIA GPU and their own setup, so they are left out. The one free thing worth remembering is the [CMU motion capture library](https://paperswithcode.com/dataset/cmu-motion-capture): real walking and sitting clips, free for all uses, as a fallback if a model-written walk looks stiff.

## Risks and open questions

- **Model-written motion can look stiff.** Test on 5 actions before building more; key poses held for a beat suit the cartoon style anyway.
- **Walking is the hardest move to write as keyframes.** If it looks wrong, a free CMU walk clip and a small importer are the fallback, with no GPU needed.
- **Cartoon proportions.** Short arms and big heads can clip into the body; the check renders should catch it.
- **Licences.** The README flags the wave clip's terms as unchecked; confirm where it came from.
- **Painted characters.** They can't share clips. Decide whether new episodes use vector characters only.

* [ ] Which 10 actions come first?
* [ ] Do you want the 30° body drawn for every character, or only the main cast?

## Sources

- [Kitta repository](https://github.com/RafflesiaKhan/kitta-animation), read 24 Nov 2026
- [CMU Motion Capture Database](https://mocap.cs.cmu.edu/resources.php)
- [Masko credits and pricing](https://masko.ai/docs/credits)
