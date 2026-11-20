<!-- English translation of vector-avator's .claude/skills/vector-avator/references/parts-spec.md (commit f28d35d, MIT). Paths and commands refer to the upstream repository; in Kitta, shared/vector-avator/check.ts and server/vector-check.ts replace the checks in §6. -->

# Parts spec for vector characters

This is the spec of the character data that the vector renderer (`src/renderers/vector/`) reads.
A new character that draws its parts by this spec and writes its skeleton landmarks in `vector.json` moves on the shared skeleton template.
For the overall workflow, see `../SKILL.md`.

## 1. Files

Each character lives in `public/characters/<character id>/vector/`.

| Path | Contents | Made by |
|---|---|---|
| `ref/front.png` | The front standing picture in the common style (1024×1536). The main reference for drawing the parts | Codex imagegen (SKILL.md step 2) |
| `ref/sheet_turnaround.png`, `ref/sheet_face.png` | The two character sheets | Codex imagegen (SKILL.md step 4) |
| `ref/angle_<degrees>.png`, `ref/turntable.mp4` | MiniMax H3 360° turntable video and frames (angle references, optional) | `turntable.sh` (SKILL.md step 3) |
| `vector.json` | **The character.** Paths of every part, skeleton landmarks, arm definition, swinging parts, variants, expressions | Fable 5.2 |
| `build/` | Exports for checking: `character_layers.svg` (Inkscape layers), `layers/` and `variants/` (one SVG per part) | `check_parts.py` |
| `preview.png` | The default state as one picture | `check_parts.py` |

`vector.json` is a superset of `art.json` (schema_version 1, `art-json.md`).
The paths of the parts are stored in the JSON itself, so the renderer needs only this one file. `tools/vector/layers/vector_layers.py` (validate, build) works on it as is.

## 2. Coordinates and common drawing rules

- The canvas is **1024 wide × 1536 high**, the same as `ref/front.png`. +X is right, +Y is down. Every part uses the same coordinates (no local coordinates per part).
- Draw the front standing pose (A-pose) at the same position and size as `ref/front.png`, so they overlap.
- **Fill only.** `stroke` is `null` and `width` is 0. Outlines are generated when drawing. Thin shapes such as brows, closed eyes and mouth lines are drawn as thin closed filled shapes.
- One shape is one closed contour (no holes). When a hole or several contours are needed, split into several shapes. No gradients, transparency, masks, clips, `<image>` or filters. Path commands are `M/L/C/Q/Z` (absolute coordinates).
- Markings inside a part (the inside of an ear, steps between tufts, skirt pleats, the shadow of a tie) may be separate shapes in the same part, filled with a slightly darker colour of the same hue. So may one broad, weak shadow (as in the common style).
- **Outlines are drawn per part** (to turn lines off, see `seamlessWith` and `outline` in §3.1). Of the part's outer shape (the union of all its shapes), only the edges that overlap an earlier-drawn part of a similar colour get a line, on the inside of the part. Edges between shapes of the same part get no line. So in an all-white character, a tuft that should have a line is a separate part, and a mass that should not have one is shapes of the same part.
- A line depends only on the pair "front part" and "earlier part of a similar colour"; parts in between are ignored. For example, the edge of the fringe also gets a line against the back hair behind the face (it works as the line between face and hair).
- A back part of the same colour (such as back hair) is drawn inside the front part, so it does not stick out of it when the head turns (§3.5). Guide: about 7% of the head radius (about 14 px for a character with a lot of hair).
- **Face parts (`layer: "feature"`) get no automatic outline.** Lines the face needs (the rim of the eye white, the closed-eye line, the mouth line) are drawn as shapes. (For a character with white eye whites on a white face, the grey ring of the eye white is a shape at the back of the eye-white part.)
- A line that starts and fades in the middle of a mass (a notch between tufts, the curl of a tail) may be a thin closed tapering shape in the line colour, as a shape of that part. Its colour is a grey slightly darker than the part (for example about `#D9D3D0` against white `#FBF7F4`).
- Draw each part **from scratch** as a meaningful unit. Do not take shapes from cutting out pixels of the source picture, auto-tracing, or fitting colour regions or visible outlines. Image processing is only for picking colours, measuring sizes and positions, and overlaying to compare.
- Each part must make sense when shown alone. **Complete the hidden areas too** (§5).
- `_L` and `_R` are the **character's own left and right** (the same as VRM bone names). In the front view, the character's left (`_L`) is on the right of the screen.

## 3. Fields of `vector.json`

```jsonc
{
  "schema_version": 1,            // as in art.json
  "format": "so-chara-vector/1",
  "character": "usagi",
  "width": 1024, "height": 1536,
  "parts": [ /* §3.1. The array order is the drawing order (0 is at the back) */ ],
  "skeleton": { /* §3.2 */ },
  "arms": { /* §3.3 */ },
  "chains": [ /* §3.4 */ ],
  "parallax": { /* §3.5 */ },
  "headTurn": { /* §3.5.1 (optional) */ },
  "expressions": { /* §3.6 */ },
  "qa": [ /* as in art.json. Must include reveal and move */ ]
}
```

### 3.1 Parts (`parts[]`)

On top of the art.json fields (`id`, `label`, `parent`, `pivot`, `visible`, `coverage`, `shapes`):

| Field | Required | Contents |
|---|---|---|
| `id` | yes | Lower snake case; only the sides are upper case, `_L` and `_R`. Use the names in §4 |
| `bone` | yes | The bone that moves it. A bone of the shared skeleton (`hips`, `spine`, `chest`, `neck`, `head`, `leftUpperLeg` and so on; `src/core/skeleton.ts`) or the id of a swinging chain |
| `layer` | yes | The head-turn deformation layer (§3.5). Body parts are `body` |
| `group` | variants only | The variant group (`eye_L`, `brow_R`, `mouth`, `hand_L`, `sleeve_R` and so on) |
| `variants` | variants only | The names of the variants in which the part is shown. For example the eye white is `["open","half"]` and the half-closed lid is `["half"]` |
| `clipTo` | optional | Draw this part clipped to the shape of the given part (iris and pupil clipped to the eye white, for example). It clips to the union of all shapes of that part, so if the eye-white part has a rim-ring shape, the iris shows up to the outer edge of the ring |
| `color` | optional | The base colour for the automatic outline (`#RRGGBB`). Defaults to the first shape's `fill`. Do not write a colour that is not in the fills just to remove lines (use the next two fields) |
| `seamlessWith` | optional | Parts with which no line is drawn (part ids; the generated arms are `arm_L` and `arm_R`). Writing it on either part has the same effect. Example: a character whose ears and head, or torso and legs, join without a line |
| `outline` | optional | `false`: this part draws no lines (for a part that covers a seam, for example) |
| `pivot` | yes | The centre of rotation. Arms and legs at their root, ears and hair tufts at their base, hands at the wrist |
| `visible` | yes | Whether it is shown in the default state (expression normal, eyes open, mouth closed, hands open) |
| `coverage` | yes | What hidden area was completed, specifically ("up to the forehead under the fringe" and so on). For a part that is never hidden, write "no completion needed" |

### 3.2 Skeleton landmarks (`skeleton`)

The joint positions in the front A-pose (canvas coordinates). The character's bone lengths are taken from these.

| Key | Contents |
|---|---|
| `hips` | Centre of the pelvis (at the height of the leg roots) |
| `chest` | Centre of the chest (a little below shoulder height) |
| `neck` | Root of the neck (middle of the top of the torso) |
| `head` | Pivot of head rotation (under the chin, top of the neck) |
| `head_center`, `head_radius` | Centre of the head itself (without ears and hair volume) and its horizontal and vertical radius `[rx, ry]`. It is the size of the sphere the face parts sit on, so for a character with a lot of hair, base it on the width of the face skin; it may be smaller than the hair dome |
| `shoulder_L/R`, `elbow_L/R`, `wrist_L/R` | Centres of shoulder, elbow and wrist. They give the arm bone lengths (upper arm = shoulder to elbow, forearm = elbow to wrist) |
| `hip_L/R`, `ankle_L/R` | Leg roots and ankles |

### 3.3 Arm definition (`arms`)

Arms have no drawing; they are generated when drawing. Write the following for each side.

```jsonc
"arms": {
  "L": {
    "width": { "shoulder": 52, "elbow": 42, "wrist": 34 },   // arm thickness seen from the front (px)
    "bands": [                                              // colour bands along the arm; t is shoulder 0 → wrist 1
      { "from": 0.0, "to": 0.55, "color": "#FFFFFF" },
      { "from": 0.55, "to": 1.0, "color": "#22305E" }
    ],
    "shade": { "color": "#E2E4EA", "side": "under", "ratio": 0.32 }, // shadow band: colour, side (under = underside of the arm / body side), thickness ratio
    "attach": "torso",                                      // normally draw the arm just before (behind) this part
    "seamlessHand": false                                   // true: no line at the wrist (between hand and arm)
  },
  "R": { ... }
}
```

- `shade.ratio` 0 means no shadow. With two or more colour bands, the shadow colour is chosen per band, slightly darker than the band (`shade.color` is used only with one band).
- Band boundaries switch at the exact position (they need not match sample points). The "similar colour" test for automatic outlines is also done per band (a line is drawn between a navy arm cover and a navy skirt).
- Bands are built separately for the upper arm and the forearm. A band that crosses the elbow is filled up to the rounded end at the elbow, so no gap appears when the elbow bends deeply. When the upper arm and forearm fall into different layers, each draws only the bands of its own section. When the arm points at the camera, a band boundary becomes an elliptical arc bulging to the far side (how a ring around the arm looks). When there are two or more bands covering shoulder 0 to wrist 1 without gaps, no base is filled under them (its edge would show as a thin bright line). With gaps, the base is filled with the first band's colour.
- Only the bone lengths are measured from the landmarks. Viewer poses (attention and so on) come from the shared pose data; the arm angle of the A-pose in the reference picture is not used.
- `attach`: normally draw the arm just before this part. For a character whose arms pass in front of the torso but behind the chest fur, give a part in front of the torso, such as `"chest_fur"`. When the arm comes far in front of the torso (judged by depth), it is drawn in front of every part.

### 3.4 Swinging chains (`chains[]`)

```jsonc
{ "id": "ear_L", "bone": "head", "parts": ["ear_L", "ear_L_inner"],
  "root": [600, 330], "tip": [700, 40], "segments": 4,
  "stiffness": 0.6, "damping": 0.35, "gravity": 0.15 }
```

- The polyline `root`→`tip` is split into `segments` segments, and the points of the part's paths are assigned to the segments with weights, so the part bends.
- `gain` (optional, default 1) scales how strongly each chain reacts to movement.
- Swinging parts on the body (tie, ribbon and so on) have `bone` `chest`, with the root just below the knot. The part's `bone` is the chain id (for example `tie` for the tie).
- `stiffness`, `damping` and `gravity` are guide values from 0 to 1 (the renderer converts them to physical amounts). Guide: ears and twin tails are charming when they swing softly, so `stiffness` 0.5 to 0.75 and `damping` 0.3 to 0.4 (they overshoot and come back).
- Head chains swing with the head's movement and tilt, and also with the speed of a head turn (sideways lag) and with nods, breathing and hops (stretching of the length). A tail (a chain on `hips`) also sways gently while idle (`vWag`).

### 3.5 Head-turn deformation (`parallax`, `headTurn`)

Turning the head left and right (up to ±30°) and up and down is shown by deforming the single front drawing, like Live2D (`src/renderers/vector/head.ts`).
The part's `layer` decides the kind of deformation.

| Layer | Deformation | Parts |
|---|---|---|
| `feature` | **Rigid.** The left and right ends of the part (variant group) ride on the face sphere; in between it only narrows sideways and its contents are not distorted. The eye on the side turned to gets narrower and the other eye a little wider. Iris and pupil (with `clipTo`) roll further inside the eye white towards the turn. The mouth (group `mouth`) rides on the nose column and stays under the nose | Eyes, brows, nose, mouth, cheeks |
| `head` | **Point-by-point deformation on the face sphere.** The same formula as `feature`, so the eyes never overtake the face outline. Nothing moves at the rim of the face sphere (`head_radius` × `headTurn.radius`) | The head itself (face skin) |
| `hair_front`, `hair_side` | **Shell (point-by-point deformation).** The middle moves most and it falls to 0 at the rim of the whole head (`headTurn.reach`), with slope 0 at the rim. The side turned to shrinks just before the rim and the other side widens. The nearer the top of the head, the smaller the movement (the top of the sphere does not move) | Fringe, hair ornaments, side hair, tufts on top of the head |
| `hair_back` (negative value) | The whole layer shifts the opposite way | Back hair |
| `ear`, parts of head chains | **Rigid at the root.** At the root (the chain's `root`, otherwise the `pivot`) it follows the head, and the left and right roots move a little towards the head centre. The side turned to gets narrower, the other wider. The second and later shapes (inner ear and so on) shift a little towards the turn (clipped to the part's first shape) | Ears, rabbit-ear twin tails |
| `body` | — | Body parts (not deformed by head turns) |

Every head part also gets a small shift towards the turn (`headTurn.shift`).

`parallax` gives the amount of movement per layer. The unit is "movement of the middle of the layer ÷ head radius", at a 90° turn (half of it at 30°). Positive is towards the turn.

| Layer | Default | Guide |
|---|---:|---|
| `hair_back` | -0.10 | Keep it below the margin by which it is drawn inside the front hair (§2). Beyond that, back hair sticks out thinly near the edge of the fringe and the outline looks doubled |
| `ear` | -0.04 | Ears sit towards the back of the head, so slightly the opposite way |
| `head` | 0.45 | About 0.45 for a character whose face skin is the head outline itself (Kariusagi). For a character whose face is a "window" in hair or fur, bring it close to `feature` |
| `feature` | 0.75 | |
| `hair_side` | 0.65 | A little less than `feature` (the cheek looks wider on the side away from the turn) |
| `hair_front` | 0.85 | A little more than `feature` (the fringe is in front of the face) |

#### 3.5.1 Tuning values (`headTurn`, all optional)

| Key | Default | Meaning |
|---|---:|---|
| `radius` | 1 | Radius of the face sphere (multiple of `head_radius`). Above 1 for a character whose face is drawn small relative to the head (a ball of fur) |
| `reach` | auto | Rim of the whole head `[half width, up from centre, down from centre]` (px, from `head_center`). By default, the bounding box of the fixed head parts (excluding `feature`, `ear` and swinging parts) |
| `shift` | 0.08 | Movement of the whole head (ratio of the head radius, at 90°) |
| `rimFalloff` | 1 | Exponent that weakens the face deformation towards the rim (`cos^n`, 1 or more) |
| `domeFloor` | 0.35 | Share of movement left at the top of the head (0: the top does not move) |
| `irisRoll` | 0.2 | Roll of the iris (ratio of the eye-white width, at 90°). Smaller for eyes with a large iris |
| `pupilDepth` | 1.35 | The pupil is taken to be in front of the iris (the bulge of the cornea): how many times as far as the iris it moves. Keeps it from looking like a flat iris disc turning |
| `irisSqueeze` | 1 | Sideways (or vertical) squeeze of iris and pupil when they roll (1 = cos of the roll angle) |
| `noseDepth` | 1.1 | How far the nose sticks out (a multiplier for the nose alone) |
| `earSqueeze` | 0.3 | How much the ear on the side turned to narrows (at 90°) |
| `earIn` | 1 | How far the ear roots move towards the head centre (1: like a point on the side of a cylinder) |
| `earInner` | 0.08 | Shift of the ear's second and later shapes (ratio of the ear width, at 90°) |
| `pitchGain` | 1 | Multiplier for up-and-down movement |

Try values in the viewer URL before writing them into `vector.json`: `vPar=feature:0.8,head:0.6`, `vTurn=radius:1.3,irisRoll:0.14`. The head-turn limit is `vMaxYaw` (default 30).

What to check: at ±30°, (1) eyes and cheeks do not leave the face outline or the side hair, (2) no doubled outline at the hair edge, (3) the roots of ears and twin tails stay on the head, (4) nothing shifts in the half-closed and closed eye or mouth variants either.


### 3.6 Expressions (`expressions`)

For each expression, give the variant used in each variant group. The mouth is the shape when not speaking.

```jsonc
"expressions": {
  "normal":   { "eye": "open",  "brow": "normal",   "mouth": "closed" },
  "smile":    { "eye": "smile", "brow": "smile",    "mouth": "smile" },
  "surprise": { "eye": "open",  "brow": "surprise", "mouth": "surprise" },
  "trouble":  { "eye": "open",  "brow": "trouble",  "mouth": "trouble" }
}
```

`eye` applies to both `eye_L` and `eye_R`, and `brow` to both `brow_L` and `brow_R`.

## 4. Parts and names

### 4.1 Body

| id | bone | Required | Completion |
|---|---|---|---|
| `tail` | `hips` (the chain id when it swings) | optional | Its root continues behind the torso or skirt |
| `leg_L`, `leg_R` | `leftUpperLeg`, `rightUpperLeg` | yes | Their roots continue under the torso or skirt |
| `torso` | `chest` | yes | **The torso without arms** (arms are generated, so it is complete under the armpits and arm roots). Up to the root of the neck |
| `skirt` | `hips` | optional | |
| `chest_fur`, `collar`, `tie` and so on | `chest` | optional | Clothes and chest fur |
| `neck` | `neck` | yes | Up to its top edge hidden by the head. For a character whose neck never shows, a connector hidden under the head is enough |

### 4.2 Head (all with `parent` `head` and `bone` `head`)

| id | layer | Required | Completion and notes |
|---|---|---|---|
| `hair_back` | `hair_back` | characters with hair | The dome behind the head |
| `ear_L`, `ear_R` (rabbit-ear twin tails: `twintail_L/R`) | `ear` | optional | **Draw the root into the head** (so no cut shows when the head turns or the ear swings) |
| `head` | `head` | yes | Face skin. Up to the forehead and temples under the fringe, side hair and ear roots |
| `cheek_L/R` | `feature` | optional | Blush |
| `eye_L_white`, `eye_L_iris`, `eye_L_pupil` | `feature` | yes | Draw iris and pupil round, beyond the eye white, and clip them with `clipTo: "eye_L_white"`. Variant `open` |
| `eye_L_lash` | `feature` | characters with lashes | Upper lashes and upper lid line. Variant `open` |
| `eye_L_half` | `feature` | yes | Half-closed: the upper lid (skin colour) and the lowered lashes, over the eye white and iris. **Do not flatten the iris.** Variant `half` |
| `eye_L_closed` | `feature` | yes | The arc of the closed eye (a thin fill). Variant `closed` |
| `eye_L_smile` | `feature` | optional | Smiling eye (∩ shape). Variant `smile` |
| `eye_L_surprise`, `eye_L_trouble` | `feature` | optional | Surprised eye (a small iris, for example) and troubled eye (lid shape). Write the variant name in the `eye` of `expressions` |
| `brow_L_normal`, `_smile`, `_surprise`, `_trouble` | `feature` | characters with brows | Variant `normal` and so on |
| `nose` | `feature` | yes | |
| `mouth_closed`, `_a`, `_i`, `_u`, `_e`, `_o`, `_smile`, `_surprise`, `_trouble` | `feature` | yes | Group `mouth`. The inside of the mouth, teeth and tongue are other shapes of the same part |
| `hair_side_L`, `hair_side_R` | `hair_side` | characters with hair | |
| `hair_front` | `hair_front` | characters with hair | Overlapping tufts may be other shapes of the same part |
| `clip_L/R`, `ribbon` and so on | `hair_front` | optional | |

The right eye and right brow use the same names with `_R`.

For a character whose lashes or brows are drawn in front of the hair, they may come after the hair in the array (drawing order). Then only the half-closed lid (skin colour) is split off behind the hair (for example `eye_L_lid_half`).

### 4.3 Hands and sleeves (variants at the end of the arm)

| id | Required | How to draw |
|---|---|---|
| `hand_L_open`, `_point`, `_fist`, `_palm` (the same for the right) | yes | `pivot` at the centre of the wrist, drawn **straight down (+Y) from the wrist to the fingertips**. The forearm continues in this direction. `open`, `point` and `fist` show the back of the hand, `palm` the palm. The cut at the wrist is closed and round. It may be placed at the wrist position of the A-pose (`skeleton.wrist_L`). Group `hand_L`, variant `open` and so on |
| `hand_L_point_front` (the same for the right) | optional | A hand pointing at the camera (the index finger is foreshortened towards the viewer and the fingertip faces front). Used instead of `point` when the hand points close to the camera (without it, `point` is shortened along the hand). Variant `point_front` |
| `sleeve_L_straight`, `_bent`, `_folded` (the same for the right) | characters with sleeves | Overlay drawings of the elbow wrinkles and cuff. `pivot` at the centre of the elbow, upper arm straight up (-Y), forearm straight down for `straight`, bent about 60° towards the body for `bent`, about 120° for `folded`. Group `sleeve_L` |

### 4.4 Parts not in the tables

Parts not in the tables (a mass behind the fringe `hair_top`, a front tuft `hair_front_over` and so on) may be named freely in lower snake case. Their movement comes from `bone` and `layer`, not the name. The more a mass of head hair overlaps in front, the closer its layer is to `hair_front`.

### 4.5 Number of parts

45 to 70 parts per character, including variants.

## 5. Completion rules

Draw the hidden areas too. Check with the `qa` cases `reveal` (hide the front part) and `move` (move a part about its pivot) that no hole shows when parts move.

- Forehead, temples and cheeks under the fringe and side hair (`head`).
- The head under the roots of ears and hair (ears continue into the head).
- The torso without arms (armpits, arm roots).
- The neck under the head, and the top of the torso under the neck.
- The root of the tail, and the leg roots under a skirt.

## 6. Checks (`tools/vector/check_parts.py`)

```bash
.venv/bin/python tools/vector/check_parts.py <character id>
```

- Structural checks: names, required parts, no `stroke`, the fields of `bone`, `layer`, variants, expressions, chains and arms, pivot positions, and whether `_L` and `_R` are on the character's left and right in the front view (screen right and left).
- Runs `tools/vector/layers/vector_layers.py validate`.
- Writes `build/` and `preview.png`, and the check pictures (`var/vector/<character id>/check/`): default state, each `qa` case, the variant lists (eyes, brows, mouths, hands, sleeves, expressions), and the parts list.
- 0 errors passes. Judge each warning by its content.
- The check pictures do not include automatic outlines or generated arms. **The final check is in the viewer** (while the dev server runs):

```bash
DSF=2 node tools/capture/viewer_shots.mjs var/vector/<id>/check/viewer \
  neutral="char=<id>" face30="char=<id>&framing=face&yaw=30&blink=0" faceM30="char=<id>&framing=face&yaw=-30&blink=0" \
  explain="char=<id>&motion=explain&t=1.0" spread="char=<id>&motion=spread&t=1.2" \
  half="char=<id>&framing=face&eye=half&blink=0" point="char=<id>&motion=point&t=1.5"
```

When the dev server runs on a port other than 5280, add `VIEWER_URL=http://127.0.0.1:<port>/`.

- Measure coordinates on the reference picture by scanning pixels, not by eye (eyes, nose and ears are easily 15 to 25 px off).
