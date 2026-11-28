# Rig contract (one view)

Canvas 1000 × 1000, y down. `left`/`right` in ids mean the **screen** side as seen in the front view (they keep
that meaning in every view). Positive rotation is clockwise on screen. The `parts` array order is the **draw order**
(later parts are drawn on top).

Each part: `{ id, parent, x, y, shapes, variants? }`. `x, y` is the part's joint (pivot) in its parent's coordinates;
the root's are canvas coordinates. Shapes are drawn in the part's own coordinates, so draw them around the joint
(e.g. an arm hangs downward from (0,0)). Shape: `{kind:'path', d}` | `{kind:'ellipse', x, y, rx, ry}` |
`{kind:'rect', x, y, width, height, rx?}` plus `fill`, optional `stroke`, `strokeWidth`. Paths: absolute or relative
M L H V C S Q T A Z with numbers separated by spaces.

Required parts (in every view, even when empty — use `shapes: []` for a part you cannot see):

| id | parent | joint |
| --- | --- | --- |
| body | null | hips/waist centre, about (500, 600) |
| head | body | base of the neck |
| eye-left, eye-right | head | eye centre |
| brow-left, brow-right | head | brow centre |
| mouth | head | mouth centre |
| arm-left, arm-right | body | shoulder; upper arm hangs down (+y) |
| forearm-left, forearm-right | arm-* | elbow, at the end of the upper arm |
| hand-left, hand-right | forearm-* | wrist, at the end of the forearm |
| leg-left, leg-right | body | hip joint; thigh hangs down |
| shin-left, shin-right | leg-* | knee |
| foot-left, foot-right | shin-* | ankle |

Draw-order trick: give `body` no shapes and add a child `torso` (joint 0,0) holding the torso drawing, so legs listed
before `torso` are drawn behind it. Put arms after `head` so a hand can touch the face.

Optional parts Kitta uses when present: `pupil-left/right` (children of the eyes, at the pupil; they move for glances),
`cheek-left/right` (head; `shapes: []`, variant `blush`), `tear-left/right` (head, under the eye; `shapes: []`, variant `on`).

Variants (replacement shape lists, same coordinates):

- `mouth` (every view except back): `A` closed lips (M/B/P), `B` slightly open with teeth, `C` open, `D` wide open
  (with teeth and tongue), `E` rounded open, `F` small puckered, `G` teeth on lower lip (F/V), `H` open with tongue
  up (L), `X` relaxed closed; silent shapes `smile`, `grin` (open smile with teeth), `frown`, `o` (small round),
  `smirk` (one-sided). The base `shapes` = `X`.
- `hand-*` (optional, recommended): `open` (flat palm, fingers), `fist`, `point` (index finger along +y),
  `thumbs-up` (thumb toward −y). Base shapes = relaxed hand.
- `eye-*` (optional): `closed` (a curved lid line; Kitta hides the pupil).

The view also has `mouthPart: "mouth"` (`null` for the back view), `waistY` (the hip line: waist-up framing crops
here) and `groundY` (where the soles touch, ≤ 990).

Draw the **resting face**: relaxed level brows, open eyes, closed relaxed mouth (`X`), even when the reference shows
an emotion (angry brows, a shout). Kitta adds every expression on top of the rest pose by moving the brows, lids and
mouth, so an emotion baked into the drawing would show in all 36 expressions. Record the reference's mood in the design.

Lengths matter: the hand must reach the face when the arm folds; arms usually end near mid-thigh. Keep joints where
the parts really bend (shoulder at the top of the sleeve, elbow at the sleeve end) so rotations look natural.
