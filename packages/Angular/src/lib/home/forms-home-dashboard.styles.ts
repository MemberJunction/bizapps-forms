/**
 * Styles unique to the Forms home list. Everything generic — page scaffold, rows,
 * badges, buttons, fields, empty state — comes from `FORMS_UI_CSS`; if a rule here
 * looks like it would be useful on another surface, it belongs there instead.
 */
export const FORMS_HOME_CSS = /* css */ `
:host {
  display: block;
  height: 100%;
  overflow: auto;
  background: var(--mj-bg-page);
  font-family: var(--mj-font-family);
}

.home-toolbar { display: flex; align-items: center; gap: var(--mjf-gap); }
.home-toolbar .mjf-search { flex: 1 1 320px; max-width: 420px; }
.home-count { font-size: var(--mjf-meta); color: var(--mj-text-muted); white-space: nowrap; }

/* Archive reads as destructive on hover, restore does not.

   The tint is the status token, not a literal, so it stays legible in both themes — and
   it is a tint rather than a fill because archiving is reversible: the colour should say
   "this one removes something" without claiming the row is about to be destroyed. */
.home-archive:hover:not(:disabled) {
  background: var(--mj-status-error-bg);
  color: var(--mj-status-error-text);
}
.home-archive:focus-visible { outline-color: var(--mj-status-error); }

.home-restore:hover:not(:disabled) {
  background: var(--mj-status-success-bg);
  color: var(--mj-status-success-text);
}

/* The row's trailing affordance. Muted until hover so a long list doesn't read as a
   column of arrows. */
.home-chevron { flex: none; color: var(--mj-text-disabled); font-size: var(--mjf-meta); transition: color var(--mjf-ease), transform var(--mjf-ease); }
.mjf-row:hover .home-chevron { color: var(--mj-text-secondary); transform: translateX(2px); }

/* --- Authoring panels --- */

.home-panel { display: flex; flex-direction: column; gap: var(--mjf-gap); }
.home-panel-actions { display: flex; gap: var(--mjf-gap-sm); }

.home-templates {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: var(--mjf-gap-sm);
}
.home-template {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--mjf-gap-sm);
  padding: var(--mjf-card-pad-sm);
  font: inherit;
  font-size: var(--mjf-meta);
  font-weight: 600;
  text-align: left;
  cursor: pointer;
  color: var(--mj-text-primary);
  background: var(--mj-bg-surface);
  border: 1px solid var(--mj-border-subtle);
  border-radius: var(--mjf-radius-sm);
  transition: border-color var(--mjf-ease), background var(--mjf-ease);
}
.home-template i { font-size: 1.125rem; color: var(--mj-text-muted); transition: color var(--mjf-ease); }
.home-template:hover:not(:disabled) { border-color: var(--mj-border-strong); background: var(--mj-bg-surface-hover); }
.home-template:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: 2px; }
.home-template.is-selected { border-color: var(--mj-brand-primary); box-shadow: 0 0 0 1px var(--mj-brand-primary); }
.home-template.is-selected i { color: var(--mj-brand-primary); }

/* --- Small screens ---
   The row collapses from one line to two: identity on top, status and metrics
   underneath. A horizontally-scrolling list is the thing this replaces. */
@media (max-width: 720px) {
  .mjf-page-actions { width: 100%; }
  .mjf-page-actions .mjf-btn { flex: 1 1 auto; }

  .home-toolbar { flex-wrap: wrap; }
  .home-toolbar .mjf-search { flex: 1 1 100%; max-width: none; }

  .mjf-row { flex-wrap: wrap; row-gap: var(--mjf-gap-sm); }
  .mjf-row-main { flex-basis: calc(100% - 56px); }
  .mjf-metrics { gap: var(--mjf-gap); }
  .mjf-metric { min-width: 0; text-align: left; }
  .home-chevron { display: none; }
}
`;
