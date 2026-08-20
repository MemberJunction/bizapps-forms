/**
 * The Forms design layer — one shared visual vocabulary for every authoring surface
 * (home list, builder, responses, reporting).
 *
 * WHY THIS EXISTS. Before this file, each surface authored its own CSS: three
 * unrelated button implementations, three card treatments, three table treatments.
 * Every one of them was token-correct, so the `lint:ui` gate stayed green while the
 * product drifted into three slightly different products. Spacing, elevation and
 * type scale are single decisions; they belong in one place.
 *
 * HOW IT STAYS THEME-CORRECT. Every `--mjf-*` below resolves to an `--mj-*` semantic
 * token, never to a literal. MJ redefines those under `[data-theme="dark"]`, so dark
 * mode costs us nothing and cannot drift. The only literals here are numeric — radii,
 * spacing, durations — which are theme-independent by nature. `--mj-shadow-*` is
 * already theme-aware (heavier alphas in dark), so we consume it rather than
 * hand-rolling shadows.
 *
 * HOW TO USE IT. Angular's emulated encapsulation scopes styles per component, so a
 * parent's `.mjf-btn` does NOT reach a child component's DOM. Every component that
 * renders these classes must include the CSS itself:
 *
 *     styles: [FORMS_UI_CSS, OWN_COMPONENT_CSS]
 *
 * That duplicates the string once per component in the bundle. It is deliberate: the
 * alternative is a global stylesheet, which the respondent widget (a custom element
 * living outside the Explorer shell) cannot rely on. Which brings us to the one hard
 * rule —
 *
 * DO NOT IMPORT THIS FROM `lib/widget/`. The widget is respondent-facing, bundled
 * standalone, size-sensitive, and themed from `FormStyle.Tokens` rather than from the
 * Explorer's `--mj-*` cascade. It keeps its own CSS on purpose.
 */

/**
 * Scale tokens. Spacing, radii and type sizes for the authoring surfaces, plus the
 * `--mjf-*` aliases the primitives below are written against.
 *
 * Exported separately from {@link FORMS_UI_PRIMITIVES} for components that want the
 * scale but none of the classes.
 */
export const FORMS_UI_TOKENS = /* css */ `
:host {
  /* Rhythm. The page gutter is the one value that changes with viewport; everything
     else is fixed so cards look identical wherever they are embedded. */
  --mjf-gutter: 32px;
  --mjf-stack: 24px;          /* between major sections */
  --mjf-gap: 16px;            /* between siblings inside a section */
  --mjf-gap-sm: 8px;
  --mjf-gap-xs: 4px;
  --mjf-card-pad: 20px;
  --mjf-card-pad-sm: 14px;

  /* Shape. 12px on cards/rows, pill on badges and segmented controls — the two
     radii that carry the whole look. */
  --mjf-radius: var(--mj-radius-lg, 12px);
  --mjf-radius-sm: var(--mj-radius-md, 8px);
  --mjf-radius-pill: var(--mj-radius-full, 9999px);

  /* Type. Deliberately restrained: one display size, one section size, one body
     size, one meta size. Anything else is a special case that needs justifying. */
  --mjf-title: 1.75rem;
  --mjf-section: 1.125rem;
  --mjf-body: 0.9375rem;
  --mjf-meta: 0.8125rem;
  --mjf-label: 0.75rem;

  /* Touch. Every interactive target is at least this tall — the plan's §2 UX bar. */
  --mjf-tap: 40px;

  --mjf-focus-ring: var(--mj-brand-primary);
  --mjf-ease: var(--mj-transition-base, 200ms ease);

  /* A hairline drawn ON a surface — table rules, tab-strip underline, dividers
     between rows of one card.

     It is NOT --mj-border-subtle, and that is the whole reason it exists: in dark
     mode --mj-border-subtle and --mj-bg-surface both resolve to neutral-800, i.e.
     byte-identical, so every divider inside a card disappeared while looking
     perfectly correct in light mode. --mj-border-subtle is only safe as a card
     OUTLINE, where the contrast comes from the page behind it. Use --mjf-rule for
     anything drawn on the card itself. */
  --mjf-rule: var(--mj-border-default);

  /* The boundary of an EMPTY, INTERACTIVE region — a dropzone, a placeholder slot.

     Deliberately not --mjf-rule and not any --mj-border-*: those are hairlines drawn
     BETWEEN surfaces, where low contrast is the point. This one carries an affordance
     ("you may drop a file here"), so WCAG 1.4.11 asks for 3:1 against what it sits on,
     and every border token misses badly — measured against the live theme on the sunken
     fill these regions use: border-default 1.12 light / 1.96 dark, border-strong 1.35 /
     2.68. The dropzone read as a plain filled rectangle with no edge at all.

     --mj-text-muted gives 4.31 light / 7.90 dark, and pairs sensibly: the boundary
     matches the weight of the muted hint text inside it. Brand is reserved for the
     drag-over state, so that the page does not shout before anything is happening. */
  --mjf-dropzone-edge: var(--mj-text-muted);
}

@media (max-width: 720px) {
  :host {
    --mjf-gutter: 16px;
    --mjf-stack: 20px;
    --mjf-card-pad: 16px;
  }
}
`;

/**
 * The primitives every Forms surface is built from. Grouped by what they are, not by
 * where they are used — if a class only ever appears on one surface it belongs in
 * that component's own CSS, not here.
 */
export const FORMS_UI_PRIMITIVES = /* css */ `
/* ---------------------------------------------------------------- page scaffold */

.mjf-page {
  display: flex;
  flex-direction: column;
  gap: var(--mjf-stack);
  box-sizing: border-box;
  width: 100%;
  max-width: 1180px;
  margin: 0 auto;
  padding: var(--mjf-gutter);
  color: var(--mj-text-primary);
  font-size: var(--mjf-body);
}

.mjf-page-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--mjf-gap);
}
.mjf-page-headings { display: flex; flex-direction: column; gap: var(--mjf-gap-xs); min-width: 0; }
.mjf-page-title {
  margin: 0;
  font-size: var(--mjf-title);
  font-weight: 600;
  letter-spacing: var(--mj-tracking-tight, -0.01em);
  line-height: 1.2;
  color: var(--mj-text-primary);
}
.mjf-page-sub { margin: 0; font-size: var(--mjf-meta); color: var(--mj-text-secondary); }
.mjf-page-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--mjf-gap-sm); }

.mjf-section { display: flex; flex-direction: column; gap: var(--mjf-gap); min-width: 0; }
.mjf-section-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--mjf-gap-sm);
}
.mjf-section-title {
  margin: 0;
  font-size: var(--mjf-section);
  font-weight: 600;
  color: var(--mj-text-primary);
}
.mjf-section-sub { margin: 0; font-size: var(--mjf-meta); color: var(--mj-text-secondary); }

/* A quiet group label. Sentence case with a little tracking — the shouty
   uppercase-tracked variant reads as noise once there are more than two of them. */
.mjf-eyebrow {
  margin: 0;
  font-size: var(--mjf-label);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--mj-text-muted);
}

/* ----------------------------------------------------------------------- cards */

.mjf-card {
  box-sizing: border-box;
  border: 1px solid var(--mj-border-subtle);
  border-radius: var(--mjf-radius);
  background: var(--mj-bg-surface);
  color: var(--mj-text-primary);
}
.mjf-card--pad { padding: var(--mjf-card-pad); }
.mjf-card--raised { box-shadow: var(--mj-shadow-sm); }

/* --------------------------------------------------------------------- buttons */

.mjf-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--mjf-gap-sm);
  box-sizing: border-box;
  min-height: var(--mjf-tap);
  padding: 0 16px;
  font: inherit;
  font-size: var(--mjf-meta);
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  border: 1px solid transparent;
  border-radius: var(--mjf-radius-sm);
  transition: background var(--mjf-ease), border-color var(--mjf-ease), color var(--mjf-ease), box-shadow var(--mjf-ease);
}
.mjf-btn:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: 2px; }
.mjf-btn:disabled { opacity: 0.45; cursor: not-allowed; }

.mjf-btn--primary { color: var(--mj-brand-on-primary, var(--mj-text-inverse)); background: var(--mj-brand-primary); }
.mjf-btn--primary:hover:not(:disabled) { background: var(--mj-brand-primary-hover); }
.mjf-btn--primary:active:not(:disabled) { background: var(--mj-brand-primary-active); }

.mjf-btn--ghost { color: var(--mj-text-primary); background: var(--mj-bg-surface); border-color: var(--mj-border-default); }
.mjf-btn--ghost:hover:not(:disabled) { background: var(--mj-bg-surface-hover); border-color: var(--mj-border-strong); }

/* Borderless. For dense toolbars and row-level actions, where a border per control
   would turn the row into a grid of boxes. */
.mjf-btn--quiet { color: var(--mj-text-secondary); background: transparent; }
.mjf-btn--quiet:hover:not(:disabled) { background: var(--mj-bg-surface-hover); color: var(--mj-text-primary); }

.mjf-btn--danger { color: var(--mj-status-error-text); background: transparent; border-color: var(--mj-status-error-border); }
.mjf-btn--danger:hover:not(:disabled) { background: var(--mj-status-error-bg); }

.mjf-btn--sm { min-height: 32px; padding: 0 12px; font-size: var(--mjf-label); }
.mjf-btn--icon { width: var(--mjf-tap); padding: 0; }
.mjf-btn--icon.mjf-btn--sm { width: 32px; }

/* ---------------------------------------------------------------------- badges */

/* Tinted, never saturated. A solid-fill status pill next to body text is the single
   loudest thing on a list page and it is never the most important thing on it. */
.mjf-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--mjf-gap-xs);
  padding: 3px 10px;
  font-size: var(--mjf-label);
  font-weight: 600;
  line-height: 1.5;
  white-space: nowrap;
  border: 1px solid var(--mj-border-subtle);
  border-radius: var(--mjf-radius-pill);
  color: var(--mj-text-secondary);
  background: var(--mj-bg-surface-sunken);
}
.mjf-badge--success { color: var(--mj-status-success-text); background: var(--mj-status-success-bg); border-color: var(--mj-status-success-border); }
.mjf-badge--info    { color: var(--mj-status-info-text);    background: var(--mj-status-info-bg);    border-color: var(--mj-status-info-border); }
.mjf-badge--warning { color: var(--mj-status-warning-text); background: var(--mj-status-warning-bg); border-color: var(--mj-status-warning-border); }
.mjf-badge--danger  { color: var(--mj-status-error-text);   background: var(--mj-status-error-bg);   border-color: var(--mj-status-error-border); }

/* ------------------------------------------------------------------ list rows */

.mjf-list { display: flex; flex-direction: column; gap: var(--mjf-gap-sm); }

.mjf-row {
  display: flex;
  align-items: center;
  gap: var(--mjf-gap);
  box-sizing: border-box;
  width: 100%;
  min-height: 64px;
  padding: var(--mjf-card-pad-sm) var(--mjf-card-pad);
  text-align: left;
  font: inherit;
  font-size: var(--mjf-body);
  color: var(--mj-text-primary);
  background: var(--mj-bg-surface);
  border: 1px solid var(--mj-border-subtle);
  border-radius: var(--mjf-radius);
  cursor: pointer;
  transition: border-color var(--mjf-ease), box-shadow var(--mjf-ease), background var(--mjf-ease);
}
.mjf-row:hover { border-color: var(--mj-border-strong); box-shadow: var(--mj-shadow-sm); }
.mjf-row:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: 2px; }
.mjf-row.is-selected { border-color: var(--mj-brand-primary); box-shadow: 0 0 0 1px var(--mj-brand-primary); }

/* The leading tile. Gives a list of same-shaped rows a scannable left edge.

   The fill is mixed from the row's own surface rather than taken from a fixed
   light-brand token. A fixed one only has enough contrast against the glyph in one
   theme: in dark mode mj-brand-primary-light and mj-brand-primary land within a few
   percent of each other and the icon disappears entirely. Mixing keeps the tile a
   constant 12% tint of whatever surface it is sitting on, in both themes. */
.mjf-tile {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 40px;
  height: 40px;
  border-radius: var(--mjf-radius-sm);
  background: color-mix(in srgb, var(--mj-brand-primary) 12%, var(--mj-bg-surface));
  color: var(--mj-brand-primary);
  font-size: 1rem;
}

.mjf-row-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.mjf-row-title { font-weight: 600; color: var(--mj-text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mjf-row-meta { font-size: var(--mjf-meta); color: var(--mj-text-muted); }

/* Right-aligned metric stack. Value above, muted label below — reads as a column
   header without needing a table. */
.mjf-metrics { display: flex; align-items: center; gap: var(--mjf-stack); flex: none; }
.mjf-metric { display: flex; flex-direction: column; gap: 2px; min-width: 72px; text-align: right; }
.mjf-metric-value { font-size: var(--mjf-body); font-weight: 600; color: var(--mj-text-primary); font-variant-numeric: tabular-nums; }
.mjf-metric-label { font-size: var(--mjf-label); color: var(--mj-text-muted); }

/* Row actions reveal on hover, and unconditionally for keyboard users and touch. */
.mjf-row-actions { display: flex; align-items: center; gap: var(--mjf-gap-xs); flex: none; opacity: 0; transition: opacity var(--mjf-ease); }
.mjf-row:hover .mjf-row-actions,
.mjf-row:focus-within .mjf-row-actions { opacity: 1; }
@media (hover: none) { .mjf-row-actions { opacity: 1; } }

/* ---------------------------------------------------------------------- tables */

.mjf-table-wrap { overflow-x: auto; border: 1px solid var(--mj-border-subtle); border-radius: var(--mjf-radius); background: var(--mj-bg-surface); }
.mjf-table { width: 100%; border-collapse: collapse; font-size: var(--mjf-body); }
/* Deliberately "th", not "thead th".

   Angular's emulated encapsulation appends its [_ngcontent] attribute to EVERY
   compound selector in a rule, not just the last one. The extra thead therefore
   collects an attribute of its own, and the header rule outweighs the .is-num rule
   below — which is how a numeric column header stayed left-aligned above its
   right-aligned numbers. Only th lives in a thead here, so the descendant step
   bought nothing but that bug. */
.mjf-table th {
  padding: 12px var(--mjf-card-pad);
  text-align: left;
  white-space: nowrap;
  font-size: var(--mjf-meta);
  font-weight: 500;
  color: var(--mj-text-muted);
  border-bottom: 1px solid var(--mjf-rule);
}
.mjf-table tbody td {
  padding: 14px var(--mjf-card-pad);
  color: var(--mj-text-primary);
  border-top: 1px solid var(--mjf-rule);
  vertical-align: middle;
}
.mjf-table tbody tr:first-child td { border-top: none; }
/* Both selectors are needed: the header rule above sets text-align on every th, so a
   numeric column's header would stay left while its values went right. */
.mjf-table th.is-num,
.mjf-table td.is-num { text-align: right; font-variant-numeric: tabular-nums; }
.mjf-table tbody tr.is-clickable { cursor: pointer; }
.mjf-table tbody tr.is-clickable:hover { background: var(--mj-bg-surface-hover); }
.mjf-table tbody tr:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: -2px; }

/* ---------------------------------------------------------------------- fields */

.mjf-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.mjf-field-label { font-size: var(--mjf-meta); font-weight: 600; color: var(--mj-text-secondary); }
.mjf-field-hint { font-size: var(--mjf-label); color: var(--mj-text-muted); }

.mjf-input,
.mjf-select,
.mjf-textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: var(--mjf-tap);
  padding: 9px 12px;
  font: inherit;
  font-size: var(--mjf-body);
  color: var(--mj-text-primary);
  background: var(--mj-bg-surface);
  border: 1px solid var(--mj-border-default);
  border-radius: var(--mjf-radius-sm);
  transition: border-color var(--mjf-ease), box-shadow var(--mjf-ease);
}
.mjf-input::placeholder,
.mjf-textarea::placeholder { color: var(--mj-text-disabled); }
.mjf-input:focus,
.mjf-select:focus,
.mjf-textarea:focus {
  outline: none;
  border-color: var(--mj-brand-primary);
  box-shadow: 0 0 0 3px var(--mj-brand-accent-subtle, transparent);
}
.mjf-input:disabled,
.mjf-select:disabled,
.mjf-textarea:disabled { opacity: 0.6; cursor: not-allowed; }
.mjf-textarea { min-height: 88px; resize: vertical; line-height: 1.5; }

/* An on/off switch. A native checkbox with a custom face would be better for forms
   the user submits; this is a settings toggle that applies immediately, so the
   button + role="switch" pairing is the honest one. */
.mjf-switch {
  position: relative;
  flex: none;
  width: 40px;
  height: 24px;
  padding: 0;
  cursor: pointer;
  border: none;
  border-radius: var(--mjf-radius-pill);
  background: var(--mj-border-strong);
  transition: background var(--mjf-ease);
}
.mjf-switch::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--mj-bg-surface);
  box-shadow: var(--mj-shadow-sm);
  transition: transform var(--mjf-ease);
}
.mjf-switch.is-on { background: var(--mj-brand-primary); }
.mjf-switch.is-on::after { transform: translateX(16px); }
.mjf-switch:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: 2px; }
.mjf-switch:disabled { opacity: 0.5; cursor: not-allowed; }

/* A search box with room for its leading icon. */
.mjf-search { position: relative; display: flex; align-items: center; }
.mjf-search > i { position: absolute; left: 12px; color: var(--mj-text-muted); pointer-events: none; font-size: var(--mjf-meta); }
.mjf-search > .mjf-input { padding-left: 34px; }

/* ------------------------------------------------------- toolbars and segments */

.mjf-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--mjf-gap-sm); }
.mjf-spacer { flex: 1 1 auto; }

.mjf-seg {
  display: inline-flex;
  padding: 3px;
  gap: 2px;
  background: var(--mj-bg-surface-sunken);
  border: 1px solid var(--mj-border-subtle);
  border-radius: var(--mjf-radius-pill);
}
.mjf-seg button {
  min-height: 32px;
  padding: 0 14px;
  font: inherit;
  font-size: var(--mjf-meta);
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  border: none;
  border-radius: var(--mjf-radius-pill);
  background: transparent;
  color: var(--mj-text-secondary);
  transition: background var(--mjf-ease), color var(--mjf-ease);
}
.mjf-seg button:hover:not(.is-on) { color: var(--mj-text-primary); }
.mjf-seg button.is-on { background: var(--mj-bg-surface); color: var(--mj-text-primary); box-shadow: var(--mj-shadow-sm); }
.mjf-seg button:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: 1px; }

/* Underline tabs. The strip scrolls rather than the page — five tabs exceed a
   360px viewport, and a wrapped tab row loses the underline's meaning. */
.mjf-tabs {
  display: flex;
  gap: var(--mjf-gap-sm);
  flex: none;
  overflow-x: auto;
  scrollbar-width: none;
  border-bottom: 1px solid var(--mjf-rule);
}
.mjf-tabs::-webkit-scrollbar { display: none; }
.mjf-tab {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: var(--mjf-gap-sm);
  min-height: var(--mjf-tap);
  padding: 0 4px;
  margin-bottom: -1px;
  font: inherit;
  font-size: var(--mjf-body);
  font-weight: 500;
  cursor: pointer;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--mj-text-secondary);
  transition: color var(--mjf-ease), border-color var(--mjf-ease);
}
.mjf-tab + .mjf-tab { margin-left: var(--mjf-gap); }
.mjf-tab:hover { color: var(--mj-text-primary); }
.mjf-tab.is-on { color: var(--mj-text-primary); font-weight: 600; border-bottom-color: var(--mj-brand-primary); }
.mjf-tab:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: 2px; border-radius: var(--mjf-radius-sm); }

/* ----------------------------------------------------------------------- state */

/* Inline status line — loading, or a note that sits in the content flow. */
.mjf-state {
  display: flex;
  align-items: center;
  gap: var(--mjf-gap-sm);
  padding: var(--mjf-card-pad);
  font-size: var(--mjf-body);
  color: var(--mj-text-secondary);
}

.mjf-alert {
  display: flex;
  align-items: flex-start;
  gap: var(--mjf-gap-sm);
  padding: 12px 16px;
  font-size: var(--mjf-meta);
  border: 1px solid var(--mj-status-error-border);
  border-radius: var(--mjf-radius-sm);
  background: var(--mj-status-error-bg);
  color: var(--mj-status-error-text);
}

.mjf-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--mjf-gap);
  padding: 64px var(--mjf-card-pad);
  text-align: center;
  color: var(--mj-text-secondary);
  border: 1px dashed var(--mj-border-default);
  border-radius: var(--mjf-radius);
  background: var(--mj-bg-surface);
}
.mjf-empty-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  font-size: 1.375rem;
  border-radius: var(--mjf-radius-pill);
  background: var(--mj-bg-surface-sunken);
  color: var(--mj-text-muted);
}
.mjf-empty-title { font-size: var(--mjf-section); font-weight: 600; color: var(--mj-text-primary); }
.mjf-empty-body { margin: 0; max-width: 42ch; font-size: var(--mjf-meta); color: var(--mj-text-secondary); }

/* -------------------------------------------------------------------- utilities */

.mjf-truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mjf-muted { color: var(--mj-text-muted); }
`;

/**
 * Tokens + primitives. What almost every Forms component wants:
 * `styles: [FORMS_UI_CSS, OWN_CSS]`.
 */
export const FORMS_UI_CSS = `${FORMS_UI_TOKENS}\n${FORMS_UI_PRIMITIVES}`;
