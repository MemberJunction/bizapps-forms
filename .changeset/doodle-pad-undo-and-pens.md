---
"@mj-biz-apps/forms-entities": minor
"@mj-biz-apps/forms-ng": minor
---

Undo, stroke width and pen colour on the doodle pad (#98).

**Undo is the one with design consequence.** The pad had no stroke model: `onPointerMove` drew straight onto the canvas bitmap and the only state kept was a `hasInk` boolean, so there was nothing to undo *from*. Strokes are now retained as data — points, colour, width — and the bitmap is a render of them rather than the drawing itself. The live pointer path still draws incrementally (repainting the model on every pointer sample would make a long drawing progressively laggier on a phone); only undo and cap-eviction repaint.

Three properties that were easy to get wrong, and are now guarded:

- **Undo stops at a restored image.** The pad is controlled and repaints from the stored PNG whenever it binds to a subject. A PNG is flat pixels with no history, so a restored drawing cannot be un-drawn stroke by stroke — undo reaches back through this session's strokes only. Erasing the restored image instead would mean Undo silently destroying earlier work the respondent cannot see it about to destroy; Clear is the control that removes everything, and it says so.
- **Every undo re-exports and re-uploads.** The response carries the *file*; leaving it showing the stroke just removed would put the artifact and the screen quietly out of step, with no way for the respondent to notice. Undoing back to a genuinely empty pad drops the answer exactly as Clear does, so no orphan file is left behind. An undo also supersedes in-flight exports and repaints through the existing `PadCaptures` generation stamp, for the same reasons a new stroke and Clear do.
- **`MAX_RETAINED_STROKES` caps memory, not the drawing.** A stroke aging out of undo range is baked into the pad's base image on its way out, so it stays on screen and in every export; reaching the cap costs undo *range* and nothing else. `addStroke` hands the caller what fell out precisely so that cannot be forgotten.

**Pens.** Six named colours and three named widths — named rather than a free picker and a slider, because three values are three things to test and three large tap targets, where a slider is a continuum nobody hits precisely on a touchscreen. `Medium` is 2.5, the width the pad already hardcoded, so a question with no pen settings draws exactly as it did.

Every coloured pen is `color-mix(in srgb, <hue> 65%, var(--mjf-doodle-ink))`. A fixed hue cannot be guaranteed legible when the *author* picks the page colour, and `emitPng` composites onto that same colour, so an invisible pen is an invisible stored artifact. Mixing toward the page ink pulls each hue toward the one colour the theming layer already guarantees reads on this page — the construction `--mjf-status-error` already uses. `doodle-pen-contrast.spec.ts` reads the hues out of the stylesheet, reproduces the mix and the ink repair, and holds every pen to the 3:1 WCAG asks of a non-text graphic across five real page colours; the known floor (a mid-luminance page) is documented where the pens are defined.

**Author settings** live in the open `Settings` blob as `penColor`, `penWidth` and `penControls`, edited through a new `choice` setting kind that renders the contract's own option list — so the panel cannot offer a value the widget would silently fall back on. `doodlePen` validates each key independently on the way in, because `Settings` is reachable by paste and by API: an unknown colour or a nonsense width becomes the default rather than a broken pad, and one bad key does not discard the author's other choices. With no settings present the pad behaves exactly as before — theme ink, medium stroke, no controls shown. Undo and Clear are always available.

Nothing downstream changes: the answer is still a PNG through the same upload path, still stored as `FileID`.
