import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { concatWithGaps } from './audio';
import { ensureVoiceStudio } from './launch';
import { renderVideo } from './render';
import { runRhubarb } from './rhubarb';
import { speakLine } from './speech';
import script from '../shared/scene-sample.json';
import type { SceneSample } from '../shared/SceneView';
import type { Line, ScriptLineInput, Timeline } from '../shared/types';

export async function createSceneSample(exportDir: string) {
  await ensureVoiceStudio();
  const wavs: Buffer[] = [];
  for (const line of script.lines) {
    wavs.push(await speakLine('voicestudio', line as ScriptLineInput));
  }
  const audio = await concatWithGaps(wavs, 650);
  const file = randomUUID() + '.mp4';
  const output = join(exportDir, file);
  try {
    const cues = await runRhubarb(audio.path, script.lines.map(line => line.text).join(' '));
    const lines: Line[] = script.lines.map((line, i) => ({
      text: line.text,
      expression: line.expression as Line['expression'],
      gesture: line.gesture as Line['gesture'],
      ...audio.spans[i],
    }));
    const timeline = (actor: string): Timeline => {
      const ownLines = lines.filter((_, i) => script.lines[i].actor === actor);
      return {
        durationMs: audio.durationMs,
        lines: ownLines,
        cues: ownLines.flatMap(line => cues
          .filter(cue => cue.endMs > line.startMs && cue.startMs < line.endMs)
          .map(cue => ({
            ...cue,
            startMs: Math.max(cue.startMs, line.startMs),
            endMs: Math.min(cue.endMs, line.endMs),
          }))).sort((a, b) => a.startMs - b.startMs),
      };
    };
    const scene: SceneSample = {
      durationMs: audio.durationMs,
      speakerStartMs: lines[1].startMs,
      reactionStartMs: lines[1].endMs,
      mina: timeline('mina'),
      rafi: timeline('rafi'),
    };
    await mkdir(exportDir, { recursive: true });
    const started = performance.now();
    await renderVideo({ scene, audioPath: audio.path, outPath: output, format: { aspect: '16:9', transparent: false } });
    return {
      scene,
      renderMs: Math.round(performance.now() - started),
      audioUrl: '/api/audio/' + basename(audio.path, '.wav'),
      videoUrl: '/api/exports/' + file,
    };
  } catch (error) {
    await Promise.all([rm(audio.path, { force: true }), rm(output, { force: true })]);
    throw error;
  }
}
