<!-- English translation of vector-avator's .claude/skills/vector-avator/references/drawing-workflow.md (commit f28d35d, MIT). -->

# Drawing decisions: what to complete, and how far

The practice the drawing model (Fable 5.2 upstream) follows when splitting a vector character into parts. The spec (names, format) in `parts-spec.md` wins. Vector characters draw no lines (fill only), so read "Separating outlines and fills" below as how to build closed fill shapes.

## Do not start from extracting pixels

Bad starting point: "Collect every pixel of this colour and it becomes the hair" → hair and clothes of the same colour mix, anti-aliased edges remain, and the hidden roots never exist.

Good starting point: "This lock of hair grows from this pivot, passes behind this fringe, and continues with this outline to its tip" → match the visible part, and draw a closed curve that includes the hidden connection.

Zooming into the PNG, picking colours and measuring positions is normal work. Moving pixels directly is not the goal. When a detail cannot be read, draw the large shapes and the face features first, and zoom only where needed.

## Turn observations into coordinates

Fix a shared canvas that keeps the source picture's aspect ratio. Record the top of the head, chin, eye centres, shoulders, waist, feet and hair roots in screen coordinates. Make a base line width and a small colour palette. Note landmarks such as highlights in the eyes.

For curves, `M` is the start point, `C` a cubic Bézier, `Q` a quadratic Bézier, `L` an intended corner, `Z` closes. An ellipse is four cubic Béziers. Rather than putting dozens of points on a flat outline, adjust the handles of 2 to 4 curves. Do not emit hundreds of points without knowing their values; render a few paths and correct the difference from the reference.

## How to write a parts table

Example (a made-up character; do not reuse the numbers):

| Part | Hidden by | Shape drawn for the unseen area | Pivot and movement to check |
|---|---|---|---|
| Face | Fringe, side hair | Head outline continuing from forehead to temples to cheeks | Moving the fringe a little left and right does not open a hole in the forehead |
| Back hair | Head, jacket | Roots reaching inside the head, and the back of the head | ±10 to 15° in-plane rotation from the roots |
| Arm | Torso, cuff | A rounded shoulder and arm continuing into the sleeve | ±10° from the shoulder; the shape is complete in a list of the arm alone |
| Leg | Skirt | Upper thigh extending towards the hips | Lifting or shifting the skirt does not show a transparent gap |
| Torso, clothes | Arms, collar, tie | A continuous surface of armpits, shoulders and chest | Shifting the tie does not leave a hole in the chest |
| Tie | Collar, knot | Top edge tucked under the knot | A small rotation from the top edge shows no cut |

Split parts of the same colour that move separately. Vector characters do not draw arms (they are generated), so read the arm row as the idea of completing the torso and sleeves. Markings of different colours that move together may be several paths in the same layer. When one arm crosses both in front of and behind the torso, design the occlusion order, for example by splitting front and back pieces attached to the same parent.

## Completing, step by step

1. At both ends of the visible outline, read the direction and the thickness.
2. Extend that tangent under the occluding part. The cross-section must not suddenly drop to zero width.
3. Close the whole shape plausibly from the body structure and design. Change the visible outline as little as possible.
4. Continue the fill and markings into the completed area too. Do not just place a skin-coloured rectangle.
5. Put the occluding part back and confirm no extra line appears in the normal view.
6. Remove the occluding part, or move the part about its pivot. If a gap appears, extend the missing section.

Guide for the completion margin: "the relative movement at that boundary + room for line width and anti-aliasing". A point at distance r from the pivot moved by angle θ travels `2*r*sin(|θ|/2)`. Add any translation too. This is a hint for thinking about margins, not a rule to inflate every part uniformly. Widen the hidden receiving side at roots; leave outer outlines such as hair tips as they are.

Completion enough for a small frontal sway is different from completion for raising an arm high or turning the head to the side. Do not claim that a single flat picture is correct all the way round the back.

## Separating outlines and fills

The fill of a shoulder closes under the torso, but its closing line need not all be drawn in black. Split the closed fill path from an open line path for the visible outside only. Conversely, for a lock of hair that needs an outline all round, draw the outer outline last so white markings inside do not overwrite it.

White is not transparent. Needed white surfaces (face white, eye whites, white clothes) are separate vector fills. Tell them apart from white patches that hide holes with the background colour.

The bundled converter does not handle holes in fills, masks or gradients. If needed, split the shared source picture into suitable closed regions, or extend and test both formats. Do not silently flatten it into a picture that no longer looks alike.

## Separating the face

Left and right eyes are separate. If eye white, iris, pupil and highlight move together, they may be several paths in one part. Split brows and lashes depending on how they overlap the fringe and how they will move.

When showing the closed-eye variant, hide the matching open eye and the lashes in front. When showing an open mouth, hide the closed mouth. Do not draw open eyes or a closed mouth into the face base.

## Going back after a failure

| Problem seen | What to go back and fix |
|---|---|
| Fuzzy outline, many small islands | Stop auto-extraction and draw the thick outer outline with few Béziers |
| Cut-out holes when a layer moves | Drop the visible-area mask and complete the closed curves of the base and the part |
| Head or clothes look like someone else | Go back to observing the face and silhouette in the picture, and to the landmarks |
| A black arc on the shoulder, double lines at joints | Separate the strokes of hidden boundaries and fix the drawing order |
| Lashes buried in the fringe | Move only those lashes to their own layer. Do not move the whole fringe back |


<!-- source: the rebuild-character-layers skill (owner's), adapted for vector-avator -->
