# Kitta SVG character (reference → reusable pack)

Kitta turns one reference picture into a character that can act in many scenes. You draw **artwork only**: the parts
of each view, as plain shapes on a rig. Kitta's own code supplies every expression pose, blink, gesture and body
action from shared recipes, so a good drawing is all it needs.

Pipeline (one call per step, each answered by calling the tool exactly once):

1. **Design** — study the reference and describe the character (`describe_character`).
2. **Front** — draw the front view (`draw_view`). The server validates it and renders it; fix what it reports.
3. **Other views** — three-quarter-left, profile-left and back, drawn from the accepted front. Kitta mirrors the
   right-facing views (unless the design is asymmetric, then you draw them too).
4. Kitta binds the motion, checks the whole pack and publishes it.

Rules for every step:

- Same character in every view: proportions, palette, costume, accessories, line weight.
- Flat colour fills with one dark outline colour; no gradients, images, text, filters, CSS or scripts.
- Colours are `#rgb`/`#rrggbb` hex, `none` or `transparent` only.
- Keep it simple: 25–60 parts per view, each with a few smooth shapes; paths under ~60 commands.
- If the picture hides an area (legs, back, the far side), infer it consistently and say so in the design notes.
- Only human and upright-animal (two-legged) body families are supported. Report any other family honestly.
