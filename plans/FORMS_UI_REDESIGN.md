# MJ Forms UI redesign — Typeform-inspired, MJ-tokened

Branch: `feat/forms-ui-redesign` (cut from `feat/responses-ui`, so it stacks on PR #51).
Scope: `packages/Angular` only. No schema, no server, no behaviour change beyond fixing
the layout bugs listed in T1.

## Why

Every Forms surface authors its own CSS in isolation — `form-builder.styles.ts`,
`builder-styles.ts`, `forms-home-dashboard.component.css`,
`forms-reporting-dashboard.component.css`, plus inline `styles:` on ~10 components.
There are three unrelated button implementations (`.btn`, `.mjf-btn`, ad-hoc), three
card treatments and three table treatments. Nothing is *wrong* token-wise (the
`lint:ui` gate passes) but the result reads cramped and generic: 13px type, 8px
padding, shouty uppercase column headers, saturated status pills, tables that
side-scroll on mobile.

The fix is not "restyle five files." It is **one shared Forms design layer** that every
surface consumes, so the spacing/elevation/typography decision lives in exactly one
place. That is the deeper module: small interface (a few exported CSS constants),
real work hidden, and it is what makes light/dark and small-screen correctness
automatic rather than per-component.

## What we take from Typeform

Spatial and hierarchy language only — the palette stays MJ's.

1. Generous whitespace: 24–32px page gutters, 16–20px inside cards, real gaps between sections.
2. Soft chrome: hairline borders, very subtle shadow, page bg distinct from card bg.
3. Rounded corners: ~12px cards/rows, 999px pills and segmented controls.
4. Restrained type scale: 28px page title, 20px section, 14–15px body, 13px muted meta.
   Column headers muted and sentence case — **not** uppercase-tracked.
5. Row-as-card lists with a leading icon tile, right-aligned metrics under muted labels,
   hover elevation, actions revealed on hover.
6. One high-contrast primary action; everything else quiet/ghost.
7. Numbered, type-iconed question chips in the builder rail.

## Tasks

- [x] **T0 — Design layer.** `lib/shared/forms-ui.ts`: a `--mjf-*` scale block
      (all derived from `--mj-*`, so dark mode is free) plus primitives — surface/card,
      button, badge, list-row, table, field, section header, empty state, toolbar,
      segmented control. Spec-guarded.
- [x] **T1 — Fix the layout bugs found live.** `.fb-tabs` collapses to 1px on the
      Responses / On Submit tabs (flex-shrink, no `flex:none`) so the tab strip vanishes
      and you cannot navigate back. Those two panes also sit outside the flex column,
      so they overflow `.fb` instead of scrolling inside it.
- [x] **T2 — Forms home (list).** Row cards, icon tile, quiet headers, subtle status
      badges, spacious header, real empty state, card collapse on mobile.
- [x] **T3 — Builder shell.** Topbar, tab strip, three-pane rhythm, palette, question
      cards (inline hover actions instead of the stacked button column that forces a
      120px row), properties panel with a header and breathing room.
- [x] **T4 — Responses tab, detail, and the Form Response form override.**
- [x] **T5 — Responses & Analytics dashboard.** Stat cards, tab strip, styled form
      picker, graceful sparse state.
- [x] **T6 — Responsive + dark pass** at 390 / 768 / 1024 / 1440 on every surface,
      verified in the browser.
- [x] **T7 — Gates.** `npm run lint:ui`, package build, vitest, before/after captures.

## Verification

Live Explorer on :4201 serves `bizapps-forms/packages/Angular` (main checkout) via a
pnpm symlink from `MJ/packages/MJExplorer/node_modules/@mj-biz-apps/forms-ng`. The
worktree has no `node_modules`, so the loop is: author here → rsync `src/` to the main
checkout → build there → hard-reload the browser. `ng serve` does not watch
`node_modules`, so a rebuild alone is not always enough.


## Bugs found and fixed along the way

Every one of these was found in the browser, not by reading code, and every one of them
sat behind a green token gate and a green unit suite. That is the recurring lesson of this
work: these surfaces fail in ways only rendering reveals.

1. **The builder tab strip collapsed to 1px on Responses / On Submit.** `.fb` is a
   fixed-height flex column and `.fb-tabs` had no `flex: none`, so a taller pane
   crushed it — leaving no way back to Build. The two panes also sat outside the
   scroll container and overflowed the shell instead of scrolling inside it.
2. **Dark mode erased every hairline drawn on a card.** `--mj-border-subtle` and
   `--mj-bg-surface` resolve to the same neutral in MJ's dark theme, so table rules,
   the tab underline, the pane dividers and the answer-row separators were all
   invisible — and perfectly correct in light mode, which is why nobody saw it. Now
   routed through a `--mjf-rule` token; `--mj-border-subtle` is reserved for card
   outlines against the page, where the page supplies the contrast.
3. **The list-row tile lost its icon in dark mode**, for the same class of reason:
   `--mj-brand-primary-light` and `--mj-brand-primary` land a few percent apart in
   dark. The tile is now a `color-mix` tint of the surface it sits on.
4. **Numeric column headers stayed left-aligned above right-aligned numbers.**
   Angular's emulated encapsulation appends its `[_ngcontent]` attribute to *every*
   compound selector, so `.mjf-table thead th` outweighed `.mjf-table th.is-num`.
   Dropping the redundant `thead` step restores the intended order.

### Later rounds (same branch)

5. **Preview was dead in the Explorer.** `NG0201: No provider found for FORMS_API_CONFIG`,
   then `FormUploadService` behind it — the preview modal hand-rolled a subset of the
   providers `<mj-form>` needs, so it broke as soon as the widget grew a dependency. Both
   hosts now share `formsWidgetProviders()`.
6. **Answers rendered in query order, not form order** — "Last name" above "First name".
   Driven by the question list now, which is already in page/display order.
7. **Every respondent read "Anonymous"**, including ones who gave a name and an email; the
   label only ever consulted the linked Person record, which a public form never has.
8. **The QR code was unscannable.** Mask 0 was being applied over the alignment pattern
   (version 2+, i.e. every real form URL), and the code rendered inverted in dark mode.
   The old tests asserted shape — square, finder patterns, deterministic — all of which
   pass happily on a code no scanner can read. There is now an independent decoder.
9. **Publish state was a one-way latch.** Adding a question and deleting it again left the
   form claiming unpublished changes; a page reload reset the flag and hid real ones. It is
   a fingerprint comparison against the live snapshot now — see `publish-fingerprint.ts`.
10. **Corner radius changed inputs and cards too**, under a control labelled Buttons.

### Follow-on features

- **Archive / restore** on the forms list. Not a delete: no FK to `Form` cascades, so a
  real delete throws for any edited form and would destroy submitted responses.
- **AI score removed** from the response detail and the CSV/Excel export. The scoring
  action scores every ShortText answer, so a first name came back at 100/100.
- **Design tab rebuilt** as a Logo / Font / Buttons / Background token editor over a live
  render of the real form, replacing the preset gallery. Each form now owns its style
  (`ensureOwnStyle`), so editing one cannot restyle another.

## Notes / not done

- The nav item reads **Responses & Analytics** while the page it opens is titled
  **Forms Reporting**. Left alone deliberately: renaming a user-facing surface is a
  content decision, not a styling one.
- The reporting **Summary** tab is still mostly empty below the four figures. Filling
  it means adding a trend series (Typeform's "Trends" / "Question by question"),
  which is new data work, not a restyle.
- **On Submit automations are excluded from the publish fingerprint.** They are genuinely
  publishable, but they are edited in a child tab that does not report changes upward. The
  old latch did not track them either, so this holds behaviour rather than regressing it;
  the fix is to have that tab feed its state up.
- The respondent **widget** gained Design-tab tokens (`--mjf-page-bg-image`, title/question
  size and alignment) but is otherwise untouched — it is bundled
  standalone and themed from `FormStyle.Tokens`. Verified: none of the design-layer
  markers appear in `dist/widget/mj-form.js`.
