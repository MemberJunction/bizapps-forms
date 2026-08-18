/**
 * Styles unique to the reporting dashboard shell. Page scaffold, tabs, buttons,
 * badges, empty and alert states all come from `FORMS_UI_CSS`.
 */
export const FORMS_REPORTING_CSS = /* css */ `
:host {
  display: block;
  height: 100%;
  overflow: auto;
  background: var(--mj-bg-page);
  font-family: var(--mj-font-family);
}

.title-row { display: flex; align-items: center; gap: var(--mjf-gap-sm); flex-wrap: wrap; }

.form-picker { display: block; }
/* Wide enough for a real form name, capped so it never crowds the export buttons. */
.form-picker .mjf-select { min-width: 220px; max-width: 340px; }

.export-group { display: flex; gap: var(--mjf-gap-xs); }

.tab-body { min-height: 0; }

.breakdowns {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: var(--mjf-gap);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 720px) {
  .mjf-page-actions { width: 100%; }
  .form-picker { flex: 1 1 100%; }
  .form-picker .mjf-select { width: 100%; max-width: none; }
  .export-group { flex: 1 1 auto; }
  .export-group .mjf-btn { flex: 1 1 auto; }
}
`;
