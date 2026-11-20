// polygon-clipping ships a default export at runtime but only named exports in its types.
import * as ns from "polygon-clipping";
const pc = ((ns as unknown as { default?: typeof ns }).default ?? ns) as typeof ns;
export default pc;
export type { MultiPolygon, Polygon, Ring, Pair } from "polygon-clipping";
