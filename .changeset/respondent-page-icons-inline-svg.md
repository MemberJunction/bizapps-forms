---
"@mj-biz-apps/forms-ng": patch
---

**The respondent widget draws its own icons, so a shared form link stops rendering every icon at 0 × 0.**
The widget used Font Awesome `<i class="fa-…">` glyphs, which paint nothing until a host page loads
the icon font. The builder preview runs inside Explorer, which loads it; the public `/f/:slug` page is
deliberately shell-free and loads no stylesheet at all — so Ranking's grip and chevrons, the Rating
stars, the FileUpload paperclip and Doodle's Undo/Clear all measured zero on a live link while the same
form looked right in preview. Rating was the worst of it: selection is expressed as a colour flip on the
glyph, so clicking a star gave a respondent no feedback whatsoever.

All 22 icon sites now render `<mjf-icon name="…">` — an inline SVG from a typed 15-glyph catalogue,
`1em` square, `fill: currentColor`, `aria-hidden` on the host. The icon travels inside the widget bundle
(+6.4 kB), so it renders identically in Explorer, on the host page, and in a `<script>` embed on someone
else's site, with no font, no stylesheet and no third-party origin. A name outside the catalogue is a
compile error under `strictTemplates`.

Also: Ranking's reorder arrows go from 36 px to 44 px, the WCAG 2.5.5 tap-target minimum — they are
the only reorder path for anyone who cannot drag. Because those arrows are the tallest thing in a
row, they also set the row's height, so the drag placeholder now takes its box from the same
declared tap target instead of its own `3rem` literal; that literal had been leaving a hole 10 px
shorter than the row it replaced, and 18 px after the arrows grew.

Ships no migration and no metadata, so patch.
