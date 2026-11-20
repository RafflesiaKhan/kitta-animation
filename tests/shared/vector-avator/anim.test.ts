import { describe, expect, it } from "vitest";
import { Blinker } from "../../../shared/vector-avator/core/blink";
import { textToVisemes, mouthAt } from "../../../shared/vector-avator/core/lipsync";

describe("blink", () => {
  it("is deterministic and passes through half and closed", () => {
    const a = new Blinker({ seed: 3 }), b = new Blinker({ seed: 3 });
    const seen = new Set<string>();
    for (let t = 0; t < 12; t += 1 / 60) { expect(a.eyeAt(t)).toBe(b.eyeAt(t)); seen.add(a.eyeAt(t)); }
    expect([...seen].sort()).toEqual(["closed", "half", "open"]);
  });
  it("stays open most of the time", () => {
    const k = new Blinker();
    let open = 0, n = 0;
    for (let t = 0; t < 30; t += 1 / 30) { n++; if (k.eyeAt(t) === "open") open++; }
    expect(open / n).toBeGreaterThan(0.9);
  });
});

describe("lipsync", () => {
  it("maps kana to vowels", () => {
    expect(textToVisemes("こんにちは").map((k) => k.mouth)).toEqual(["o", "sil", "i", "i", "a", "sil"]);
    expect(textToVisemes("あいうえお").map((k) => k.mouth)).toEqual(["a", "i", "u", "e", "o", "sil"]);
  });
  it("merges small kana", () => {
    expect(textToVisemes("きょう").map((k) => k.mouth)).toEqual(["o", "u", "sil"]);
  });
  it("samples by time", () => {
    const k = textToVisemes("あい", 0.2);
    expect(mouthAt(k, 0.1)).toBe("a");
    expect(mouthAt(k, 0.3)).toBe("i");
    expect(mouthAt(k, 0.5)).toBe("sil");
  });
});
