# Step 4: Scripts and voices

Read `version 2 planning/codex-prompts/shared-rules.md` and follow it, including the subagent stages. Then read `version 2 planning/codex-reports/step-3.md`.

## Goal

An episode has a saved script, told either by a narrator or in character dialogue, with the right voice on every cue.

## Build

- Save an episode's script and title.
- Choose **narration** or **dialogue**. In narration, a narrator carries the story and characters act silently, with no mouth cues. In dialogue, each speaking character gets a voice and mouth cues.
- Assign voices: a character's default voice, with an override per episode. VoiceStudio generates the speech, through the existing `speakLine`.
- Store each line's speaker. Generate audio with `concatWithGaps` and `runRhubarb`, and split cues by speaker through `resolveScene` in `shared/scene.ts`.
- Reuse the Voiceover step's per-line controls and paste-script parsing from `src/steps/VoiceoverStep.tsx` and `shared/direction.ts`, instead of copying them. `[expression: …]` and `[action: …]` tags should keep working.
- Keep narration audio separate from the characters, so no one's mouth moves.

## Watch for

- Regenerating one line shouldn't silently leave cues or marks from old audio behind. Decide what happens to hand-placed marks when audio changes, and record the decision.
- VoiceStudio being down must give a clear error and save nothing half-finished.
- VoiceStudio's default voice invents a new person per line unless a speaker is set. Two characters must keep their own distinct, steady voices across a whole episode.

## Not in this step

The scene editor, the Director, and other voice providers in Settings.

## Acceptance

1. Play a short narrated beat in the scene preview. No character's mouth moves, and the characters still blink and sway.
2. Play a two-speaker exchange. The intended voice is attached to each cue, and only the active speaker's mouth moves.
3. Override a character's voice in one episode, and confirm its other episodes don't change.
4. Reopen the project, and everything plays the same without generating voices again.
5. Stop VoiceStudio and generate. The error is clear, and the saved episode is unchanged.
