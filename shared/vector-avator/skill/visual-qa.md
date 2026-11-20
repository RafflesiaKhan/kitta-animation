<!-- English translation of vector-avator's .claude/skills/vector-avator/references/visual-qa.md (commit f28d35d, MIT). -->

# Judging completion by eye

## 1. Put the source picture and the neutral drawing side by side

Show them at the same size and look at these in order:

1. The whole-body silhouette, head-to-body ratio, hair length, positions of hands and feet.
2. In the face: eye spacing, eye height, chin, mouth, brows, highlights. "Does it look like the same person?"
3. The main colour areas and line widths. A jagged outline, scattered small islands or white fringes suggest leftovers of extraction.
4. Overlaps. The fringe covering the eyes unnaturally, sleeves hiding hands, inner markings erasing the outer outline, and so on.

Check both at small icon size and at 100 to 200%. Even with smooth outlines, it is not finished if it looks like someone else. If the style had to be simplified, explain how far.

## 2. Look only at the completed shapes

Open the full parts list and `reveal`. Check that a part named "face" really is a face up to the forehead and temples. Fix shoulders, thighs and hair roots that end in a straight line. Fix the curvature where a hidden section is a jagged patch.

Do not just fill every hole with an unnaturally large flat area. Check that each part has an outline and width that make sense on their own.

## 3. Move it through the expected range

Using the parts' pivots, try the largest expected angle and movement in both directions. Look especially at roots, shoulders, neck, waist, cuffs and leg roots. Tell apart places where the background should show and transparent holes where the body is missing.

Check the forehead revealed by moving the fringe, the chest revealed by moving the tie, the thigh revealed by shifting the skirt. Do not hide problems with clipping or other parts; complete the drawing.

This is an in-plane test of the drawing, not a collision solver. Do not claim "it never breaks at any angle".

## 4. Expression variants

With the eyes closed, no eye white or lashes remain. With the mouth open, the closed smile line does not overlap. Check one-eye swaps too if needed.

## 5. How it looks in the viewer

The check pictures (`check_parts.py`) do not include the automatic outlines or the generated arms. Look in the viewer last.

- No lines that are not in the reference appear between parts of a white character or of similar colours (if they do, use `seamlessWith` or `outline: false`).
- At ±30° head turn, eyes and cheeks do not leave the face outline. Ear and hair roots stay on the head. No doubled line at the hair edge.
- Arm thickness, colour bands and shadow match the picture. When the arm comes in front of the chest, it is drawn in front of the torso.
- The 4 hand shapes join at the wrist without shifting.
- Swinging parts (ears, hair, tail) swing without leaving the head or body at their roots.

## What to record in the work notes

Briefly record `QA name / picture checked / problem found / fixed or open / result of the recheck`. Do not set `visual_review_required:true` in the automatic report to false without actually looking.

The bar for done is not "the generator command succeeded", but having made the comparisons above, fixed the breaks that can be fixed, and seen nothing break when it moves in the viewer. Do not hide what was not checked or not solved.


<!-- source: the rebuild-character-layers skill (owner's), adapted for vector-avator -->
