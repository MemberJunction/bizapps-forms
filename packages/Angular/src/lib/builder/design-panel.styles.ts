/**
 * Design panel styles — plain-CSS string (the package builds with `ngc` only, no SCSS).
 *
 * Only the CONTROLS are styled here, with `--mj-*` builder tokens. The preview is
 * `mjf-form-preview-stage`, which brings its own layout and is deliberately left alone: this
 * pane once styled the widget directly and its `display: block` beat the widget's own
 * `:host { display: flex }` on specificity, collapsing the flex chain that centres welcome and
 * ending screens. `.dp-preview` is now a frame around the stage and says nothing about what is
 * inside it — see `form-preview-stage.spec.ts`.
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

/* A frame around the stage, nothing more. overflow:hidden so the stage's own scrolling
   happens inside the rounded corners rather than the pane scrolling as a whole — a preview
   that scrolls at two levels is a preview that cannot show you where the fold is. */
.dp-preview {
  display: flex;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border-radius: var(--mjf-radius);
  border: 1px solid var(--mj-border-subtle);
}

.dp-preview > mjf-form-preview-stage { flex: 1 1 auto; min-width: 0; }
/* The empty state is the only other thing this pane holds; auto margins centre it in the
   flex box rather than leaving it stranded in the top-left corner. */
.dp-preview > .mjf-state { margin: auto; }

/* Stacked, the stage needs a stated height: it is a flex column that scrolls internally, and
   \`height: 100%\` against an auto-height row resolves to auto — which is how a device frame
   turns back into a ribbon as long as its contents. */
@media (max-width: 1000px) {
  .dp { grid-template-columns: 1fr; height: auto; }
  .dp-editor { max-height: 60vh; }
  .dp-preview { height: 70vh; }
}

/* The AI surface at the foot of the Design rail, beside the controls it can drive. */
.dp-chat {
  flex: none;
  padding: 12px 14px 14px;
  border-top: 1px solid var(--mj-border-default);
  background: var(--mj-bg-surface);
}

/* ONE rule between the rail and its foot, not two. Both the save-status row and the chat draw a
   border-top, so when the status row renders — which is whenever a style has been touched — the
   two stacked into a pair of lines with an all-but-empty strip trapped between them. The status
   row is the top of that footer group, so it keeps the line; the chat drops its own and only
   draws it when it is the footer on its own. */
.dp-actions + .dp-chat { border-top: none; }
`;
