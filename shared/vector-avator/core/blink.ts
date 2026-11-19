// Automatic blinking: open -> half -> closed -> half -> open at random intervals.
// Deterministic for a given seed so captures are reproducible.
import type { EyeState } from "./face";

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface BlinkOptions { seed?: number; minInterval?: number; maxInterval?: number; frame?: number }

export class Blinker {
  private starts: number[] = [];
  private rnd: () => number;
  constructor(private opt: BlinkOptions = {}) {
    this.rnd = mulberry32(opt.seed ?? 7);
  }
  private ensure(t: number) {
    const min = this.opt.minInterval ?? 2.2, max = this.opt.maxInterval ?? 5.0;
    let last = this.starts.length ? this.starts[this.starts.length - 1] : 0.8;
    if (!this.starts.length) this.starts.push(last);
    while (last < t + 10) {
      // occasionally a quick double blink
      last += this.rnd() < 0.15 ? 0.35 : min + (max - min) * this.rnd();
      this.starts.push(last);
    }
  }
  /** Eye state at time t (seconds). One phase lasts `frame` seconds (default 1/24). */
  eyeAt(t: number): EyeState {
    this.ensure(t);
    const f = this.opt.frame ?? 1 / 24;
    for (const s of this.starts) {
      if (s > t) break;
      const k = Math.floor((t - s) / f);
      if (k <= 3) return (["half", "closed", "closed", "half"] as EyeState[])[k];
    }
    return "open";
  }
}
