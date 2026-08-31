/**
 * Distribute tab styles — plain-CSS string (the package builds with `ngc` only, no SCSS).
 *
 * Layout follows the two-pane shape Build and Design already use: a narrow rail of things
 * you can select on the left, the selected thing filling the right. Three tabs that each
 * invented their own arrangement is how a product stops feeling like one product, and the
 * rail also fixes the old stacked-cards layout's real failure — with every link expanded
 * at once, nothing was emphasised, so the page read as a wall and the link (the one thing
 * anyone came for) was the same size as the response cap.
 *
 * The only literals are the two QR plate tokens, which are token DEFINITIONS and explained
 * where they sit.
 */
export const DISTRIBUTION_STYLES = /* css */ `
.dm { height: 100%; min-height: 0; overflow: hidden; }

/* The two panes scroll independently, so a long list of links never pushes the link you
   are reading off the screen, and vice versa. */
.dm-shell {
  display: grid;
  grid-template-columns: 264px minmax(0, 1fr);
  height: 100%;
  min-height: 0;
}

/* Anything that is not the two-pane view — loading, a failed load, the first run — still
   needs the gutter the shell moved inside. */
.dm-pad { padding: var(--mjf-stack) var(--mjf-gutter); }

/* ------------------------------------------------------------------- the rail */

/* Flush against the left edge with a rule down its side, matching .fb-pane--left in the
   Build tab. Its own scroll, its own surface: it reads as part of the chrome rather than
   as a card that happens to be on the left. */
.dm-rail {
  display: flex;
  flex-direction: column;
  gap: var(--mjf-gap-sm);
  min-width: 0;
  overflow-y: auto;
  padding: var(--mjf-stack) var(--mjf-gap);
  border-right: 1px solid var(--mjf-rule);
  background: var(--mj-bg-surface);
}
.dm-rail-head { display: flex; align-items: center; justify-content: space-between; gap: var(--mjf-gap-sm); }
.dm-rail-title {
  margin: 0;
  font-size: var(--mjf-label);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--mj-text-muted);
}
.dm-rail-list { display: flex; flex-direction: column; gap: var(--mjf-gap-xs); margin: 0; padding: 0; list-style: none; }

.dm-rail-item {
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
.dm-rail-item:hover { background: var(--mj-bg-surface-hover); }
.dm-rail-item:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: 2px; }
.dm-rail-item.is-on { background: var(--mj-bg-surface); border-color: var(--mj-brand-primary); }

.dm-rail-text { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.dm-rail-name { font-size: var(--mjf-body); font-weight: 600; }
.dm-rail-meta { font-size: var(--mjf-label); color: var(--mj-text-muted); }

/* A dot repeats what the meta line already says in words. It is reinforcement, never the
   message — colour alone would fail WCAG 1.4.1 and would be invisible to the third of
   authors who cannot tell the amber from the green. */
.dm-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--mj-text-muted); }
.dm-dot--success { background: var(--mj-status-success-text); }
.dm-dot--info { background: var(--mj-status-info-text); }
.dm-dot--warning { background: var(--mj-status-warning-text); }
.dm-dot--danger { background: var(--mj-status-error-text); }

/* ----------------------------------------------------------------- the detail */

/* The scrolling middle column. The measure cap lives on the content, not on the page, so
   the pane fills the window while the text inside it stays readable. */
.dm-main { overflow-y: auto; padding: var(--mjf-stack) var(--mjf-gutter) 64px; min-width: 0; }
.dm-detail { display: flex; flex-direction: column; gap: var(--mjf-gap); min-width: 0; max-width: 860px; margin: 0 auto; width: 100%; }

.dm-head { display: flex; flex-direction: column; gap: var(--mjf-gap-xs); min-width: 0; }
.dm-head-row { display: flex; align-items: center; gap: var(--mjf-gap-sm); flex-wrap: wrap; min-width: 0; }

/* The title IS the rename control. A separate pencil button would be a second thing to
   find; a title that reveals its affordance on hover is the pattern every document editor
   has already taught. */
.dm-name {
  display: inline-flex;
  align-items: center;
  gap: var(--mjf-gap-sm);
  max-width: 100%;
  padding: 2px 6px;
  margin-left: -6px;
  font: inherit;
  font-size: var(--mjf-section);
  font-weight: 700;
  text-align: left;
  cursor: text;
  border: 1px solid transparent;
  border-radius: var(--mjf-radius-sm);
  background: transparent;
  color: var(--mj-text-primary);
  transition: border-color var(--mjf-ease), background var(--mjf-ease);
}
.dm-name:hover { border-color: var(--mj-border-default); background: var(--mj-bg-surface-hover); }
.dm-name:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: 1px; }
.dm-name i { font-size: var(--mjf-label); color: var(--mj-text-muted); opacity: 0; transition: opacity var(--mjf-ease); }
.dm-name:hover i, .dm-name:focus-visible i { opacity: 1; }
.dm-name-input { font-size: var(--mjf-section); font-weight: 700; max-width: 24rem; }

.dm-detail-text { margin: 0; max-width: 68ch; font-size: var(--mjf-meta); line-height: 1.55; color: var(--mj-text-secondary); }

/* --------------------------------------------------------------- share surface */

.dm-panel {
  display: flex;
  flex-direction: column;
  gap: var(--mjf-gap);
  padding: var(--mjf-card-pad);
  border: 1px solid var(--mj-border-subtle);
  border-radius: var(--mjf-radius);
  background: var(--mj-bg-surface);
}

.dm-linkbar { display: flex; gap: var(--mjf-gap-sm); align-items: stretch; flex-wrap: wrap; }
.dm-linkfield {
  flex: 1 1 260px;
  min-width: 0;
  font-family: var(--mj-font-family-mono, monospace);
  font-size: var(--mjf-meta);
  background: var(--mj-bg-surface-sunken);
}
/* Copy is the ONE filled button on this surface. Everything else — open in a tab, download,
   pause — is ghost or quiet, so the eye lands on the action 90% of visits are here for. */
.dm-copy { flex: none; min-width: 8.5rem; justify-content: center; }

/* Advisory, not an error: nothing is broken and nothing needs fixing before release. */
.dm-warn {
  display: flex;
  align-items: flex-start;
  gap: var(--mjf-gap-sm);
  margin: 0;
  padding: var(--mjf-gap-sm) 10px;
  max-width: 62ch;
  border-radius: var(--mjf-radius-sm);
  background: color-mix(in srgb, var(--mj-status-warning) 14%, transparent);
  font-size: var(--mjf-label);
  line-height: 1.5;
  color: var(--mj-text-primary);
}
.dm-warn i { margin-top: 2px; color: var(--mj-status-warning); }
.dm-warn code { font-family: var(--mj-font-family-mono, monospace); }

.dm-note { margin: 0; max-width: 62ch; font-size: var(--mjf-meta); line-height: 1.55; color: var(--mj-text-secondary); }
.dm-sub { display: flex; gap: var(--mjf-gap-sm); flex-wrap: wrap; align-items: center; }

/* resize: none kills the native grab handle. Chrome draws that handle as an opaque light
   square that ignores the page's colours entirely, so on a dark theme it renders as a white
   notch in the corner of the box — and there is nothing to resize for anyway: the snippet is
   one line, and the box is sized to it. */
.dm-embed {
  min-height: 0;
  height: 4.5rem;
  resize: none;
  font-family: var(--mj-font-family-mono, monospace);
  font-size: var(--mjf-meta);
  background: var(--mj-bg-surface-sunken);
  white-space: pre;
  overflow-x: auto;
}

/* The QR plate is deliberately NOT theme-reactive: a QR is dark-on-light by spec, and
   inverting it in dark mode produces a code many scanners reject. These two are the only
   fixed colours in the file and they are token definitions, which is the sanctioned place
   for a literal. */
.dm-qr-wrap {
  --mjf-qr-dark: #111111;
  --mjf-qr-light: #ffffff;
}
.dm-qr-wrap { display: flex; gap: var(--mjf-stack); align-items: flex-start; flex-wrap: wrap; }
.dm-qr { flex: none; margin: 0; }
.dm-qr-plate {
  width: 176px;
  height: 176px;
  padding: 8px;
  box-sizing: border-box;
  border: 1px solid var(--mj-border-subtle);
  border-radius: var(--mjf-radius-sm);
  background: var(--mj-bg-surface);
}
.dm-qr-plate svg { width: 100%; height: 100%; display: block; }
.dm-qr-side { flex: 1 1 240px; min-width: 0; display: flex; flex-direction: column; gap: var(--mjf-gap); align-items: flex-start; }

/* -------------------------------------------------------------------- settings */

.dm-settings {
  display: flex;
  flex-direction: column;
  padding: 0 var(--mjf-card-pad);
  border: 1px solid var(--mj-border-subtle);
  border-radius: var(--mjf-radius);
  background: var(--mj-bg-surface);
}
.dm-settings-title {
  margin: 0;
  padding: var(--mjf-card-pad-sm) 0;
  font-size: var(--mjf-label);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--mj-text-muted);
  border-bottom: 1px solid var(--mj-border-subtle);
}
.dm-setting {
  display: flex;
  align-items: center;
  gap: var(--mjf-stack);
  padding: var(--mjf-card-pad-sm) 0;
  flex-wrap: wrap;
}
.dm-setting + .dm-setting { border-top: 1px solid var(--mj-border-subtle); }
.dm-setting-text { flex: 1 1 340px; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.dm-setting-label { font-size: var(--mjf-body); font-weight: 600; color: var(--mj-text-primary); }
.dm-setting-hint { max-width: 62ch; font-size: var(--mjf-label); line-height: 1.5; color: var(--mj-text-muted); }
.dm-setting-control { flex: none; display: flex; align-items: center; gap: var(--mjf-gap-sm); }
/* A control that grows a confirmation beside it. On a phone the two buttons and the
   consequence sentence do not fit one line, so they wrap and stay left-aligned rather
   than being squeezed to a width that truncates the warning. */
.dm-setting-control--stack { flex-wrap: wrap; max-width: 100%; }
.dm-num { width: 7rem; }
.dm-date { width: 15rem; max-width: 100%; }

/* Progress against a cap, not decoration: a limit you cannot see yourself approaching is a
   limit you only notice by having responses refused. */
.dm-meter { width: 8rem; height: 6px; border-radius: var(--mjf-radius-pill); background: var(--mj-bg-surface-sunken); overflow: hidden; }
.dm-meter-fill { display: block; height: 100%; background: var(--mj-brand-primary); transition: width var(--mjf-ease); }
.dm-meter-fill.is-full { background: var(--mj-status-warning-text); }
.dm-count { font-size: var(--mjf-meta); color: var(--mj-text-secondary); font-variant-numeric: tabular-nums; }

/* Deletion sits last, quiet, and below a rule — reachable, never in the path of anything
   routine. */
.dm-danger { display: flex; align-items: center; gap: var(--mjf-gap); flex-wrap: wrap; padding: var(--mjf-card-pad-sm) 0; border-top: 1px solid var(--mj-border-subtle); }

/* Below this the two panes stop being two panes: the rail becomes a strip above the
   content rather than a 264px column squeezing it. */
@media (max-width: 860px) {
  .dm-shell { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); }
  .dm-rail { border-right: none; border-bottom: 1px solid var(--mjf-rule); overflow-y: visible; }
  .dm-main { padding: var(--mjf-stack) var(--mjf-gap); }
  .dm-copy { width: 100%; }
}
`;
