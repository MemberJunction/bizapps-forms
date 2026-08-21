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

/* The page column fills the scrollport even when the list is short. Without this it is only as
   tall as its content, and margin-top: auto below has no free space to push into. */
.mjf-page { min-height: 100%; }

/* The chat sits at the BOTTOM of the page, centred and always present.

   Two mechanisms, because one of them alone is only half the behaviour. position: sticky pins
   it to the bottom edge while a long list scrolls past — but sticky does nothing at all until
   the element would otherwise leave the scrollport, so on a short list (six forms in a tall
   window) it never engaged and the box sat wherever the list happened to end, floating in the
   middle of the page. margin-top: auto is what puts it at the bottom in that case: the page is
   a flex column, so the auto margin absorbs every pixel of leftover height. Long list: sticky
   does the work. Short list: the margin does. */
.home-chat {
  position: sticky;
  bottom: 0;
  z-index: 5;
  padding: var(--mjf-gap) 0 var(--mjf-gap-sm);
  margin-top: auto;
  background: linear-gradient(to top, var(--mj-bg-page, var(--mj-bg-surface)) 72%, transparent);
}
.home-panel-actions { display: flex; gap: var(--mjf-gap-sm); }

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
