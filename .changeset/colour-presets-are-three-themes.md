---
"@mj-biz-apps/forms-ng": patch
---

The Design tab's colour presets are three complete themes, one per row, instead of ten unrelated swatches.

The picker offered ten arbitrary brights, which quietly asked the author to be a colour designer. A form is themed by exactly two decisions — `--mjf-page-bg` and `--mjf-page-ink` — from which the card, every border, muted text, the progress track and the selected-answer tint are all `color-mix`ed in `mj-form.component.css`, plus an accent. Ten colours with no roles did not match how any of that works.

The palette is now three rows of exactly those three roles: **page background · font colour · accent**, taken from the light-warm, warm and dark ends of the seeded `FormStyle` set (Editorial, Warm, Midnight). The picker's grid goes from five columns to three so a row reads as one theme; at five, the triples wrapped and the themes dissolved back into loose colours.

Picking straight down a row yields a form that already coheres. Picking across rows still works, and is how someone builds their own.
