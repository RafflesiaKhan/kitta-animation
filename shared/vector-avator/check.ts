// Kitta addition: the structural checks of upstream tools/vector/check_parts.py (`check()`, commit f28d35d),
// ported to TypeScript so the server can check a drawn vector.json without Python. The spec is
// skill/parts-spec.md. Upstream's pixel and layer checks are replaced by check pictures (server/vector-check.ts).
// Additions: every path must parse with prepareVector (what the renderer needs), skeleton points on the picture.
import { bbox, flatten, parsePath, type Pt } from './renderers/vector/vdata';

export interface CheckResult { errors: string[]; warnings: string[] }

const BONES = new Set(['hips', 'spine', 'chest', 'neck', 'head', 'leftShoulder', 'rightShoulder', 'leftUpperArm', 'rightUpperArm',
  'leftLowerArm', 'rightLowerArm', 'leftHand', 'rightHand', 'leftUpperLeg', 'rightUpperLeg', 'leftLowerLeg',
  'rightLowerLeg', 'leftFoot', 'rightFoot']);
const LAYERS = ['body', 'ear', 'feature', 'hair_back', 'hair_front', 'hair_side', 'head'];
const SIDES = ['L', 'R'] as const;
const REQUIRED = ['torso', 'neck', 'head', 'leg_L', 'leg_R', 'nose',
  ...SIDES.flatMap((s) => ['white', 'iris', 'pupil', 'half', 'closed'].map((k) => `eye_${s}_${k}`)),
  ...['closed', 'a', 'i', 'u', 'e', 'o', 'smile', 'surprise', 'trouble'].map((k) => `mouth_${k}`),
  ...SIDES.flatMap((s) => ['open', 'point', 'fist', 'palm'].map((k) => `hand_${s}_${k}`))];
const SKELETON_KEYS = ['hips', 'chest', 'neck', 'head', 'head_center', 'head_radius',
  ...['shoulder', 'elbow', 'wrist', 'hip', 'ankle'].flatMap((j) => SIDES.map((s) => `${j}_${s}`))];
const EXPRESSIONS = ['normal', 'smile', 'surprise', 'trouble'];
const HEAD_TURN: Record<string, [number, number]> = {
  radius: [0.5, 2.5], rimFalloff: [1, 4], shift: [0, 0.4], domeFloor: [0, 1], irisRoll: [0, 0.5], pupilDepth: [1, 2], irisSqueeze: [0, 1],
  earSqueeze: [0, 0.6], earIn: [0, 1.5], earInner: [0, 0.3], noseDepth: [0.8, 1.5], pitchGain: [0, 2],
};
const COLOR = /^#[0-9A-Fa-f]{6}$/;
const ID = /^[a-z][a-z0-9]*(_([a-z0-9]+|L|R))*$/;

type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untrusted JSON
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isPt = (v: unknown): v is Pt => Array.isArray(v) && v.length === 2 && v.every(isNum);
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const sideOf = (id: string) => /_(L|R)(_|$)/.exec(id)?.[1] as 'L' | 'R' | undefined;
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Checks a vector.json against the parts spec. No errors means the renderer can draw it as the skill intends. */
export function checkVector(raw: unknown): CheckResult {
  const E: string[] = [], W: string[] = [];
  if (!isObj(raw)) return { errors: ['vector.json must be an object'], warnings: [] };
  const art = raw;
  const parts: Obj[] = Array.isArray(art.parts) ? art.parts.filter(isObj) : [];
  if (!Array.isArray(art.parts) || !parts.length) E.push('parts must be a non-empty list');
  const ids = parts.map((p) => p.id);
  const byId = new Map(parts.map((p) => [p.id, p]));
  if (art.format !== 'so-chara-vector/1') E.push('format must be "so-chara-vector/1"');
  if (art.schema_version !== 1) E.push('schema_version must be 1');
  const Wd = art.width, Ht = art.height;
  if (Wd !== 1024 || Ht !== 1536) W.push(`canvas is ${Wd}x${Ht} (spec: 1024x1536)`);
  for (const pid of ids) if (typeof pid !== 'string' || !ID.test(pid)) E.push(`bad part id: ${JSON.stringify(pid)} (lower snake case, sides as _L/_R)`);
  if (new Set(ids).size !== ids.length) E.push('duplicate part ids');
  for (const r of REQUIRED) if (!byId.has(r)) E.push(`missing required part: ${r}`);

  const chainIds = new Set((Array.isArray(art.chains) ? art.chains : []).map((c: Obj) => c?.id));
  const groups = new Map<string, { variants: Set<string>; shown: Set<string>[]; hidden: Set<string> }>();
  const boxes = new Map<string, [number, number, number, number]>();
  for (const p of parts) {
    const pid = p.id;
    const shapes: Obj[] = Array.isArray(p.shapes) ? p.shapes : [];
    if (!Array.isArray(p.shapes)) E.push(`${pid}: shapes must be a list`);
    for (const s of shapes) {
      if (s?.stroke || s?.width) E.push(`${pid}/${s?.name}: stroke is not allowed (fill only)`);
      if (s?.fill && !COLOR.test(String(s.fill))) E.push(`${pid}/${s?.name}: bad fill color`);
    }
    // prepareVector parses every path; a path it cannot read breaks the whole character
    try {
      const rings = shapes.flatMap((s) => {
        if (typeof s?.d !== 'string' || !s.d) throw new Error(`shape ${s?.name} has no path`);
        const r = flatten(parsePath(s.d), 6);
        if (r.flat(2).some((v) => !Number.isFinite(v))) throw new Error(`shape ${s.name}: path has a non-number`);
        return r;
      });
      if (rings.length) boxes.set(pid, bbox(rings));
    } catch (e) {
      E.push(`${pid}: cannot parse path (${e instanceof Error ? e.message : e})`);
    }
    if (!BONES.has(p.bone) && !chainIds.has(p.bone)) E.push(`${pid}: bone ${JSON.stringify(p.bone)} is neither a skeleton bone nor a chain id`);
    if (!LAYERS.includes(p.layer)) E.push(`${pid}: layer ${JSON.stringify(p.layer)} not in ${LAYERS.join(', ')}`);
    if (('group' in p) !== ('variants' in p)) E.push(`${pid}: group and variants go together`);
    if ('group' in p && 'variants' in p) {
      if (!Array.isArray(p.variants) || !p.variants.length) E.push(`${pid}: variants must be a non-empty list`);
      const vs: string[] = Array.isArray(p.variants) ? p.variants : [];
      let g = groups.get(p.group);
      if (!g) groups.set(p.group, (g = { variants: new Set(), shown: [], hidden: new Set() }));
      vs.forEach((v) => g.variants.add(v));
      if (p.visible) g.shown.push(new Set(vs));
      else vs.forEach((v) => g.hidden.add(v));
    }
    if (p.clipTo && !byId.has(p.clipTo)) E.push(`${pid}: clipTo ${JSON.stringify(p.clipTo)} does not exist`);
    if (p.color && !COLOR.test(String(p.color))) E.push(`${pid}: bad color`);
    if ('outline' in p && typeof p.outline !== 'boolean') E.push(`${pid}: outline must be true/false`);
    for (const o of Array.isArray(p.seamlessWith) ? p.seamlessWith : []) {
      if (!byId.has(o) && o !== 'arm_L' && o !== 'arm_R') E.push(`${pid}: seamlessWith ${JSON.stringify(o)} is neither a part nor arm_L/arm_R`);
    }
    if (p.color && shapes.length && !shapes.some((s) => String(s?.fill ?? '').toUpperCase() === String(p.color).toUpperCase())) {
      W.push(`${pid}: color ${p.color} is not one of its fills (use seamlessWith/outline instead of a fake colour)`);
    }
    const pv = p.pivot;
    if (!isPt(pv)) E.push(`${pid}: bad pivot`);
    else if (Wd && Ht && !(-Wd * 0.1 <= pv[0] && pv[0] <= Wd * 1.1 && -Ht * 0.1 <= pv[1] && pv[1] <= Ht * 1.1)) W.push(`${pid}: pivot ${JSON.stringify(pv)} is outside the canvas`);
  }
  for (const [name, g] of groups) {
    const def = g.shown.length ? [...g.shown[0]].filter((v) => g.shown.every((s) => s.has(v)) && !g.hidden.has(v)) : [];
    if (def.length !== 1) E.push(`group ${name}: the visible parts must make up exactly one variant (got ${JSON.stringify(def.sort())})`);
  }
  for (const s of SIDES) for (const k of ['eye', 'hand']) if (!groups.has(`${k}_${s}`)) E.push(`missing group ${k}_${s}`);
  if (!groups.has('mouth')) E.push('missing group mouth');

  const sk: Obj = isObj(art.skeleton) ? art.skeleton : {};
  const skErrors = E.length;
  for (const k of SKELETON_KEYS) if (!isPt(sk[k])) E.push(`skeleton.${k} must be [x, y]`);
  if (E.length === skErrors) {
    if (sk.shoulder_L[0] <= sk.shoulder_R[0]) E.push("skeleton: shoulder_L must be on the screen right (character's own left)");
    for (const j of ['shoulder', 'elbow', 'wrist']) {
      const L: Pt = sk[`${j}_L`], R: Pt = sk[`${j}_R`];
      if (Math.abs((L[0] - sk.hips[0]) + (R[0] - sk.hips[0])) > 0.25 * Math.abs(L[0] - R[0]) + 20) W.push(`skeleton: ${j} L/R are not roughly symmetric around hips`);
    }
    const up = SIDES.map((s) => dist(sk[`shoulder_${s}`], sk[`elbow_${s}`]));
    const fo = SIDES.map((s) => dist(sk[`elbow_${s}`], sk[`wrist_${s}`]));
    if (Math.min(...up) < 5 || Math.min(...fo) < 5) E.push('skeleton: arm bones are too short');
    for (const k of SKELETON_KEYS) {
      if (k === 'head_radius' || !isNum(Wd) || !isNum(Ht)) continue;
      const [x, y] = sk[k] as Pt;
      if (x < 0 || x > Wd || y < 0 || y > Ht) E.push(`skeleton.${k} ${JSON.stringify(sk[k])} is off the ${Wd}x${Ht} picture`);
    }
  }

  const arms: Obj = isObj(art.arms) ? art.arms : {};
  for (const s of SIDES) {
    const a = arms[s];
    if (!isObj(a)) { E.push(`arms.${s} missing`); continue; }
    const w: Obj = isObj(a.width) ? a.width : {};
    if (!['shoulder', 'elbow', 'wrist'].every((k) => isNum(w[k]) && w[k] > 0)) E.push(`arms.${s}.width needs shoulder/elbow/wrist > 0`);
    const bands: Obj[] = Array.isArray(a.bands) ? a.bands : [];
    if (!bands.length || bands[0]?.from !== 0 || bands[bands.length - 1]?.to !== 1) E.push(`arms.${s}.bands must cover t = 0..1`);
    for (const b of bands) if (!COLOR.test(String(b?.color))) E.push(`arms.${s}.bands: bad color`);
    const sh: Obj = isObj(a.shade) ? a.shade : {};
    if (!COLOR.test(String(sh.color)) || !['under', 'over', 'front', 'back'].includes(sh.side)) E.push(`arms.${s}.shade needs color and side (under|over)`);
  }

  for (const c of Array.isArray(art.chains) ? art.chains : []) {
    for (const k of ['id', 'bone', 'parts', 'root', 'tip', 'segments']) if (!(k in (c ?? {}))) E.push(`chain ${c?.id}: missing ${k}`);
    for (const pid of Array.isArray(c?.parts) ? c.parts : []) {
      if (!byId.has(pid)) E.push(`chain ${c.id}: unknown part ${pid}`);
      else if (byId.get(pid)!.bone !== c.id) W.push(`chain ${c.id}: part ${pid} has bone ${JSON.stringify(byId.get(pid)!.bone)} (expected the chain id)`);
    }
    for (const k of ['stiffness', 'damping', 'gravity']) if (!isNum(c?.[k]) || c[k] < 0 || c[k] > 1) E.push(`chain ${c?.id}: ${k} must be 0..1`);
  }

  const parallax: Obj = isObj(art.parallax) ? art.parallax : {};
  for (const l of new Set(parts.map((p) => p.layer))) if (l !== 'body' && !(l in parallax)) W.push(`parallax has no value for layer ${l}`);
  for (const [l, v] of Object.entries(parallax)) if (!isNum(v) || v < -1 || v > 1.5) E.push(`parallax.${l} must be a number in -1..1.5`);
  if ((parallax.feature ?? 0) < 0) E.push('parallax.feature must not be negative (features are on the front of the head)');

  let ht: Obj = art.headTurn ?? {};
  if (!isObj(ht)) { E.push('headTurn must be an object'); ht = {}; }
  for (const [k, v] of Object.entries(ht)) {
    if (k === 'reach') {
      if (!(Array.isArray(v) && v.length === 3 && v.every((x) => isNum(x) && x > 0))) E.push('headTurn.reach must be [half width, up, down] in px (> 0)');
      else if (isPt(sk.head_radius) && v[0] < sk.head_radius[0]) W.push('headTurn.reach[0] is smaller than head_radius[0] (the rim of the whole head should contain the face)');
    } else if (!(k in HEAD_TURN)) E.push(`headTurn.${k}: unknown key (known: reach, ${Object.keys(HEAD_TURN).join(', ')})`);
    else if (!isNum(v) || v < HEAD_TURN[k][0] || v > HEAD_TURN[k][1]) E.push(`headTurn.${k} must be a number in ${HEAD_TURN[k][0]}..${HEAD_TURN[k][1]}`);
  }

  const ex: Obj = isObj(art.expressions) ? art.expressions : {};
  for (const e of EXPRESSIONS) {
    if (!isObj(ex[e])) { E.push(`expressions.${e} missing`); continue; }
    for (const [key, v] of Object.entries(ex[e])) {
      const gs = [...groups.keys()].filter((g) => g === key || g.startsWith(key + '_'));
      if (!gs.length) E.push(`expressions.${e}.${key}: no group ${key}/${key}_L/${key}_R`);
      for (const g of gs) if (!groups.get(g)!.variants.has(v as string)) E.push(`expressions.${e}.${key}=${v}: group ${g} has no such variant`);
    }
  }

  // left/right sanity: the character's left is the screen right
  const cx = isPt(sk.hips) ? sk.hips[0] : isNum(Wd) ? Wd / 2 : 512;
  for (const p of parts) {
    const s = sideOf(String(p.id ?? ''));
    const bb = boxes.get(p.id);
    if (!s || !bb) continue;
    const mx = (bb[0] + bb[2]) / 2;
    if ((s === 'L' && mx < cx - 4) || (s === 'R' && mx > cx + 4)) {
      E.push(`${p.id}: is on the wrong side (_${s} = character's own ${s === 'L' ? 'left' : 'right'}, screen ${s === 'L' ? 'right' : 'left'}; center x=${mx.toFixed(0)}, body x=${cx.toFixed(0)})`);
    }
  }
  return { errors: E, warnings: W };
}
