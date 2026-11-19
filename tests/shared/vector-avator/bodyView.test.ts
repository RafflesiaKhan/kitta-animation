// Unit tests for turned body views of method V (id056, src/renderers/vector/bodyView.ts):
// side swapping, mirroring, composition of the view with the front head, and the arm turn.
import { describe, expect, it } from "vitest";
import { composeView, mirrorView, swapSide, mapPathD, type BodyViewDoc } from "../../../shared/vector-avator/renderers/vector/bodyView";
import { VRig, len3 } from "../../../shared/vector-avator/renderers/vector/vrig";
import { type VectorDoc, type VPart } from "../../../shared/vector-avator/renderers/vector/vdata";
import { quatFromEulerDeg } from "../../../shared/vector-avator/core/math";

const part = (id: string, bone: string, layer: string, d: string, extra: Partial<VPart> = {}): VPart => ({
  id, label: id, parent: null, pivot: [0, 0], visible: true, coverage: "", bone, layer,
  shapes: [{ name: id, d, fill: "#ffffff" }], ...extra,
});

const front = {
  format: "so-chara-vector/1", character: "t", width: 1024, height: 1536, expressions: {},
  parts: [
    part("tail", "tail", "body", "M600 1200 L640 1200 L640 1240 Z"),
    part("ear_L", "head", "ear", "M560 400 L600 400 L600 500 Z"),
    part("leg_R", "rightUpperLeg", "body", "M470 1150 L500 1150 L500 1350 Z"),
    part("leg_L", "leftUpperLeg", "body", "M530 1150 L560 1150 L560 1350 Z"),
    part("torso", "chest", "body", "M440 900 L590 900 L590 1160 Z"),
    part("head", "head", "head", "M300 450 L720 450 L720 860 Z"),
    part("hand_L_open", "leftHand", "body", "M700 1100 L720 1100 L720 1140 Z", { group: "hand_L", variants: ["open"] }),
  ],
  skeleton: {
    hips: [512, 1150], chest: [512, 1000], neck: [512, 900], head: [512, 870], head_center: [512, 650], head_radius: [260, 230],
    shoulder_L: [610, 930], elbow_L: [670, 1030], wrist_L: [720, 1130],
    shoulder_R: [414, 930], elbow_R: [354, 1030], wrist_R: [304, 1130],
    hip_L: [560, 1150], hip_R: [464, 1150], ankle_L: [560, 1360], ankle_R: [464, 1360],
  },
  chains: [
    { id: "tail", bone: "hips", parts: ["tail"], root: [600, 1220], tip: [640, 1220], segments: 2, stiffness: 0.5, damping: 0.3, gravity: 0.1 },
  ],
  arms: {
    L: { width: { shoulder: 50, elbow: 40, wrist: 32 }, bands: [{ from: 0, to: 1, color: "#ffffff" }], shade: { color: "#eeeeee", side: "under" }, attach: "torso" },
    R: { width: { shoulder: 50, elbow: 40, wrist: 32 }, bands: [{ from: 0, to: 1, color: "#ffffff" }], shade: { color: "#eeeeee", side: "under" }, attach: "torso" },
  },
} as unknown as VectorDoc;

const view: BodyViewDoc = {
  format: "so-chara-vector-view/1", yaw: -30,
  skeleton: {
    hips: [490, 1150], chest: [490, 1000], neck: [485, 900], head: [480, 872],
    shoulder_L: [560, 930], shoulder_R: [420, 930], hip_L: [520, 1150], hip_R: [460, 1150], ankle_L: [520, 1360], ankle_R: [460, 1360],
  },
  parts: [
    part("tail", "tail", "body", "M560 1200 L600 1200 L600 1240 Z"),
    part("leg_R", "rightUpperLeg", "body", "M450 1150 L480 1150 L480 1350 Z"),
    part("torso", "chest", "body", "M430 900 L560 900 L560 1160 Z"),
    part("leg_L", "leftUpperLeg", "body", "M505 1150 L535 1150 L535 1350 Z", { seamlessWith: ["leg_R"] }),
  ],
  chains: [{ id: "tail", bone: "hips", parts: ["tail"], root: [570, 1220], tip: [600, 1220], segments: 2, stiffness: 0.5, damping: 0.3, gravity: 0.1 }],
  arms: { L: { attach: "head" } },
};

describe("swapSide", () => {
  it("swaps _L/_R and left/right prefixes", () => {
    expect(swapSide("leg_L")).toBe("leg_R");
    expect(swapSide("eye_R_white")).toBe("eye_L_white");
    expect(swapSide("leftUpperLeg")).toBe("rightUpperLeg");
    expect(swapSide("rightHand")).toBe("leftHand");
    expect(swapSide("torso")).toBe("torso");
    expect(swapSide("hair_Large")).toBe("hair_Large");
  });
});

describe("mapPathD", () => {
  it("maps every point of an absolute path", () => {
    expect(mapPathD("M1 2 L3 4 C5 6 7 8 9 10 Z", ([x, y]) => [x + 1, y * 2])).toBe("M2 4 L4 8 C6 12 8 16 10 20 Z");
  });
});

describe("mirrorView", () => {
  const m = mirrorView(view);
  it("flips the angle and mirrors about the hips", () => {
    expect(m.yaw).toBe(30);
    expect(m.skeleton.hips).toEqual([490, 1150]);
    // the near shoulder (_L at x 560) becomes the character's right on the other side
    expect(m.skeleton.shoulder_R).toEqual([420, 930]);
    expect(m.skeleton.shoulder_L).toEqual([560, 930]);
  });
  it("swaps the sides of parts, bones, links, chains and arm overrides", () => {
    const ids = m.parts.map((p) => p.id);
    expect(ids).toEqual(["tail", "leg_L", "torso", "leg_R"]);
    const legR = m.parts.find((p) => p.id === "leg_R")!;
    expect(legR.bone).toBe("rightUpperLeg");
    expect(legR.seamlessWith).toEqual(["leg_L"]);
    expect(m.chains![0].root).toEqual([410, 1220]);
    expect(m.arms?.R?.attach).toBe("head");
    expect(m.arms?.L).toBeUndefined();
  });
});

describe("composeView", () => {
  const c = composeView(front, view);
  it("keeps head parts and hands from the front, moved onto the view's neck", () => {
    const head = c.parts.find((p) => p.id === "head")!;
    // the view is first moved onto the front's hips axis (+22: hips 490 -> 512), so its head
    // [502, 872] - front head [512, 870] = (-10, +2)
    expect(head.shapes[0].d.startsWith("M290 452")).toBe(true);
    expect(c.skeleton.head_center).toEqual([502, 652]);
    expect(c.skeleton.hips).toEqual([512, 1150]);
    expect(c.parts.find((p) => p.id === "hand_L_open")!.shapes[0].d).toBe(front.parts[6].shapes[0].d);
  });
  it("puts the view's body parts into the front body slots in the view's order", () => {
    expect(c.parts.map((p) => p.id)).toEqual(["tail", "ear_L", "leg_R", "torso", "leg_L", "head", "hand_L_open"]);
  });
  it("keeps the arm lengths of the front and merges arm overrides", () => {
    const len = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    for (const s of ["L", "R"]) {
      expect(len(c.skeleton[`shoulder_${s}`], c.skeleton[`elbow_${s}`])).toBeCloseTo(len(front.skeleton[`shoulder_${s}`], front.skeleton[`elbow_${s}`]), 6);
      expect(len(c.skeleton[`elbow_${s}`], c.skeleton[`wrist_${s}`])).toBeCloseTo(len(front.skeleton[`elbow_${s}`], front.skeleton[`wrist_${s}`]), 6);
    }
    expect(c.skeleton.shoulder_L).toEqual([582, 930]);
    expect(c.arms.L.attach).toBe("head");
    expect(c.arms.R.attach).toBe("torso");
    expect(c.arms.L.width.shoulder).toBe(50);
  });
  it("uses the view's body chains", () => {
    expect(c.chains!.find((x) => x.id === "tail")!.root).toEqual([592, 1220]);
  });
});

describe("VRig.rotateArms", () => {
  it("turns the arms about the shoulders without changing their lengths", () => {
    const rig = new VRig(front);
    rig.solve({ bones: { leftUpperArm: quatFromEulerDeg(0, 0, -70) }, hips: [0, 0, 0] });
    const S = [...rig.world.leftUpperArm.pos], E = [...rig.world.leftLowerArm.pos], W = [...rig.world.leftHand.pos];
    rig.rotateArms(Math.PI / 6);
    expect(rig.world.leftUpperArm.pos).toEqual(S);
    const d = (a: number[], b: number[]) => len3([a[0] - b[0], a[1] - b[1], a[2] - b[2]]);
    expect(d(rig.world.leftLowerArm.pos, S)).toBeCloseTo(d(E, S), 6);
    expect(d(rig.world.leftHand.pos, rig.world.leftLowerArm.pos)).toBeCloseTo(d(W, E), 6);
    // turning the character to its left (+yaw) brings its left arm's elbow away from the viewer
    expect(rig.world.leftLowerArm.pos[2]).toBeLessThan(E[2]);
  });
});
