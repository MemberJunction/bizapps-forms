/**
 * Responses & Analytics shell styles — plain-CSS string (the package builds with `ngc`
 * only, no SCSS).
 *
 * The same two-pane shape as Build, Design, Distribute and Automate: a rail of things you
 * can select on the left, the selected thing filling the rest. Getting the fifth surface
 * onto that shape is most of the redesign — it was the only one driving selection from a
 * `<select>`, which hid the very population this dashboard exists to survey.
 *
 * The rail's width matches Automate's 264px exactly. It is not a coincidence to be tidied
 * away later: two adjacent surfaces whose rails are 264 and 280 read as a rendering bug.
 *
 * Card, button, badge, tab, empty and alert treatments all come from `FORMS_UI_CSS`; chart
 * colour comes from `FORMS_VIZ_CSS`. Nothing here defines either.
 */
export const FORMS_REPORTING_CSS = /* css */ `
:host {
  display: block;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--mj-bg-page);
  color: var(--mj-text-primary);
  font-family: var(--mj-font-family);
  font-size: var(--mjf-body);
}

.rp {
  display: grid;
  grid-template-columns: 264px minmax(0, 1fr);
  height: 100%;
  min-height: 0;
}

/* ------------------------------------------------------------------- the rail */

.rp-rail {
  display: flex;
  flex-direction: column;
  gap: var(--mjf-gap);
  min-width: 0;
  min-height: 0;
  padding: var(--mjf-stack) var(--mjf-gap);
  border-right: 1px solid var(--mjf-rule);
  background: var(--mj-bg-surface);
}

.rp-rail-head { display: flex; flex-direction: column; gap: 3px; padding: 0 6px; }
.rp-rail-title {
  margin: 0;
  font-size: var(--mjf-section);
  font-weight: 650;
  letter-spacing: var(--mj-tracking-tight, -0.01em);
  color: var(--mj-text-primary);
}
.rp-rail-sub { margin: 0; font-size: var(--mjf-label); color: var(--mj-text-muted); }

.rp-rail-search .mjf-input { min-height: 34px; font-size: var(--mjf-meta); }

/* The list scrolls, the head and the count do not — so the search box stays reachable
   with two hundred forms below it. */
.rp-rail-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.rp-form {
  display: flex;
  align-items: center;
  gap: var(--mjf-gap-sm);
  width: 100%;
  min-height: var(--mjf-tap);
  padding: var(--mjf-gap-sm) 10px;
  font: inherit;
  font-size: var(--mjf-meta);
  text-align: left;
  cursor: pointer;
  border: 1px solid transparent;
  border-radius: var(--mjf-radius-sm);
  background: transparent;
  color: var(--mj-text-primary);
  transition: background var(--mjf-ease), border-color var(--mjf-ease);
}
.rp-form:hover:not(:disabled) { background: var(--mj-bg-surface-hover); }
.rp-form:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: 2px; }
.rp-form:disabled { cursor: default; }
.rp-form.is-on { background: var(--mj-bg-surface-sunken); border-color: var(--mj-brand-primary); font-weight: 600; }

.rp-form-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* The count is the rail's whole comparison axis, so it is the one thing that never
   truncates. A form with none is muted rather than hidden — "published and collecting
   nothing" is a finding, not an absence. */
.rp-form-count {
  flex: none;
  font-size: var(--mjf-label);
  font-weight: 600;
  color: var(--mj-text-secondary);
  font-variant-numeric: tabular-nums;
}
.rp-form-count.is-none { color: var(--mj-text-disabled); font-weight: 400; }

.rp-rail-none { margin: 0; padding: 0 6px; font-size: var(--mjf-meta); color: var(--mj-text-muted); }
.rp-rail-count { margin: 0; padding: 0 6px; font-size: var(--mjf-label); color: var(--mj-text-muted); }

/* ----------------------------------------------------------------- the report */

.rp-main { display: flex; flex-direction: column; min-width: 0; min-height: 0; }

/* Everything that is not the scrolling report — loading, the first-run empty state —
   still needs the gutter the scroller owns. */
.rp-pad { padding: var(--mjf-stack) var(--mjf-gutter); overflow-y: auto; }

.rp-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--mjf-gap);
  flex: none;
  padding: var(--mjf-gap) var(--mjf-gutter);
  border-bottom: 1px solid var(--mjf-rule);
  background: var(--mj-bg-surface);
}
.rp-head-titles { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.rp-head-name {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 650;
  letter-spacing: var(--mj-tracking-tight, -0.01em);
  color: var(--mj-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rp-head-sub { margin: 0; font-size: var(--mjf-label); color: var(--mj-text-muted); }

.rp-head-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--mjf-gap-sm); }
.rp-export { display: flex; gap: var(--mjf-gap-xs); }

.rp-scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
.rp-scroll-inner {
  display: flex;
  flex-direction: column;
  gap: var(--mjf-stack);
  box-sizing: border-box;
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
  padding: var(--mjf-stack) var(--mjf-gutter);
}

.rp-mock { align-self: flex-start; }

.rp-alert { align-items: center; }
.rp-alert-close {
  flex: none;
  padding: 4px;
  font: inherit;
  color: inherit;
  cursor: pointer;
  background: none;
  border: none;
  border-radius: var(--mjf-radius-sm);
}
.rp-alert-close:focus-visible { outline: 2px solid currentColor; outline-offset: 1px; }

/* Two columns at most. The old grid packed as many 320px cards per row as fitted, which
   on a wide screen produced four columns of squeezed bars and — worse — broke the
   question ORDER into a snake the reader had to reconstruct against the form they know.
   Wide cards keep the option labels readable, which is what the card is for. */
.rp-breakdowns {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
  gap: var(--mjf-gap);
  align-items: start;
}

/* ------------------------------------------------------------------ narrow */

/* Below this the rail cannot be a rail and a two-pane layout is a squeeze on both
   panes. It becomes a horizontally scrolling strip of chips above the report — the
   population stays visible, which is the property worth keeping, and the report gets
   the full width. */
@media (max-width: 900px) {
  :host { overflow: auto; }

  .rp { grid-template-columns: minmax(0, 1fr); height: auto; }

  .rp-rail {
    gap: var(--mjf-gap-sm);
    padding: var(--mjf-gap) var(--mjf-gutter);
    border-right: none;
    border-bottom: 1px solid var(--mjf-rule);
  }
  .rp-rail-head { padding: 0; }
  .rp-rail-search,
  .rp-rail-count { display: none; }

  .rp-rail-list {
    flex-direction: row;
    overflow-x: auto;
    overflow-y: hidden;
    gap: var(--mjf-gap-xs);
    padding-bottom: 2px;
    scrollbar-width: none;
  }
  .rp-rail-list::-webkit-scrollbar { display: none; }
  .rp-rail-list > li { flex: 0 0 auto; }

  .rp-form {
    min-height: 34px;
    padding: 0 12px;
    border-radius: var(--mjf-radius-pill);
    border-color: var(--mj-border-subtle);
    background: var(--mj-bg-surface-sunken);
  }
  .rp-form-name { max-width: 40vw; }

  .rp-head { position: static; padding: var(--mjf-gap) var(--mjf-gutter); }
  .rp-head-actions { width: 100%; }
  .rp-head-actions .mjf-seg { flex: 1 1 auto; }
  .rp-head-actions .mjf-seg button { flex: 1 1 auto; }

  .rp-scroll { overflow: visible; }
  .rp-breakdowns { grid-template-columns: minmax(0, 1fr); }
}
`;
