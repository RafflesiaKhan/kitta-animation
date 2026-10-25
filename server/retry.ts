/** Waits before each retry; tests shorten these. About 26 s of waiting in total before giving up. */
export const RETRY = { delaysMs: [3000, 8000, 15000] };

/** Runs job, retrying while shouldRetry(error) holds, with a little jitter so parallel users don't retry in lockstep. */
export async function withRetries<T>(job: () => Promise<T>, shouldRetry: (e: unknown) => boolean, label: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await job();
    } catch (e) {
      const wait = RETRY.delaysMs[attempt];
      if (wait === undefined || !shouldRetry(e)) throw e;
      console.warn(`${label}: ${(e as { code?: string })?.code ?? 'error'}, retrying in ${Math.round(wait / 1000)} s (${attempt + 1}/${RETRY.delaysMs.length})`);
      await new Promise((r) => setTimeout(r, wait * (0.9 + Math.random() * 0.2)));
    }
  }
}
