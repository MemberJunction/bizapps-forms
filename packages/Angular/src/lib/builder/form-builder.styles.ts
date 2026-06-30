import { BUILDER_CONTROL_STYLES } from './builder-styles';

const LAYOUT_CSS = /* css */ `
:host { display: block; height: 100%; color: var(--mj-text-primary); font-family: var(--mj-font-family, inherit); }
.fb { display: flex; flex-direction: column; height: 100%; min-height: 480px; background: var(--mj-bg-page); }

/* Topbar */
.fb-top { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--mj-border-default); background: var(--mj-bg-surface); flex-wrap: wrap; }
.fb-name { font: inherit; font-size: 1.05rem; font-weight: 700; color: var(--mj-text-primary); background: transparent; border: 1px solid transparent; border-radius: var(--mj-radius-md, 8px); padding: 6px 8px; min-width: 200px; flex: 1 1 200px; }
.fb-name:hover { border-color: var(--mj-border-subtle); }
.fb-name:focus { outline: 2px solid var(--mjf-focus-ring, var(--mj-brand-primary)); border-color: var(--mj-brand-primary); }
.fb-spacer { flex: 1; }
.fb-status { font-size: 0.8125rem; color: var(--mj-text-secondary); }

/* Segmented control */
.fb-seg { display: inline-flex; border: 1px solid var(--mj-border-default); border-radius: var(--mj-radius-full, 999px); overflow: hidden; }
.fb-seg button { font: inherit; font-size: 0.8125rem; font-weight: 600; padding: 6px 14px; cursor: pointer; border: none; background: var(--mj-bg-surface); color: var(--mj-text-secondary); }
.fb-seg button.is-on { background: var(--mj-brand-primary); color: var(--mj-brand-on-primary, var(--mj-text-inverse)); }

/* Tabs */
.fb-tabs { display: flex; gap: 4px; padding: 0 16px; border-bottom: 1px solid var(--mj-border-default); background: var(--mj-bg-surface); }
.fb-tab { font: inherit; font-weight: 600; font-size: 0.875rem; padding: 10px 14px; cursor: pointer; border: none; background: transparent; color: var(--mj-text-secondary); border-bottom: 2px solid transparent; }
.fb-tab.is-on { color: var(--mj-brand-primary); border-bottom-color: var(--mj-brand-primary); }

/* Body grid */
.fb-body { flex: 1; display: grid; grid-template-columns: 220px 1fr 320px; min-height: 0; overflow: hidden; }
.fb-pane { overflow-y: auto; padding: 16px; }
.fb-pane--left { border-right: 1px solid var(--mj-border-default); background: var(--mj-bg-surface); }
.fb-pane--center { background: var(--mj-bg-page); }
.fb-pane--right { border-left: 1px solid var(--mj-border-default); background: var(--mj-bg-surface); }

/* Palette */
.fb-palette-group { margin-bottom: 16px; }
.fb-palette-title { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--mj-text-muted); margin: 0 0 8px; }
.fb-palette { display: flex; flex-direction: column; gap: 6px; }
.fb-palette-item { display: flex; align-items: center; gap: 9px; width: 100%; text-align: left; font: inherit; font-size: 0.875rem; padding: 8px 10px; cursor: pointer; border-radius: var(--mj-radius-md, 8px); border: 1px solid var(--mj-border-subtle); background: var(--mj-bg-surface-card, var(--mj-bg-surface)); color: var(--mj-text-primary); }
.fb-palette-item:hover { background: var(--mj-bg-surface-hover); border-color: var(--mj-border-default); }
.fb-palette-item i { width: 18px; text-align: center; color: var(--mj-text-secondary); }

/* Canvas */
.fb-canvas { max-width: 720px; margin: 0 auto; display: flex; flex-direction: column; gap: 12px; }
.fb-canvas-head h2 { margin: 0 0 4px; font-size: 1.25rem; color: var(--mj-text-primary); }
.fb-canvas-head p { margin: 0; color: var(--mj-text-secondary); font-size: 0.9rem; }
.fb-q { display: flex; gap: 12px; padding: 14px 16px; border-radius: var(--mj-radius-lg, 12px); border: 1px solid var(--mj-border-default); background: var(--mj-bg-surface-card, var(--mj-bg-surface)); cursor: pointer; }
.fb-q:hover { border-color: var(--mj-border-strong); }
.fb-q.is-selected { border-color: var(--mj-brand-primary); box-shadow: 0 0 0 1px var(--mj-brand-primary); }
.fb-q-main { flex: 1; min-width: 0; }
.fb-q-top { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.fb-q-num { font-size: 0.75rem; font-weight: 700; color: var(--mj-text-muted); }
.fb-q-label { font-weight: 600; color: var(--mj-text-primary); word-break: break-word; }
.fb-q-help { font-size: 0.8125rem; color: var(--mj-text-muted); margin-top: 3px; }
.fb-q-side { display: flex; flex-direction: column; gap: 6px; align-items: center; }
.fb-q-btn { width: 30px; height: 28px; cursor: pointer; border-radius: var(--mj-radius-sm, 6px); border: 1px solid var(--mj-border-subtle); background: var(--mj-bg-surface); color: var(--mj-text-muted); }
.fb-q-btn:hover { background: var(--mj-bg-surface-hover); color: var(--mj-text-primary); }
.fb-q-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.fb-canvas-empty { text-align: center; color: var(--mj-text-muted); padding: 40px 0; }

.fb-distribute { padding: 20px; max-width: 880px; margin: 0 auto; }

/* Mobile: stack the panes. */
@media (max-width: 900px) {
  .fb-body { grid-template-columns: 1fr; grid-auto-rows: min-content; overflow-y: auto; }
  .fb-pane--left, .fb-pane--right { border: none; border-top: 1px solid var(--mj-border-default); }
  .fb-palette { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); }
}
`;

/** Combined styles for the form builder shell (controls + layout). */
export const FORM_BUILDER_STYLES = `${BUILDER_CONTROL_STYLES}\n${LAYOUT_CSS}`;
