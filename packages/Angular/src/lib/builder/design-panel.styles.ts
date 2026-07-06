/**
 * Design panel styles — plain-CSS string (the package builds with `ngc` only, no SCSS).
 *
 * The controls use `--mj-*` builder tokens. The PREVIEW surface (`.dp-preview-frame`
 * and its children) styles itself with `--mjf-*` form tokens that `applyStyleTokens`
 * sets on the host at runtime, each falling back to a `--mj-*` token — so the preview
 * re-themes exactly like the published widget and carries no hardcoded colors.
 */
export const DESIGN_PANEL_STYLES = /* css */ `
.dp { display: grid; grid-template-columns: minmax(280px, 360px) 1fr; gap: 20px; height: 100%; min-height: 0; }
.dp-controls { overflow-y: auto; padding-right: 4px; }
.dp-title { font-size: 0.95rem; font-weight: 700; color: var(--mj-text-primary); margin: 0 0 4px; }
.dp-hint { font-size: 0.8125rem; color: var(--mj-text-muted); margin: 0 0 12px; }
.dp-empty { font-size: 0.875rem; color: var(--mj-text-muted); padding: 16px 0; }

/* Style picker */
.dp-style-list { list-style: none; margin: 0 0 14px; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.dp-style { display: flex; flex-direction: column; gap: 4px; width: 100%; text-align: left; padding: 12px 14px; cursor: pointer; font: inherit; border-radius: var(--mj-radius-md, 8px); border: 1px solid var(--mj-border-default); background: var(--mj-bg-surface-card, var(--mj-bg-surface)); color: var(--mj-text-primary); }
.dp-style:hover:not(:disabled) { border-color: var(--mj-border-strong); background: var(--mj-bg-surface-hover); }
.dp-style.is-selected { border-color: var(--mj-brand-primary); box-shadow: 0 0 0 1px var(--mj-brand-primary); }
.dp-style:disabled { opacity: 0.5; cursor: not-allowed; }
.dp-style-name { font-weight: 700; }
.dp-style-desc { font-size: 0.75rem; color: var(--mj-text-muted); }

.dp-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
.dp-status { font-size: 0.8125rem; color: var(--mj-text-secondary); margin-top: 12px; }

/* Color inputs */
.dp-color-row { display: flex; gap: 8px; align-items: center; }
.dp-color { flex: none; width: 44px; height: 38px; padding: 2px; cursor: pointer; border-radius: var(--mj-radius-md, 8px); border: 1px solid var(--mj-border-default); background: var(--mj-bg-surface); }

/* ------- Live preview surface (form tokens; each falls back to a --mj-* token) ------- */
.dp-preview { min-width: 0; overflow-y: auto; border-radius: var(--mj-radius-lg, 12px); border: 1px solid var(--mj-border-default); }
.dp-preview-frame {
  min-height: 100%;
  padding: 28px 24px;
  font-family: var(--mjf-font-body, var(--mj-font-family, inherit));
  color: var(--mj-text-primary);
  background: var(--mjf-page-bg, var(--mj-bg-page));
  background-image: var(--mjf-page-bg-image, none);
}
.dp-prev-logo { max-height: 40px; max-width: 160px; margin-bottom: 16px; display: block; }
.dp-prev-eyebrow { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--mjf-eyebrow, var(--mjf-accent, var(--mj-brand-primary))); margin: 0 0 6px; }
.dp-prev-title { font-family: var(--mjf-font-display, var(--mj-font-family, inherit)); font-weight: var(--mjf-display-weight, 700); letter-spacing: var(--mjf-display-tracking, normal); font-size: 1.6rem; margin: 0 0 6px; color: var(--mj-text-primary); }
.dp-prev-sub { color: var(--mj-text-secondary); margin: 0 0 20px; font-size: 0.9rem; }
.dp-prev-card {
  padding: 18px 18px 20px;
  margin-bottom: 14px;
  border-radius: var(--mjf-card-radius, var(--mj-radius-lg, 12px));
  border: 1px solid var(--mjf-card-border, var(--mj-border-default));
  background: var(--mjf-card-bg, var(--mj-bg-surface));
  box-shadow: var(--mjf-card-shadow, none);
  backdrop-filter: var(--mjf-card-backdrop, none);
}
.dp-prev-q { font-weight: 600; margin: 0 0 12px; color: var(--mj-text-primary); }
.dp-prev-choices { display: flex; flex-wrap: wrap; gap: 8px; }
.dp-prev-choice {
  padding: 8px 14px; font-size: 0.85rem; font-weight: 600;
  border-radius: var(--mjf-choice-radius, var(--mj-radius-md, 8px));
  border: 1px solid var(--mjf-choice-border, var(--mj-border-default));
  background: var(--mjf-choice-bg, var(--mj-bg-surface));
  color: var(--mj-text-secondary);
}
.dp-prev-choice.is-on { border-color: var(--mjf-accent, var(--mj-brand-primary)); color: var(--mjf-on-accent, var(--mj-text-inverse)); background: var(--mjf-accent, var(--mj-brand-primary)); }
.dp-prev-input { height: 40px; border-radius: var(--mjf-input-radius, var(--mj-radius-md, 8px)); border: 1px solid var(--mjf-input-border, var(--mj-border-default)); background: var(--mjf-input-bg, var(--mj-bg-surface)); }
.dp-prev-btn {
  margin-top: 6px; padding: 11px 22px; font: inherit; font-weight: 700; cursor: pointer;
  border-radius: var(--mjf-btn-radius, var(--mj-radius-md, 8px)); border: none;
  color: var(--mjf-on-accent, var(--mj-brand-on-primary, var(--mj-text-inverse)));
  background: var(--mjf-accent-gradient, var(--mjf-accent, var(--mj-brand-primary)));
}

@media (max-width: 900px) {
  .dp { grid-template-columns: 1fr; overflow-y: auto; }
  .dp-preview { min-height: 360px; }
}
`;
