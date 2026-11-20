import { createCanvas, loadImage, type SKRSContext2D } from '@napi-rs/canvas';
import { composePose } from '../shared/vector-avator/core/compose';
import { EXPRESSIONS, EYE_STATES, MOUTH_SHAPES, type FaceState } from '../shared/vector-avator/core/face';
import { faceFor, poseFor } from '../shared/vector-avator/kitta';
import { VectorRenderer } from '../shared/vector-avator/renderers/vector/vectorRenderer';
import { prepareVector, type Affine, type LoadedVector, type VectorDoc } from '../shared/vector-avator/renderers/vector/vdata';
import type { FrameState } from '../shared/types';
import { useServerCanvas } from './vector';

// The check picture for one drawing round (version 2 planning/vector-create-plan.md): one contact sheet of the
// character drawn by the real renderer, so the drawing model sees what Kitta will show. Rows: the body (neutral,
// overlaid on the front picture when given, head turned ±30°, the explain and point gestures), the eyes and
// expressions, and the mouths.

const TILE = 256;
const LABEL = 22;
const GAP = 8;
const BG = '#EEF1F6';

interface Tile { label: string; framing: 'body' | 'face'; frame?: Partial<FrameState>; face?: Partial<FaceState>; overlay?: boolean }

const NEUTRAL: FrameState = { expression: 'neutral', mouth: 'X', gesture: 'none', gestureProgress: 0, blink: false, bob: 0 };

function rows(withFront: boolean): Tile[][] {
  return [
    [
      { label: 'neutral', framing: 'body' },
      ...(withFront ? [{ label: 'on front picture', framing: 'body', overlay: true } as Tile] : []),
      { label: 'head turn -30°', framing: 'body', face: { yaw: -30 } },
      { label: 'head turn +30°', framing: 'body', face: { yaw: 30 } },
      { label: 'gesture explain', framing: 'body', frame: { gesture: 'explain', gestureProgress: 0.5 } },
      { label: 'gesture point', framing: 'body', frame: { gesture: 'point', gestureProgress: 0.5 } },
    ],
    [
      ...EYE_STATES.map((eye): Tile => ({ label: `eyes ${eye}`, framing: 'face', face: { eye } })),
      ...EXPRESSIONS.map((expression): Tile => ({ label: expression, framing: 'face', face: { expression } })),
    ],
    MOUTH_SHAPES.map((mouth): Tile => ({ label: `mouth ${mouth}`, framing: 'face', face: { mouth } })),
  ];
}

function drawTile(r: VectorRenderer, t: Tile): void {
  const frame = { ...NEUTRAL, ...t.frame };
  const face = { ...faceFor(frame), ...t.face };
  r.restart(); // each tile starts with the springs at rest
  r.setPose(composePose(poseFor(frame, 0), face));
  r.setFace(face);
  r.render(0);
}

/** The drawing at half opacity over the front picture, with the skeleton points, in the renderer's own framing. */
async function drawOverlay(g: SKRSContext2D, r: VectorRenderer, lv: LoadedVector, front: Buffer, x: number, y: number) {
  const view = (r as unknown as { view: Affine }).view; // private in the vendored renderer; read only
  const img = await loadImage(front);
  g.save();
  g.translate(x, y);
  g.transform(...view);
  g.drawImage(img, 0, 0, lv.doc.width, lv.doc.height);
  g.restore();
  g.save();
  g.globalAlpha = 0.5;
  g.drawImage(r.canvas as never, x, y);
  g.restore();
  g.save();
  g.translate(x, y);
  g.fillStyle = '#E8305A';
  for (const [k, p] of Object.entries(lv.doc.skeleton)) {
    if (k === 'head_radius') continue;
    g.beginPath();
    g.arc(view[0] * p[0] + view[4], view[3] * p[1] + view[5], 3, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

/** The contact sheet as a PNG. `front` is the front standing picture the parts were drawn from (same size as the doc). */
export async function checkSheet(doc: VectorDoc, front?: Buffer): Promise<Buffer> {
  useServerCanvas();
  const lv = prepareVector(doc);
  const renderers = { body: new VectorRenderer(), face: new VectorRenderer() };
  for (const [framing, r] of Object.entries(renderers) as ['body' | 'face', VectorRenderer][]) {
    r.dpr = 1;
    r.setup(TILE, TILE, framing, false, lv);
  }
  const grid = rows(!!front);
  const cols = Math.max(...grid.map((row) => row.length));
  const sheet = createCanvas(cols * (TILE + GAP) + GAP, grid.length * (TILE + LABEL + GAP) + GAP);
  const g = sheet.getContext('2d');
  g.fillStyle = '#FFFFFF';
  g.fillRect(0, 0, sheet.width, sheet.height);
  g.font = '14px sans-serif';
  for (const [ri, row] of grid.entries()) {
    for (const [ci, t] of row.entries()) {
      const x = GAP + ci * (TILE + GAP), y = GAP + ri * (TILE + LABEL + GAP);
      const r = renderers[t.framing];
      drawTile(r, t);
      g.fillStyle = BG;
      g.fillRect(x, y, TILE, TILE);
      if (t.overlay && front) await drawOverlay(g, r, lv, front, x, y);
      else g.drawImage(r.canvas as never, x, y);
      g.fillStyle = '#17233A';
      g.fillText(t.label, x + 4, y + TILE + 16);
    }
  }
  return sheet.toBuffer('image/png');
}
