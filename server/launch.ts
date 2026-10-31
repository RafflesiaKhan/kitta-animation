import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { voiceStudioUrl } from './openai';

// VoiceStudio is a separate desktop app (it runs the voice models on this machine's GPU). When it is installed here but
// not running, Kitta opens it in the background instead of asking the user to.

const appPath = () => process.env.VOICESTUDIO_APP || '/Applications/VoiceStudio.app';
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

/** Kitta can open VoiceStudio itself: macOS, VOICESTUDIO_URL on this machine, and the app installed. */
export function canLaunchVoiceStudio(): boolean {
  return process.platform === 'darwin' && LOCAL.test(voiceStudioUrl()) && existsSync(appPath());
}

async function answers(): Promise<boolean> {
  try {
    return (await fetch(`${voiceStudioUrl()}/health`, { signal: AbortSignal.timeout(2_000) })).ok;
  } catch {
    return false;
  }
}

let launching: Promise<boolean> | null = null;

/**
 * True once VoiceStudio answers: right away if it is running, else after opening the app in the background and waiting
 * (its models take a while to load). False when it can't be opened here or doesn't answer in time. Requests that
 * arrive meanwhile share the one launch.
 */
export function ensureVoiceStudio({ waitMs = 120_000, pollMs = 1_000 } = {}): Promise<boolean> {
  launching ??= (async () => {
    if (await answers()) return true;
    if (!canLaunchVoiceStudio()) return false;
    console.log(`[voicestudio] not running, opening ${appPath()}`);
    const child = spawn('open', ['-g', '-a', appPath()], { stdio: 'ignore', detached: true });
    child.on('error', (e) => console.warn('[voicestudio] could not open it:', e.message));
    child.unref();
    for (const end = Date.now() + waitMs; Date.now() < end;) {
      await new Promise((r) => setTimeout(r, pollMs));
      if (await answers()) return true;
    }
    console.warn(`[voicestudio] opened, but it didn't answer within ${Math.round(waitMs / 1000)} s`);
    return false;
  })().finally(() => { launching = null; });
  return launching;
}
