// Contract between the motion side (src/core) and the drawing methods A-D.
import type { Pose } from "./pose";
import type { FaceState } from "./face";

export type RendererId = "A" | "B" | "C" | "D" | "E" | "V" | "raw";

export interface CharacterConfig {
  id: string;
  label: string;
  /** 3D model (VRM or GLB) under public/. */
  model3d?: { url: string; format: "vrm" | "glb"; boneMap?: Record<string, string> };
  /** 2D part set produced by tools (paper doll / warp / 2D face). */
  parts2d?: { url: string };
  faces2d?: { url: string };
  /** Vector character for method V (docs/vector-parts.md). */
  vector?: { url: string };
}

/** Rendering style (Phase 3). Independent from the drawing method. */
export interface StyleSettings {
  name: string;
  lineWidth?: number;
  lineWobble?: number;
  shadeSteps?: number;
}

export interface RendererContext {
  container: HTMLElement;
  character: CharacterConfig;
  width: number;
  height: number;
  /** Camera framing: whole body (default) or a close-up of the face. */
  framing?: "body" | "face";
  /** Draw debug overlays (bone positions). */
  debug?: boolean;
}

export interface Renderer {
  readonly id: RendererId;
  readonly label: string;
  init(ctx: RendererContext): Promise<void>;
  setPose(pose: Pose): void;
  setFace(face: FaceState): void;
  setStyle?(style: StyleSettings): void;
  /** Draw one frame. `time` is the motion time in seconds (for line wobble etc.). */
  render(time: number): void;
  resize(width: number, height: number): void;
  readonly canvas: HTMLCanvasElement;
  dispose(): void;
}
