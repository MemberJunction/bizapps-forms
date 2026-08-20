/**
 * The template gallery: two sections of cards, and the one destructive control Forms has.
 *
 * Everything generic — cards, buttons, badges, empty states — comes from `FORMS_UI_CSS`.
 * What is here is what only the gallery needs.
 */
export const TEMPLATES_GALLERY_CSS = /* css */ `
.tg-section + .tg-section { margin-top: 28px; }

.tg-section-head {
  display: flex;
  align-items: baseline;
  gap: var(--mjf-gap-sm);
  margin-bottom: var(--mjf-gap-sm);
}
.tg-section-title {
  font-size: var(--mjf-label);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--mj-text-secondary);
}
.tg-section-note { font-size: var(--mjf-meta); color: var(--mj-text-muted); }

.tg-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(228px, 1fr));
  gap: var(--mjf-gap-sm);
}

/* The card is the click target for "use this one". The delete control inside it is a
   separate button, so the card itself is a <div role="button"> rather than a <button>:
   a button inside a button is invalid HTML and Safari drops the inner one. */
.tg-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: var(--mjf-card-pad-sm);
  text-align: left;
  cursor: pointer;
  background: var(--mj-bg-surface);
  border: 1px solid var(--mj-border-subtle);
  border-radius: var(--mjf-radius-sm);
  transition: border-color var(--mjf-ease), background var(--mjf-ease), transform var(--mjf-ease);
}
.tg-card:hover { border-color: var(--mj-border-strong); background: var(--mj-bg-surface-hover); }
.tg-card:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: 2px; }
.tg-card.is-busy { opacity: 0.55; pointer-events: none; }

.tg-card-top { display: flex; align-items: center; gap: var(--mjf-gap-sm); }
.tg-card-icon { flex: none; width: 20px; font-size: 1.0625rem; color: var(--mjf-viz-fill); }
.tg-card-name {
  flex: 1;
  min-width: 0;
  font-size: var(--mjf-meta);
  font-weight: 600;
  color: var(--mj-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tg-card-desc {
  font-size: var(--mjf-meta);
  color: var(--mj-text-muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.tg-card-meta { font-size: var(--mjf-label); color: var(--mj-text-disabled); }

/* "Built-in" says why there is no delete here. A disabled delete button would invite the
   click and then refuse it; a label answers the question instead of raising it. */
.tg-lock {
  font-size: var(--mjf-label);
  font-weight: 600;
  color: var(--mj-text-disabled);
  white-space: nowrap;
}

/* Progressive disclosure: destructive controls do not sit in the resting state of a card.
   Revealed on hover AND on keyboard focus-within, so it is reachable without a mouse — and
   always visible on touch, where there is no hover to reveal it with. */
.tg-delete {
  flex: none;
  opacity: 0;
  transition: opacity var(--mjf-ease);
}
.tg-card:hover .tg-delete,
.tg-card:focus-within .tg-delete { opacity: 1; }
.tg-delete:hover:not(:disabled) {
  background: var(--mj-status-error-bg);
  color: var(--mj-status-error-text);
}
.tg-delete:focus-visible { opacity: 1; outline-color: var(--mj-status-error); }

@media (hover: none) {
  .tg-delete { opacity: 1; }
}

/* --- Confirm dialog --- */

.tg-confirm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: color-mix(in srgb, var(--mj-text-primary) 60%, transparent);
  backdrop-filter: blur(2px);
}
.tg-confirm {
  width: min(460px, 100%);
  display: flex;
  flex-direction: column;
  gap: var(--mjf-gap);
  padding: var(--mjf-card-pad);
  background: var(--mj-bg-surface);
  border: 1px solid var(--mj-border-default);
  border-radius: var(--mjf-radius);
  box-shadow: 0 24px 60px -20px color-mix(in srgb, var(--mj-text-primary) 45%, transparent);
}
.tg-confirm-title { font-size: 1rem; font-weight: 700; color: var(--mj-text-primary); }
.tg-confirm-body { font-size: var(--mjf-meta); color: var(--mj-text-secondary); line-height: 1.5; }
.tg-confirm-actions { display: flex; gap: var(--mjf-gap-sm); }

@media (max-width: 600px) {
  .tg-grid { grid-template-columns: 1fr; }
  .tg-confirm-actions .mjf-btn { flex: 1 1 auto; }
}
`;
