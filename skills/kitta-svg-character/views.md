# Other views

Draw the requested view from the accepted front view (given as JSON and as a picture):

- **three-quarter-left**: turned about 40° toward screen-left. Face features shift toward screen-left; the
  screen-left eye is narrower; nose points left; the screen-right ear shows, the other is hidden; the torso is a bit
  narrower; the screen-left arm and leg are behind the body (list them before `torso`).
- **profile-left**: facing screen-left. One eye shows: use `eye-right`/`brow-right`/`pupil-right` for it and give
  `eye-left`, `brow-left`, `pupil-left` empty shapes. The nose and mouth are on the left edge of the head; the mouth
  variants are narrower (about half width). The screen-left arm and leg are the far ones (listed before `torso`,
  slightly darker), the screen-right ones are near (after).
- **back**: the back of the head (hair), no face (face parts present with empty shapes, `mouthPart: null`), the back
  of the costume.

Keep the same part ids, joints in the same places along the limbs, the same colours, outline colour and line weight,
the same waistY and groundY.
