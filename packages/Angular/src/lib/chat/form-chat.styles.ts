/**
 * Chat styling. Every colour is an `--mj-*` design token — a hardcoded one here breaks dark mode,
 * and this surface sits on three different backgrounds.
 *
 * The violet ring is the one deliberate departure from the rest of the builder's chrome: it marks
 * this as the AI surface, the way the reference design does. It is built from the brand token with
 * `color-mix` rather than a literal, so it follows a themed instance instead of fighting it.
 */
export const FORM_CHAT_STYLES = /* css */ `
:host { display: block; width: 100%; }

.fc {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
}

/* --- the thread ------------------------------------------------------------------ */
.fc-thread {
  display: flex;
  flex-direction: column;
  gap: 12px;
  /* Bounded rather than growing without limit: the box lives at the bottom of a page that already
     scrolls, and a thread that pushes the input off-screen makes the next message unreachable. */
  max-height: min(46vh, 460px);
  overflow-y: auto;
  padding: 4px 2px;
  scroll-behavior: smooth;
}
@media (prefers-reduced-motion: reduce) {
  .fc-thread { scroll-behavior: auto; }
}

.fc-empty {
  margin: 0;
  padding: 10px 2px;
  font-size: 0.875rem;
  color: var(--mj-text-muted);
}

.fc-turn {
  max-width: 88%;
  padding: 10px 14px;
  border-radius: var(--mj-radius-lg, 12px);
  font-size: 0.9375rem;
  line-height: 1.5;
  color: var(--mj-text-primary);
  background: color-mix(in srgb, var(--mj-brand-primary) 7%, var(--mj-bg-surface));
}
/* The author's own turns sit right and neutral, so the two voices are distinguishable without
   reading them — which is what makes a long thread skimmable. */
.fc-turn--mine {
  align-self: flex-end;
  background: var(--mj-bg-surface-hover, var(--mj-bg-surface));
}
.fc-turn--failed {
  background: color-mix(in srgb, var(--mj-status-error, var(--mj-color-error-600)) 10%, var(--mj-bg-surface));
}

.fc-p { margin: 0 0 6px; }
.fc-p:last-child { margin-bottom: 0; }
.fc-ul { margin: 0 0 6px; padding-left: 1.25rem; }
.fc-ul:last-child { margin-bottom: 0; }
.fc-turn code {
  font-family: var(--mj-font-mono, ui-monospace, monospace);
  font-size: 0.875em;
  padding: 1px 5px;
  border-radius: var(--mj-radius-sm, 4px);
  background: color-mix(in srgb, var(--mj-text-primary) 8%, transparent);
}

/* --- thinking --------------------------------------------------------------------- */
.fc-turn--thinking { display: flex; gap: 5px; align-items: center; width: fit-content; }
.fc-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--mj-text-muted);
  animation: fc-pulse 1.2s ease-in-out infinite;
}
.fc-dot:nth-child(2) { animation-delay: 0.15s; }
.fc-dot:nth-child(3) { animation-delay: 0.3s; }
@keyframes fc-pulse { 0%, 60%, 100% { opacity: 0.3; } 30% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .fc-dot { animation: none; opacity: 0.6; }
}

/* --- the input bar ---------------------------------------------------------------- */
.fc-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px 8px 14px;
  background: var(--mj-bg-surface);
  border: 1px solid color-mix(in srgb, var(--mj-brand-primary) 35%, var(--mj-border-default));
  border-radius: var(--mj-radius-full, 999px);
  /* The outer glow of the reference design, as a ring rather than a shadow so it does not shift
     layout when the box expands. */
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--mj-brand-primary) 10%, transparent);
  transition: border-radius 140ms ease, box-shadow 140ms ease;
}
/* Expanded, it squares off into a composer that reads as part of the thread above it. */
.fc-bar--open { border-radius: var(--mj-radius-lg, 12px); }
.fc-bar:focus-within {
  border-color: var(--mj-brand-primary);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--mj-brand-primary) 18%, transparent);
}
@media (prefers-reduced-motion: reduce) {
  .fc-bar { transition: none; }
}

.fc-icon {
  flex: none;
  color: var(--mj-text-muted);
  padding-right: 10px;
  border-right: 1px solid var(--mj-border-default);
}

.fc-input {
  flex: 1 1 auto;
  min-width: 0;
  border: none;
  background: transparent;
  font: inherit;
  font-size: 0.9375rem;
  color: var(--mj-text-primary);
  padding: 6px 0;
}
.fc-input::placeholder { color: var(--mj-text-muted); }
.fc-input:focus { outline: none; }
.fc-input:disabled { cursor: progress; }

.fc-send {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--mj-border-default);
  border-radius: var(--mj-radius-md, 8px);
  background: var(--mj-bg-surface);
  color: var(--mj-text-muted);
  cursor: pointer;
}
.fc-send:hover:not(:disabled) {
  color: var(--mj-brand-primary);
  border-color: var(--mj-brand-primary);
}
.fc-send:disabled { opacity: 0.45; cursor: default; }
`;
