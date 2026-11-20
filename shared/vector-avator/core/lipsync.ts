// Text -> timed mouth shapes (visemes) for lip-sync previews without audio.
import type { MouthShape } from "./face";

const VOWEL_ROWS: Record<MouthShape, string> = {
  a: "あかさたなはまやらわがざだばぱぁゃアカサタナハマヤラワガザダバパァャ",
  i: "いきしちにひみりぎじぢびぴぃイキシチニヒミリギジヂビピィ",
  u: "うくすつぬふむゆるぐずづぶぷぅゅゔウクスツヌフムユルグズヅブプゥュヴ",
  e: "えけせてねへめれげぜでべぺぇエケセテネヘメレゲゼデベペェ",
  o: "おこそとのほもよろをごぞどぼぽぉょオコソトノホモヨロヲゴゾドボポォョ",
  sil: "んっンッ、。！？ 　",
};
const ROMAN: Record<string, MouthShape> = { a: "a", i: "i", u: "u", e: "e", o: "o", "-": "sil", n: "sil", " ": "sil" };

export interface VisemeKey { t: number; mouth: MouthShape }

export function textToVisemes(text: string, moraSec = 0.15, start = 0): VisemeKey[] {
  const out: VisemeKey[] = [];
  let t = start;
  for (const ch of text) {
    let m: MouthShape | null = null;
    if (ch === "ー" && out.length) m = out[out.length - 1].mouth;
    for (const [shape, chars] of Object.entries(VOWEL_ROWS)) if (chars.includes(ch)) m = shape as MouthShape;
    if (m === null && ch.toLowerCase() in ROMAN) m = ROMAN[ch.toLowerCase()];
    if (m === null) continue;
    // small kana (ゃゅょぁ...) modify the previous mora instead of adding one
    if ("ゃゅょぁぃぅぇぉャュョァィゥェォ".includes(ch) && out.length) { out[out.length - 1].mouth = m; continue; }
    out.push({ t, mouth: m });
    t += ch === "、" || ch === "。" ? moraSec * 2 : moraSec;
  }
  out.push({ t, mouth: "sil" });
  return out;
}

export function mouthAt(keys: VisemeKey[], t: number, loop?: number): MouthShape {
  if (!keys.length) return "sil";
  const tt = loop ? t % loop : t;
  let m: MouthShape = "sil";
  for (const k of keys) { if (k.t <= tt) m = k.mouth; else break; }
  return m;
}
