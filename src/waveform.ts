/** Loudness of the audio at url as `columns` peaks in 0..1, decoded in the browser. Rejects where Web Audio is unavailable. */
export async function peaks(url: string, columns: number): Promise<number[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`audio ${res.status}`);
  const ctx = new AudioContext();
  try {
    const data = (await ctx.decodeAudioData(await res.arrayBuffer())).getChannelData(0);
    const per = Math.max(1, Math.floor(data.length / columns));
    const out: number[] = [];
    for (let c = 0; c < columns; c++) {
      let max = 0;
      for (let i = c * per, end = Math.min(data.length, i + per); i < end; i++) max = Math.max(max, Math.abs(data[i]));
      out.push(max);
    }
    const top = Math.max(...out, 1e-6);
    return out.map((v) => v / top);
  } finally {
    void ctx.close();
  }
}
