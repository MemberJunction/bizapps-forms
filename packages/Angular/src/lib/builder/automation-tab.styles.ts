/**
 * Automate tab styles — plain-CSS string (the package builds with `ngc` only, no SCSS).
 *
 * Same two-pane shape as Build, Design and Distribute: a rail of things you can select on the
 * left, the selected thing filling the middle. The rail differs from Distribute's in one way that
 * matters — its items are a SEQUENCE, not a set — so it carries step numbers and a connector line
 * down the left edge. That line is the whole reason the rail earns its place here: the single most
 * important fact about this screen is that these things happen in an order, and a plain list of
 * cards says nothing about order at all.
 *
 * No literal colours. Every value resolves to an `--mj-*` semantic token or to a numeric of the
 * `--mjf-*` scale.
 */
export const AUTOMATION_STYLES = /* css */ `
.at { height: 100%; min-height: 0; overflow: hidden; }

.at-shell {
  display: grid;
  grid-template-columns: 264px minmax(0, 1fr);
  height: 100%;
  min-height: 0;
}

/* Everything that is not the two-pane view — loading, a failed load, the first run — still needs
   the gutter the shell moved inside. */
.at-pad { padding: var(--mjf-stack) var(--mjf-gutter); overflow-y: auto; height: 100%; box-sizing: border-box; }
.at-pad-inner { max-width: 860px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--mjf-stack); }

/* ------------------------------------------------------------------- the rail */

.at-rail {
  display: flex;
  flex-direction: column;
  gap: var(--mjf-gap-sm);
  min-width: 0;
  overflow-y: auto;
  padding: var(--mjf-stack) var(--mjf-gap);
  border-right: 1px solid var(--mjf-rule);
  background: var(--mj-bg-surface);
}
.at-rail-head { display: flex; align-items: center; justify-content: space-between; gap: var(--mjf-gap-sm); }
.at-rail-title {
  margin: 0;
  font-size: var(--mjf-label);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--mj-text-muted);
}

.at-rail-list { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; }

/* The connector. Drawn on the list item rather than between items so it cannot drift out of
   alignment with the numbers it threads, and stopped short on the last one so the sequence has a
   visible end rather than trailing off. */
.at-rail-list > li { position: relative; }
.at-rail-list > li::before {
  content: '';
  position: absolute;
  left: 25px;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--mjf-rule);
}
.at-rail-list > li:first-child::before { top: 50%; }
.at-rail-list > li:last-child::before { bottom: 50%; }
.at-rail-list > li:only-child::before { display: none; }

.at-rail-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--mjf-gap-sm);
  width: 100%;
  min-height: var(--mjf-tap);
  padding: var(--mjf-gap-sm) 10px;
  font: inherit;
  text-align: left;
  cursor: pointer;
  border: 1px solid transparent;
  border-radius: var(--mjf-radius-sm);
  background: transparent;
  color: var(--mj-text-primary);
  transition: background var(--mjf-ease), border-color var(--mjf-ease);
}
.at-rail-item:hover { background: var(--mj-bg-surface-hover); }
.at-rail-item:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: 2px; }
.at-rail-item.is-on { background: var(--mj-bg-surface); border-color: var(--mj-brand-primary); }

/* The step number sits ON the connector, so the line reads as passing through each step. Its own
   surface fill is what hides the line behind it. */
.at-step-num {
  position: relative;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  font-size: var(--mjf-label);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  border-radius: var(--mjf-radius-pill);
  background: color-mix(in srgb, var(--mj-brand-primary) 14%, var(--mj-bg-surface));
  color: var(--mj-brand-primary);
  box-shadow: 0 0 0 3px var(--mj-bg-surface);
}
/* A step that is switched off gets a dash instead of a number — it has no place in the sequence,
   and giving it one would make the count of "what happens" wrong by however many are off. */
.at-step-num.is-off {
  background: var(--mj-bg-surface-sunken);
  color: var(--mj-text-muted);
}

.at-rail-text { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.at-rail-name { font-size: var(--mjf-body); font-weight: 600; }
.at-rail-meta { font-size: var(--mjf-label); color: var(--mj-text-muted); }
.at-rail-item.is-disabled .at-rail-name { color: var(--mj-text-muted); font-weight: 500; }

/* ----------------------------------------------------------------- the detail */

.at-main { overflow-y: auto; padding: var(--mjf-stack) var(--mjf-gutter) 64px; min-width: 0; }
.at-detail { display: flex; flex-direction: column; gap: var(--mjf-gap); min-width: 0; max-width: 860px; margin: 0 auto; width: 100%; }

.at-head { display: flex; flex-direction: column; gap: var(--mjf-gap-xs); min-width: 0; }
.at-head-row { display: flex; align-items: center; gap: var(--mjf-gap-sm); flex-wrap: wrap; min-width: 0; }
.at-title { margin: 0; font-size: var(--mjf-section); font-weight: 700; color: var(--mj-text-primary); min-width: 0; }
.at-what { margin: 0; font-size: var(--mjf-body); color: var(--mj-text-secondary); max-width: 62ch; }

/* The headline. One sentence saying what a submission triggers, sized so it is read before the
   list below it — the answer to the only question anyone opens this tab with. */
.at-summary {
  display: flex;
  align-items: flex-start;
  gap: var(--mjf-gap-sm);
  padding: var(--mjf-card-pad-sm) var(--mjf-card-pad);
  border: 1px solid var(--mj-border-subtle);
  border-radius: var(--mjf-radius);
  background: var(--mj-bg-surface-sunken);
  font-size: var(--mjf-body);
  color: var(--mj-text-primary);
}
.at-summary i { color: var(--mj-text-muted); margin-top: 2px; }
.at-summary-note { display: block; margin-top: 2px; font-size: var(--mjf-meta); color: var(--mj-text-secondary); }

/* Small facts about the selected step: when it runs, what its failure costs. Icon-led so they
   scan as a group of notes rather than as more body copy. */
.at-facts { display: flex; flex-direction: column; gap: var(--mjf-gap-sm); margin: 0; padding: 0; list-style: none; }
.at-fact { display: flex; align-items: flex-start; gap: var(--mjf-gap-sm); font-size: var(--mjf-meta); color: var(--mj-text-secondary); }
.at-fact i { flex: none; width: 14px; margin-top: 2px; color: var(--mj-text-muted); text-align: center; }

/* ------------------------------------------------------------- adding a step */

/* Three choices, never a list of every possibility. Cards rather than a dropdown because the
   decision is the important one on this screen and each option needs a sentence to be choosable
   at all. */
.at-choices { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--mjf-gap); }
.at-choice {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--mjf-gap-sm);
  padding: var(--mjf-card-pad);
  text-align: left;
  font: inherit;
  cursor: pointer;
  border: 1px solid var(--mj-border-subtle);
  border-radius: var(--mjf-radius);
  background: var(--mj-bg-surface);
  color: var(--mj-text-primary);
  transition: border-color var(--mjf-ease), box-shadow var(--mjf-ease), background var(--mjf-ease);
}
.at-choice:hover { border-color: var(--mj-brand-primary); box-shadow: var(--mj-shadow-sm); }
.at-choice:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: 2px; }
.at-choice-title { font-size: var(--mjf-body); font-weight: 600; }
.at-choice-blurb { font-size: var(--mjf-meta); color: var(--mj-text-secondary); line-height: 1.5; }

/* -------------------------------------------------------------- pickers */

.at-results { display: flex; flex-direction: column; gap: var(--mjf-gap-xs); margin: 0; padding: 0; list-style: none; max-height: 320px; overflow-y: auto; }
.at-result {
  display: flex;
  align-items: center;
  gap: var(--mjf-gap-sm);
  width: 100%;
  min-height: var(--mjf-tap);
  padding: var(--mjf-gap-sm) 12px;
  font: inherit;
  text-align: left;
  cursor: pointer;
  border: 1px solid var(--mj-border-subtle);
  border-radius: var(--mjf-radius-sm);
  background: var(--mj-bg-surface);
  color: var(--mj-text-primary);
  transition: border-color var(--mjf-ease), background var(--mjf-ease);
}
.at-result:hover { border-color: var(--mj-brand-primary); background: var(--mj-bg-surface-hover); }
.at-result:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: 2px; }
.at-result-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1 1 auto; }
.at-result-name { font-weight: 600; font-size: var(--mjf-body); }
.at-result-meta { font-size: var(--mjf-label); color: var(--mj-text-muted); }

/* ------------------------------------------------------------------ mapping */

.at-map-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--mjf-gap-sm); flex-wrap: wrap; }
.at-map { width: 100%; border-collapse: collapse; font-size: var(--mjf-body); }
.at-map th {
  padding: 8px var(--mjf-gap-sm);
  text-align: left;
  font-size: var(--mjf-meta);
  font-weight: 500;
  color: var(--mj-text-muted);
  border-bottom: 1px solid var(--mjf-rule);
  white-space: nowrap;
}
.at-map td { padding: 10px var(--mjf-gap-sm); border-top: 1px solid var(--mjf-rule); vertical-align: middle; }
.at-map tbody tr:first-child td { border-top: none; }
.at-map-field { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.at-map-name { font-weight: 600; }
.at-map-type { font-size: var(--mjf-label); color: var(--mj-text-muted); }
.at-req { color: var(--mj-status-error-text); }

/* The rule column is the one thing here nobody needs on first pass, so it hides on a narrow
   viewport rather than squeezing the two columns that carry the decision. */
@media (max-width: 900px) { .at-map .at-col-rule { display: none; } }

/* ------------------------------------------------------------------ settings */

.at-settings { display: flex; flex-direction: column; gap: var(--mjf-gap); padding-top: var(--mjf-gap); border-top: 1px solid var(--mjf-rule); }
.at-settings-title { margin: 0; font-size: var(--mjf-label); font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--mj-text-muted); }
.at-setting { display: flex; align-items: center; justify-content: space-between; gap: var(--mjf-gap); }
.at-setting-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.at-setting-label { font-size: var(--mjf-body); font-weight: 600; }
.at-setting-hint { font-size: var(--mjf-meta); color: var(--mj-text-muted); max-width: 58ch; }
.at-setting-control { display: flex; align-items: center; gap: var(--mjf-gap-sm); flex: none; }

.at-danger { display: flex; align-items: center; gap: var(--mjf-gap-sm); flex-wrap: wrap; padding-top: var(--mjf-gap); border-top: 1px solid var(--mjf-rule); }

/* ---------------------------------------------------------------- activity */

.at-runs { display: flex; flex-direction: column; gap: var(--mjf-gap-sm); margin: 0; padding: 0; list-style: none; }
.at-run { display: flex; align-items: center; gap: var(--mjf-gap-sm); font-size: var(--mjf-meta); color: var(--mj-text-secondary); }
.at-run-when { color: var(--mj-text-muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.at-run-msg { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* -------------------------------------------------------------- built-ins */

/* The four hooks that run before anything is configured. Rendered flat and unclickable: they are
   a statement of fact, not a set of controls, and dressing them as rows you could act on would
   promise an edit that does not exist until the first real step is added. */
.at-builtin { display: flex; flex-direction: column; gap: var(--mjf-gap-sm); margin: 0; padding: 0; list-style: none; }
.at-builtin li { display: flex; align-items: flex-start; gap: var(--mjf-gap-sm); font-size: var(--mjf-body); color: var(--mj-text-primary); }
.at-builtin i { flex: none; width: 16px; margin-top: 3px; color: var(--mj-brand-primary); text-align: center; }
.at-builtin span { color: var(--mj-text-secondary); font-size: var(--mjf-meta); }

/* ------------------------------------------------------------------ mobile */

/* Below the two-pane threshold the rail becomes a horizontal strip above the detail. A 264px
   column and a 360px viewport cannot both exist, and the sequence is still readable left-to-right. */
@media (max-width: 860px) {
  .at-shell { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); }
  .at-rail { border-right: none; border-bottom: 1px solid var(--mjf-rule); overflow-x: auto; }
  .at-rail-list { flex-direction: row; gap: var(--mjf-gap-sm); }
  .at-rail-list > li::before { display: none; }
  .at-rail-item { width: auto; white-space: nowrap; }
}
`;
