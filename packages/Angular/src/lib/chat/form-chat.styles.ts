/**
 * Chat styling. Every colour is an `--mj-*` design token — a hardcoded one here breaks dark mode,
 * and this surface sits on three different backgrounds.
 *
 * ── THE DISPLAY RULE IS LOad-BEARING, AND GETTING IT WRONG BREAKS EVERYTHING. ────────────────
 * `display` is set ONLY under `:popover-open`. The UA stylesheet hides a closed popover with
 * `[popover]:not(:popover-open) { display: none }`, and Angular's emulated encapsulation appends
 * an attribute to every selector here — so a plain `.fc-panel { display: flex }` outranks the UA
 * rule and the panel renders, always, unpositioned, wherever it happens to sit in the document.
 * That is exactly what shipped in the first cut of this file: a permanently visible panel hanging
 * below the pill, which is what "it opens the wrong way" looked like.
 *
 * ── ONE ACCENT, SPENT ON THE MARK. ───────────────────────────────────────────────────────────
 * The sparkle mark is the only saturated thing here, and it recurs at three sizes: in the pill, in
 * the header, and beside every reply. Everything else is greyscale chrome. That is what makes the
 * panel read as one object rather than as a stack of boxes, and it means the assistant's voice is
 * identifiable in a long thread without a label on every turn.
 *
 * ── REPLIES ARE PROSE, NOT BUBBLES. ──────────────────────────────────────────────────────────
 * The assistant writes markdown — bold colour values, bulleted options, several sentences. Boxing
 * that gives you a narrow column inside a narrow column. Only the author's own short messages are
 * bubbled, which is also what makes the two voices distinguishable at a glance.
 */
export const FORM_CHAT_STYLES = /* css */ `
:host {
  display: block;
  width: 100%;

  /* Surfaces INSIDE the panel, derived from the panel's own two colours.

     Not '--mj-bg-surface-hover': in dark mode that token resolves to neutral-600 (#475569), a
     mid grey meant for a hover flash on a dark row. Used as a resting fill it made the composer
     a pale slab floating in a near-black panel — the single loudest thing on a surface whose
     whole design is one accent and quiet chrome. A mix off the panel's own ink sits a fixed
     distance from the background in BOTH themes, which is what a recessed field should do. */
  --fc-inset: color-mix(in srgb, var(--mj-text-primary) 6%, var(--mj-bg-surface));
  --fc-inset-strong: color-mix(in srgb, var(--mj-text-primary) 10%, var(--mj-bg-surface));
  --fc-mine: color-mix(in srgb, var(--mj-brand-primary) 20%, var(--mj-bg-surface));
  --fc-hairline: color-mix(in srgb, var(--mj-text-primary) 12%, transparent);
}

.fc { width: 100%; max-width: 720px; margin: 0 auto; }

/* --- the mark --------------------------------------------------------------------- */
.fc-mark {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: var(--mj-radius-md, 8px);
  font-size: 0.75rem;
  color: var(--mj-brand-primary);
  background: color-mix(in srgb, var(--mj-brand-primary) 12%, transparent);
}
.fc-mark--head { width: 24px; height: 24px; }
.fc-mark--turn { width: 22px; height: 22px; font-size: 0.6875rem; margin-top: 1px; }
.fc-mark--busy { animation: fc-shimmer 1.4s ease-in-out infinite; }
@keyframes fc-shimmer { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

/* --- the collapsed pill ----------------------------------------------------------- */
.fc-pill {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  /* 48px total: a comfortable touch target without becoming a slab on a laptop. */
  min-height: 48px;
  padding: 7px 8px 7px 10px;
  font: inherit;
  text-align: left;
  cursor: text;
  color: var(--mj-text-muted);
  background: var(--mj-bg-surface);
  border: 1px solid color-mix(in srgb, var(--mj-brand-primary) 30%, var(--mj-border-default));
  border-radius: var(--mj-radius-full, 999px);
  /* A ring rather than a drop shadow, so nothing shifts when the panel takes its place. */
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--mj-brand-primary) 9%, transparent);
  transition: box-shadow 140ms ease, border-color 140ms ease;
}
.fc-pill:hover { border-color: var(--mj-brand-primary); }
.fc-pill--drafting .fc-pill-text { color: var(--mj-text-primary); }
.fc-pill:focus-visible {
  outline: none;
  border-color: var(--mj-brand-primary);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--mj-brand-primary) 22%, transparent);
}
/* Hidden, not removed: the panel is positioned from this element's box, and the host's layout
   must not jump by the height of a pill every time the assistant is opened. */
.fc-pill--covered { visibility: hidden; }
.fc-pill-text {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 0.9375rem;
  color: var(--mj-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* One dot, one number: the exchange you left unfinished has somewhere to show while the panel
   is shut. It clears the instant the panel opens, because then you can see the reply itself. */
.fc-unread {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: var(--mj-radius-full, 999px);
  font-size: 0.6875rem;
  font-weight: 700;
  color: var(--mj-text-on-brand, var(--mj-bg-surface));
  background: var(--mj-brand-primary);
}

/* --- the panel -------------------------------------------------------------------- */
.fc-panel {
  /* The UA stylesheet centres a popover with inset:0 and margin:auto. Both are cleared so the
     positions written by positionPanel() are the only ones in play. NO 'display' here — see the
     file header; setting it would beat the UA's own hide rule and pin the panel open forever. */
  position: fixed;
  inset: auto;
  margin: 0;
  padding: 0;
  overflow: hidden;
  color: var(--mj-text-primary);
  background: var(--mj-bg-surface);
  border: 1px solid var(--mj-border-default);
  border-radius: 16px;
  box-shadow: var(--mj-shadow-dialog, 0 18px 44px -12px color-mix(in srgb, var(--mj-text-primary) 34%, transparent));
  transition: opacity 150ms ease, transform 150ms ease;
}
.fc-panel:popover-open {
  display: flex;
  flex-direction: column;
  opacity: 1;
  transform: translateY(0);
}
.fc-panel::backdrop { background: transparent; }
/* Rises out of the pill it replaced. @starting-style is what lets a popover animate in from
   display:none; browsers without it simply show the panel, which is a fine floor. */
@starting-style {
  .fc-panel:popover-open { opacity: 0; transform: translateY(8px); }
}
@media (prefers-reduced-motion: reduce) {
  .fc-panel { transition: none; }
  @starting-style { .fc-panel:popover-open { opacity: 1; transform: none; } }
}

/* --- header ----------------------------------------------------------------------- */
.fc-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 11px 10px 11px 14px;
  border-bottom: 1px solid var(--fc-hairline);
}
.fc-title {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--mj-text-primary);
}
.fc-badge {
  padding: 2px 7px;
  border-radius: var(--mj-radius-full, 999px);
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--mj-text-muted);
  background: color-mix(in srgb, var(--mj-text-primary) 8%, transparent);
}
.fc-icon-btn {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: var(--mj-radius-md, 8px);
  background: transparent;
  color: var(--mj-text-muted);
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}
.fc-icon-btn:hover { background: var(--fc-inset-strong); color: var(--mj-text-primary); }
.fc-icon-btn:focus-visible {
  outline: 2px solid var(--mj-brand-primary);
  outline-offset: 1px;
}

/* --- the thread ------------------------------------------------------------------- */
.fc-thread {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  /* The base gap is between an exchange's own two halves; a NEW question gets more air, so the
     thread reads as a stack of exchanges rather than an undifferentiated ladder of messages. */
  gap: 10px;
  padding: 18px 16px 20px;
  scroll-behavior: smooth;
}
/*
 * A conversation sits at the BOTTOM of a tall panel, against the composer — two messages stranded
 * at the top of a half-screen box with dead space beneath them is the shape of a bug.
 *
 * A zero-height spacer with 'margin-top: auto' rather than 'justify-content: flex-end', which in a
 * scrollable flex container clips the overflowing start in every engine that has not shipped safe
 * alignment: the first turns become unreachable, scroll or not. The auto margin absorbs free space
 * when there is some and resolves to nothing when the thread overflows, so long threads scroll
 * normally. It is applied only when there ARE turns, so it never competes with the empty state's
 * own auto margins for the same free space.
 */
.fc-thread--filled::before { content: ''; flex: 0 0 auto; margin-top: auto; }
@media (prefers-reduced-motion: reduce) {
  .fc-thread { scroll-behavior: auto; }
}

/* An empty state is an INVITATION, not content, so it is centred in both directions. Auto block
   margins do the vertical centring; the max-width stops the line from stretching across a 720px
   panel, which is what made it read as text abandoned in the corner of an empty box. */
.fc-blank {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  margin-block: auto;
  margin-inline: auto;
  max-width: 34rem;
  padding: 8px 0;
}
.fc-blank-line {
  margin: 0;
  font-size: 0.9375rem;
  line-height: 1.55;
  text-align: center;
  color: var(--mj-text-secondary);
}
/* A column, not a wrapped row: three openers read as a list of things you can say, and each one
   stays on one line instead of breaking mid-sentence in a 380px panel. */
.fc-chips { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.fc-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--mj-border-default);
  border-radius: var(--mj-radius-full, 999px);
  background: var(--mj-bg-surface);
  color: var(--mj-text-secondary);
  font: inherit;
  font-size: 0.8125rem;
  text-align: left;
  cursor: pointer;
  transition: border-color 120ms ease, color 120ms ease, background 120ms ease;
}
.fc-chip:hover {
  border-color: var(--mj-brand-primary);
  color: var(--mj-brand-primary);
  background: color-mix(in srgb, var(--mj-brand-primary) 6%, var(--mj-bg-surface));
}
.fc-chip:focus-visible { outline: 2px solid var(--mj-brand-primary); outline-offset: 1px; }
.fc-chip-arrow { font-size: 0.625rem; opacity: 0.55; }
@media (prefers-reduced-motion: reduce) {
  .fc-chip { transition: none; }
}

/* the author's own turns: compact, right, tinted with the brand so the two voices differ */
.fc-said { display: flex; justify-content: flex-end; }
.fc-said + .fc-reply { margin-top: 2px; }
.fc-reply + .fc-said { margin-top: 12px; }
.fc-bubble {
  max-width: 76%;
  padding: 10px 14px;
  border-radius: 14px 14px 4px 14px;
  font-size: 0.9375rem;
  line-height: 1.5;
  color: var(--mj-text-primary);
  background: var(--fc-mine);
  overflow-wrap: anywhere;
}

/* the assistant's turns: unboxed prose, marked rather than bubbled */
.fc-reply { display: flex; gap: 9px; align-items: flex-start; }
.fc-prose {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 0.9375rem;
  line-height: 1.55;
  overflow-wrap: anywhere;
}
.fc-reply--failed .fc-mark { color: var(--mj-status-error, var(--mj-color-error-600)); background: color-mix(in srgb, var(--mj-status-error, var(--mj-color-error-600)) 12%, transparent); }
.fc-reply--failed .fc-prose { color: var(--mj-status-error, var(--mj-color-error-600)); }
.fc-p { margin: 0 0 7px; }
.fc-p:last-child { margin-bottom: 0; }
.fc-ul { margin: 0 0 7px; padding-left: 1.15rem; }
.fc-ul:last-child { margin-bottom: 0; }
.fc-ul li { margin-bottom: 3px; }
.fc-prose code {
  font-family: var(--mj-font-mono, ui-monospace, monospace);
  font-size: 0.875em;
  padding: 1px 5px;
  border-radius: var(--mj-radius-sm, 4px);
  background: color-mix(in srgb, var(--mj-text-primary) 8%, transparent);
}

/* --- working --------------------------------------------------------------------- */
.fc-working { display: flex; flex-direction: column; gap: 7px; min-width: 0; flex: 1 1 auto; padding-top: 2px; }
.fc-working-line { font-size: 0.875rem; color: var(--mj-text-secondary); }
/* A bar, not just dots, once the server says how far along it is. A build runs the better part
   of a minute; a length that visibly grows is the difference between waiting and giving up. */
.fc-meter {
  display: block;
  height: 4px;
  border-radius: var(--mj-radius-full, 999px);
  background: var(--fc-inset-strong);
  overflow: hidden;
}
.fc-meter-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--mj-brand-primary);
  transition: width 320ms ease;
}
@media (prefers-reduced-motion: reduce) {
  .fc-meter-fill { transition: none; }
}

.fc-dots { display: flex; gap: 5px; align-items: center; height: 10px; }
.fc-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--mj-text-muted);
  animation: fc-pulse 1.2s ease-in-out infinite;
}
.fc-dot:nth-child(2) { animation-delay: 0.15s; }
.fc-dot:nth-child(3) { animation-delay: 0.3s; }
@keyframes fc-pulse { 0%, 60%, 100% { opacity: 0.3; } 30% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .fc-dot, .fc-mark--busy { animation: none; opacity: 0.6; }
}

/* --- the composer ----------------------------------------------------------------- */
.fc-composer {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 14px 14px;
  padding: 5px 5px 5px 16px;
  background: var(--fc-inset);
  border: 1px solid var(--fc-hairline);
  border-radius: var(--mj-radius-full, 999px);
  transition: border-color 120ms ease, box-shadow 120ms ease;
}
.fc-composer:focus-within {
  border-color: var(--mj-brand-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--mj-brand-primary) 14%, transparent);
}
@media (prefers-reduced-motion: reduce) {
  .fc-composer { transition: none; }
}

.fc-input {
  flex: 1 1 auto;
  min-width: 0;
  border: none;
  background: transparent;
  font: inherit;
  /* 16px exactly: iOS Safari zooms the page for anything smaller the moment it gets focus. */
  font-size: 1rem;
  color: var(--mj-text-primary);
  padding: 7px 0;
}
.fc-input::placeholder { color: var(--mj-text-muted); }
.fc-input:focus { outline: none; }
.fc-input:disabled { cursor: progress; }

.fc-go {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 1px solid var(--mj-border-default);
  border-radius: var(--mj-radius-full, 999px);
  background: var(--mj-bg-surface);
  color: var(--mj-text-muted);
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
}
.fc-go--ghost { border-color: transparent; background: transparent; }
.fc-go:hover:not(:disabled) { color: var(--mj-brand-primary); border-color: var(--mj-brand-primary); }
.fc-go--solid:not(:disabled) {
  border-color: var(--mj-brand-primary);
  background: var(--mj-brand-primary);
  color: var(--mj-text-on-brand, var(--mj-bg-surface));
}
.fc-go--solid:hover:not(:disabled) {
  background: color-mix(in srgb, var(--mj-brand-primary) 84%, var(--mj-text-primary));
}
.fc-go:focus-visible { outline: 2px solid var(--mj-brand-primary); outline-offset: 2px; }
.fc-go:disabled { opacity: 0.4; cursor: default; }
@media (prefers-reduced-motion: reduce) {
  .fc-go { transition: none; }
}

/* --- phones ----------------------------------------------------------------------- */
/* A panel becomes a sheet: full width, square across the bottom, and every target grown to a
   thumb. positionPanel() already keeps it clear of the on-screen keyboard via visualViewport. */
@media (max-width: 640px) {
  .fc-panel { border-radius: 16px; }
  .fc-thread { padding: 14px 12px 16px; }
  .fc-bubble { max-width: 88%; }
  .fc-chip { padding: 10px 14px; font-size: 0.875rem; }
  .fc-go, .fc-icon-btn { width: 40px; height: 40px; }
  .fc-composer { margin: 0 10px 10px; padding: 4px 4px 4px 14px; }
}
`;
