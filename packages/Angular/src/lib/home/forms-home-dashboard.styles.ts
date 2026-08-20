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

/* Live build progress. Every colour is a token — a hardcoded one here breaks dark mode, which
   is the mode this bar most often appears in. */
.home-gen { display: flex; flex-direction: column; gap: 6px; }
.home-gen-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--mjf-gap-sm); }
.home-gen-label { font-size: 0.875rem; color: var(--mj-text-secondary); }
.home-gen-count { font-size: 0.8125rem; font-variant-numeric: tabular-nums; color: var(--mj-text-muted); }
.home-gen-track {
  height: 6px;
  border-radius: var(--mj-radius-full, 999px);
  background: var(--mj-bg-surface-hover, var(--mj-bg-surface));
  overflow: hidden;
}
.home-gen-fill {
  height: 100%;
  background: var(--mj-brand-primary);
  border-radius: inherit;
  /* Eased rather than instant, so a jump from 25% to 75% still reads as progress rather than as
     the bar being redrawn. Disabled for anyone who asked for less motion. */
  transition: width 240ms ease-out;
}
@media (prefers-reduced-motion: reduce) {
  .home-gen-fill { transition: none; }
}
.home-panel-head { display: flex; align-items: center; justify-content: space-between; gap: var(--mjf-gap-sm); }

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
