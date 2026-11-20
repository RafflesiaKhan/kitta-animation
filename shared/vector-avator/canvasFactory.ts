// Kitta addition: vector-avator creates offscreen canvases itself. The browser uses the DOM;
// the export (server) installs @napi-rs/canvas with setCanvasFactory().
export type AnyCanvas = HTMLCanvasElement;

let factory: ((w: number, h: number) => AnyCanvas) | null = null;

export function setCanvasFactory(f: ((w: number, h: number) => AnyCanvas) | null): void {
  factory = f;
}

export function hasCanvas(): boolean {
  return factory !== null || typeof document !== 'undefined';
}

export function makeCanvas(w = 1, h = 1): AnyCanvas {
  if (factory) return factory(w, h);
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return cv;
}
