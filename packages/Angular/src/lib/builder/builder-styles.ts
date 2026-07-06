/**
 * Shared builder CSS, authored as plain-CSS string constants so the package's
 * `ngc`-only build (no SCSS preprocessor) inlines them via `styles: [...]`.
 *
 * EVERY color/spacing value resolves to an MJ design token (`--mj-*`) so the builder
 * works in light + dark mode and never hardcodes a color (CLAUDE.md UI rule + CI
 * token gate). Forms-specific `--mjf-*` tokens are used only where a form-authoring
 * concept has no `--mj-*` equivalent, and each falls back to a `--mj-*` token.
 */

/** Form-control, button, pill, and switch primitives shared by all builder panels. */
export const BUILDER_CONTROL_STYLES = /* css */ `
:host {
  --mjf-builder-gap: 16px;
  --mjf-builder-radius: var(--mj-radius-md, 8px);
}
.mjf-input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  font: inherit;
  color: var(--mj-text-primary);
  background: var(--mj-bg-surface);
  border: 1px solid var(--mj-border-default);
  border-radius: var(--mjf-builder-radius);
  transition: border-color var(--mj-transition-base, 0.15s ease);
}
.mjf-input:focus {
  outline: 2px solid var(--mjf-focus-ring, var(--mj-brand-primary));
  outline-offset: 1px;
  border-color: var(--mj-brand-primary);
}
textarea.mjf-input { min-height: 64px; resize: vertical; }
.mjf-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: var(--mjf-builder-gap); }
.mjf-field-label { font-size: 0.8125rem; font-weight: 600; color: var(--mj-text-secondary); }
.mjf-field-hint { font-size: 0.75rem; color: var(--mj-text-muted); }
.mjf-row { display: flex; gap: 8px; align-items: center; }
.mjf-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 14px; font: inherit; font-weight: 600; cursor: pointer;
  border-radius: var(--mjf-btn-radius, var(--mjf-builder-radius));
  border: 1px solid transparent;
  transition: background var(--mj-transition-base, 0.15s ease), border-color var(--mj-transition-base, 0.15s ease);
}
.mjf-btn:focus-visible { outline: 2px solid var(--mjf-focus-ring, var(--mj-brand-primary)); outline-offset: 2px; }
.mjf-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.mjf-btn--primary { color: var(--mj-brand-on-primary, var(--mj-text-inverse)); background: var(--mj-brand-primary); }
.mjf-btn--primary:hover:not(:disabled) { background: var(--mj-brand-primary-hover, var(--mj-brand-primary)); }
.mjf-btn--ghost { color: var(--mj-text-secondary); background: transparent; border-color: var(--mj-border-default); }
.mjf-btn--ghost:hover:not(:disabled) { background: var(--mj-bg-surface-hover); }
.mjf-btn--danger { color: var(--mj-status-error, var(--mj-color-error-600)); background: transparent; border-color: var(--mj-border-default); }
.mjf-btn--danger:hover:not(:disabled) { background: var(--mj-bg-surface-hover); }
.mjf-pill {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 9px; font-size: 0.75rem; font-weight: 600;
  border-radius: var(--mjf-pill-radius, var(--mj-radius-full, 999px));
  color: var(--mj-text-secondary); background: var(--mj-bg-surface-sunken);
  border: 1px solid var(--mj-border-subtle);
}
.mjf-switch {
  position: relative; display: inline-block; width: 38px; height: 22px; flex: none; cursor: pointer;
  border-radius: var(--mj-radius-full, 999px); background: var(--mj-border-strong);
  transition: background var(--mj-transition-base, 0.15s ease);
  border: none; padding: 0;
}
.mjf-switch::after {
  content: ''; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px;
  border-radius: 50%; background: var(--mj-bg-surface);
  transition: transform var(--mj-transition-base, 0.15s ease);
}
.mjf-switch.is-on { background: var(--mj-brand-primary); }
.mjf-switch.is-on::after { transform: translateX(16px); }
.mjf-switch:focus-visible { outline: 2px solid var(--mjf-focus-ring, var(--mj-brand-primary)); outline-offset: 2px; }
`;
