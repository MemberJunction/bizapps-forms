/**
 * Design panel styles — plain-CSS string (the package builds with `ngc` only, no SCSS).
 *
 * The controls use `--mj-*` builder tokens. The PREVIEW surface (`.dp-preview-frame`
 * and its children) styles itself with `--mjf-*` form tokens that `applyStyleTokens`
 * sets on the host at runtime, each falling back to a `--mj-*` token — so the preview
 * re-themes exactly like the published widget and carries no hardcoded colors.
 */
export const DESIGN_PANEL_STYLES = /* css */ `
.dp {
  display: grid;
  grid-template-columns: minmax(300px, 380px) minmax(0, 1fr);
  gap: var(--mjf-stack);
  height: 100%;
  min-height: 0;
}

/* ----------------------------------------------------------------- editor */

.dp-editor {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 1px solid var(--mj-border-subtle);
  border-radius: var(--mjf-radius);
  background: var(--mj-bg-surface);
  overflow: hidden;
}

.dp-tabs { flex: none; padding: 0 var(--mjf-card-pad); gap: var(--mjf-gap); }
.dp-tabs .mjf-tab { font-size: var(--mjf-meta); }
.dp-tabs .mjf-tab + .mjf-tab { margin-left: 0; }

.dp-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: var(--mjf-card-pad);
  display: flex;
  flex-direction: column;
  gap: var(--mjf-stack);
}

/* align-items:flex-start so a segmented control sits at its natural width — a column
   flex container stretches its children, which made the radius picker span the panel. */
.dp-group { display: flex; flex-direction: column; align-items: flex-start; gap: var(--mjf-gap-sm); }
.dp-group > .mjf-field,
.dp-group > .dp-row,
.dp-group > .mjf-select { align-self: stretch; }
.dp-group-title { margin: 0; font-size: var(--mjf-meta); font-weight: 600; color: var(--mj-text-primary); }
.dp-sub-label { font-size: var(--mjf-meta); color: var(--mj-text-secondary); }

/* One control per line, label left, control right — the shape the whole panel repeats. */
.dp-row { display: flex; align-items: center; justify-content: space-between; gap: var(--mjf-gap); min-height: 36px; }
.dp-row-label { font-size: var(--mjf-meta); color: var(--mj-text-secondary); }
.dp-row--controls { justify-content: flex-start; gap: var(--mjf-gap-sm); flex-wrap: wrap; }

/* A native colour input, restyled to read as a swatch rather than an OS control. */
.dp-swatch {
  flex: none;
  width: 52px;
  height: 32px;
  padding: 2px;
  cursor: pointer;
  background: var(--mj-bg-surface);
  border: 1px solid var(--mj-border-default);
  border-radius: var(--mjf-radius-sm);
}
.dp-swatch::-webkit-color-swatch-wrapper { padding: 0; }
.dp-swatch::-webkit-color-swatch { border: none; border-radius: 4px; }
.dp-swatch:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: 2px; }

/* The corner-radius picker draws its options rather than naming them: three corner
   glyphs, matching what the control actually changes. */
.dp-radius {
  display: block;
  width: 18px;
  height: 14px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-bottom-color: transparent;
}
.dp-radius--sharp { border-radius: 0; }
.dp-radius--soft { border-top-left-radius: 5px; }
.dp-radius--round { border-top-left-radius: 12px; }

.dp-logo-preview {
  display: flex;
  align-items: center;
  gap: var(--mjf-gap-sm);
  padding: var(--mjf-gap-sm);
  border: 1px solid var(--mj-border-subtle);
  border-radius: var(--mjf-radius-sm);
  background: var(--mj-bg-surface-sunken);
}
.dp-logo-preview img { max-height: 40px; max-width: 140px; }

.dp-actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--mjf-gap-sm);
  flex-wrap: wrap;
  padding: var(--mjf-gap-sm) var(--mjf-card-pad);
  border-top: 1px solid var(--mjf-rule);
  background: var(--mj-bg-surface);
}
.dp-status { font-size: var(--mjf-label); color: var(--mj-text-secondary); }

/* ---------------------------------------------------------------- preview */

.dp-preview {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  border-radius: var(--mjf-radius);
  border: 1px solid var(--mj-border-subtle);
}

@media (max-width: 1000px) {
  .dp { grid-template-columns: 1fr; height: auto; }
  .dp-editor { max-height: 60vh; }
}

/* ------- Live preview surface (form tokens; each falls back to a --mj-* token) ------- */
.dp-preview > mj-form { display: block; min-height: 100%; }

/* Colour row: swatch plus the hex box beside it. */
.dp-color { display: flex; align-items: center; gap: var(--mjf-gap-sm); }
.dp-hex { width: 96px; font-family: var(--mj-font-family-mono, monospace); text-transform: lowercase; }
`;
