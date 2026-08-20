import { FORMS_UI_CSS, FORMS_VIZ_CSS } from '../shared';

/**
 * The builder shell: header, tab strip, and the three-pane Build workspace.
 *
 * Controls (buttons, fields, badges, the switch) come from `FORMS_UI_CSS`. This file
 * used to carry its own copy of all of them — that is why the builder and the home
 * list drifted into two visual languages, and why they are now one.
 */
const LAYOUT_CSS = /* css */ `
:host { display: block; height: 100%; color: var(--mj-text-primary); font-family: var(--mj-font-family, inherit); }
.fb { display: flex; flex-direction: column; height: 100%; min-height: 480px; background: var(--mj-bg-page); }

/* ------------------------------------------------------------------- topbar */

.fb-failure {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--mjf-gap-sm);
  padding: 10px var(--mjf-gutter);
  font-size: var(--mjf-meta);
  color: var(--mj-status-error-text);
  background: var(--mj-status-error-bg);
  border-bottom: 1px solid var(--mj-status-error-border);
}
.fb-failure-text { flex: 1 1 auto; min-width: 0; }
.fb-failure-close {
  flex: none;
  padding: 4px 8px;
  cursor: pointer;
  color: inherit;
  background: none;
  border: none;
  border-radius: var(--mjf-radius-sm);
}
.fb-failure-close:hover { background: var(--mj-bg-surface-hover); }
.fb-failure-close:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: 1px; }

.fb-top {
  flex: none;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--mjf-gap-sm);
  padding: 14px var(--mjf-gutter);
  border-bottom: 1px solid var(--mjf-rule);
  background: var(--mj-bg-surface);
}

/* The form name edits in place. Chromeless until you reach for it — the title of the
   page you are on should not look like a text box. */
.fb-name {
  flex: 1 1 220px;
  min-width: 180px;
  font: inherit;
  font-size: 1.125rem;
  font-weight: 600;
  letter-spacing: var(--mj-tracking-tight, -0.01em);
  color: var(--mj-text-primary);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--mjf-radius-sm);
  padding: 6px 10px;
  margin-left: -10px;
  transition: background var(--mjf-ease), border-color var(--mjf-ease);
}
.fb-name:hover { background: var(--mj-bg-surface-hover); }
.fb-name:focus { outline: none; background: var(--mj-bg-surface); border-color: var(--mj-brand-primary); box-shadow: 0 0 0 3px var(--mj-brand-accent-subtle, transparent); }

.fb-status { font-size: var(--mjf-meta); color: var(--mj-text-secondary); }

/* The "nothing to publish" state. Quiet on purpose: it is a status, not an action, so it
   reads as text with a check rather than as a button you have failed to press. Success
   tone at low saturation — the point is reassurance, not celebration. */
.fb-published {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: var(--mjf-tap);
  padding: 0 14px;
  font-size: var(--mjf-meta);
  font-weight: 600;
  white-space: nowrap;
  border-radius: var(--mjf-radius-sm);
  color: var(--mj-status-success-text);
  background: var(--mj-status-success-bg);
  border: 1px solid var(--mj-status-success-border);
}
.fb-published i { font-size: 0.875rem; }

/* The publish action itself carries no extra ring: it only appears when there is
   genuinely something to publish, so its presence is the signal. */
.fb-publish { min-width: 140px; }

/* ---------------------------------------------------------------------- tabs */

/* flex:none here is load-bearing, not cosmetic. .fb is a fixed-height flex column, so
   any child that omits it is a shrink candidate. The tab strip has no intrinsic content
   height to defend itself with, so when a tall pane (Responses, Automate) followed it,
   the strip was crushed to 1px and the user lost every route back out of the tab. */
.fb-tabs {
  flex: none;
  display: flex;
  gap: var(--mjf-stack);
  padding: 0 var(--mjf-gutter);
  border-bottom: 1px solid var(--mjf-rule);
  background: var(--mj-bg-surface);
  overflow-x: auto;
  scrollbar-width: none;
}
.fb-tabs::-webkit-scrollbar { display: none; }
.fb-tab {
  flex: 0 0 auto;  /* five tabs exceed a 360px viewport; the strip scrolls rather than the page */
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0;
  margin-bottom: -1px;
  font: inherit;
  font-size: var(--mjf-body);
  font-weight: 500;
  cursor: pointer;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--mj-text-secondary);
  transition: color var(--mjf-ease), border-color var(--mjf-ease);
}
/* The icon rides the tab's own colour, so it is muted when inactive and brand-coloured
   when selected — one rule, correct in both themes, no per-icon colour to maintain. */
.fb-tab i { font-size: 0.8125rem; opacity: 0.75; }
.fb-tab.is-on i { opacity: 1; color: var(--mj-brand-primary); }
.fb-tab:hover { color: var(--mj-text-primary); }
.fb-tab:hover i { opacity: 1; }
.fb-tab.is-on { color: var(--mj-text-primary); font-weight: 600; border-bottom-color: var(--mj-brand-primary); }
.fb-tab:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: 2px; border-radius: var(--mjf-radius-sm); }

/* Panes that are direct flex children of .fb. The grid-based Build pane declares its
   own sizing below; these two are whole components, so they get it from the host. */
.fb-pane-host { flex: 1 1 auto; min-height: 0; overflow-y: auto; }

/* ----------------------------------------------------------------- build body */

.fb-body { flex: 1; display: grid; grid-template-columns: 244px minmax(0, 1fr) 340px; min-height: 0; overflow: hidden; }
.fb-pane { overflow-y: auto; padding: var(--mjf-stack); }
.fb-pane--left { border-right: 1px solid var(--mjf-rule); background: var(--mj-bg-surface); }
.fb-pane--center { background: var(--mj-bg-page); padding: var(--mjf-stack) var(--mjf-gutter) 96px; }
.fb-pane--right { border-left: 1px solid var(--mjf-rule); background: var(--mj-bg-surface); }

/* ------------------------------------------------------------------- palette */

/* Palette tools — search + import, pinned above the groups. At 25 types across seven groups,
   scanning is slower than typing, and an author who knows what they want should not have to
   know which heading we filed it under. */
.fb-palette-tools {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: var(--mjf-stack);
}

.fb-palette-search { position: relative; display: flex; align-items: center; }
.fb-palette-search i {
  position: absolute;
  left: 10px;
  font-size: var(--mjf-label);
  color: var(--mj-text-muted);
  pointer-events: none;
}
.fb-palette-search .mjf-input { padding-left: 30px; }

.fb-palette-import {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  cursor: pointer;
  font: inherit;
  font-size: var(--mjf-meta);
  color: var(--mj-text-secondary);
  background: transparent;
  border: 1px dashed var(--mj-border-default);
  border-radius: var(--mjf-radius-sm);
  transition: background var(--mjf-ease), border-color var(--mjf-ease);
}
.fb-palette-import:hover:not(:disabled) { border-color: var(--mj-brand-primary); background: var(--mj-bg-surface-hover); }
.fb-palette-import:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: -2px; }
.fb-palette-import:disabled { opacity: 0.45; cursor: not-allowed; }
.fb-palette-import i { width: 16px; text-align: center; color: var(--mj-text-muted); }

/* ---- Screens on the canvas ----
   Rendered as a distinct card rather than as another question row, because that visual
   difference IS the model: a screen is not question zero, and an author should be able to see
   that without being told. */
.fb-screen {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  margin-bottom: 8px;
  cursor: pointer;
  border: 1px solid var(--mj-border-default);
  border-left: 3px solid var(--mj-brand-primary);
  border-radius: var(--mjf-radius-sm);
  background: var(--mjf-tile-bg, var(--mj-bg-surface));
  transition: border-color var(--mjf-ease), background var(--mjf-ease);
}
.fb-screen:hover { background: var(--mj-bg-surface-hover); }
.fb-screen:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: 2px; }
.fb-screen.is-selected { border-color: var(--mj-brand-primary); background: var(--mj-bg-surface-hover); }

/* The form's two bookends, and they no longer share a colour.

   Both were brand-primary, so the door you come in by and the finish line you leave by were
   the same blue — the two ends of the journey rendered identically, which is the one
   distinction this strip exists to draw. The template picks the hue per screen:

     Welcome  amber (mjf-viz-4)  — warmth and invitation, the open door
     Ending   green (mjf-viz-2)  — completion; "Thanks for your response" IS the success state

   Read down the canvas it now says: warm start, coloured questions, green finish.

   These two hues are also carried by the Scale and Choice question groups, and that overlap
   is deliberate rather than overlooked. Only one palette entry was unspent and two were
   needed, and inventing colours outside the palette would break the single-source rule that
   makes the rest of this coherent. The reuse is safe because the roles never collide
   visually: a screen wears its hue as a round plate at the edge of a full-width bar, a
   question type wears it as a pill inside a card. Nothing shows both idioms at once.

   A bare glyph, like everywhere else. The round tinted plate this replaced was the last
   filled icon container left in the builder, and it made the two screen rows heavier than
   the questions between them — reading as headers rather than as the bookends of the same
   list. What separates a screen from a question is already doing its job without it: the
   full-width bar, the eyebrow label, and now the hue. The width is kept only so the titles
   beside it line up with the question prompts. */
.fb-screen-icon {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  font-size: 1rem;
  color: var(--mjf-viz-fill);
}

.fb-screen-main { flex: 1; min-width: 0; }
.fb-screen-kind {
  font-size: var(--mjf-label);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--mj-text-muted);
}
.fb-screen-title {
  font-size: var(--mjf-meta);
  color: var(--mj-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fb-screen-add {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 12px 16px;
  margin-bottom: 8px;
  cursor: pointer;
  font: inherit;
  font-size: var(--mjf-meta);
  color: var(--mj-text-muted);
  background: transparent;
  border: 1px dashed var(--mj-border-default);
  border-radius: var(--mjf-radius-sm);
  transition: border-color var(--mjf-ease), color var(--mjf-ease);
}
.fb-screen-add:hover:not(:disabled) { border-color: var(--mj-brand-primary); color: var(--mj-text-secondary); }
.fb-screen-add:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: 2px; }
.fb-screen-add:disabled { opacity: 0.45; cursor: not-allowed; }

.fb-page-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: var(--mjf-stack) 0 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--mjf-rule);
}
.fb-page-num {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  font-size: var(--mjf-label);
  font-weight: 700;
  color: var(--mj-text-secondary);
  background: var(--mj-bg-surface-sunken);
  border-radius: 50%;
}
.fb-page-title {
  flex: 1;
  min-width: 0;
  padding: 4px 6px;
  font: inherit;
  font-size: var(--mjf-meta);
  font-weight: 600;
  color: var(--mj-text-primary);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--mjf-radius-sm);
}
.fb-page-title:hover { border-color: var(--mj-border-subtle); }
.fb-page-title:focus { outline: none; border-color: var(--mj-brand-primary); background: var(--mj-bg-surface); }

.fb-page-flag { flex: none; display: flex; align-items: center; gap: 8px; cursor: pointer; }
.fb-page-flag span { font-size: var(--mjf-label); color: var(--mj-text-muted); }

/* Sub-heading to the title above it, and quieter, so a section reads as one thing rather than
   two fields. Borrows the title's invisible-until-touched treatment: an optional field that
   draws a box before anyone wants it turns an empty form into a grid of empty boxes. */
.fb-page-desc {
  display: block;
  width: 100%;
  margin: 0 0 10px 32px;
  padding: 4px 6px;
  font: inherit;
  font-size: var(--mjf-label);
  color: var(--mj-text-secondary);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--mjf-radius-sm);
  box-sizing: border-box;
}
.fb-page-desc:hover { border-color: var(--mj-border-subtle); }
.fb-page-desc:focus { outline: none; border-color: var(--mj-brand-primary); background: var(--mj-bg-surface); }
.fb-page-desc::placeholder { color: var(--mj-text-muted); }

.fb-endings { margin-top: var(--mjf-stack); padding-top: var(--mjf-stack); border-top: 1px solid var(--mjf-rule); }

/* An ending no respondent can reach is an authoring mistake, not a variant, so it is marked
   rather than merely labelled. */
.fb-screen-warn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--mj-status-warning, var(--mj-status-error));
}
.fb-endings-title {
  margin: 0 0 8px;
  font-size: var(--mjf-label);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--mj-text-muted);
}

.fb-palette-group { margin-bottom: var(--mjf-stack); }
.fb-palette-title {
  margin: 0 0 var(--mjf-gap-sm);
  font-size: var(--mjf-label);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--mj-text-muted);
}
.fb-palette { display: flex; flex-direction: column; gap: 2px; }

/* Borderless. A vertical stack of ~14 bordered boxes reads as a wall; the icon column
   is what makes the list scannable, so the border was only adding weight. */
.fb-palette-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 36px;
  padding: 0 10px;
  text-align: left;
  font: inherit;
  font-size: var(--mjf-meta);
  font-weight: 500;
  cursor: pointer;
  color: var(--mj-text-primary);
  background: transparent;
  border: none;
  border-radius: var(--mjf-radius-sm);
  transition: background var(--mjf-ease), color var(--mjf-ease);
}
.fb-palette-item:hover:not(:disabled) { background: var(--mj-bg-surface-hover); }
.fb-palette-item:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: -2px; }
.fb-palette-item:disabled { opacity: 0.45; cursor: not-allowed; }
/* Geometry only — no colour. The glyph's colour is its GROUP's, set by the mjf-type-glyph
   class the template adds, and a color declaration here would out-specify that single class
   and mute every icon in the rail. The hover rule that recoloured icons to brand-primary is
   gone for the same reason: once the hue carries meaning, swapping it on hover throws the
   meaning away exactly when the user is pointing at it. */
.fb-palette-item i { flex: none; width: 16px; text-align: center; font-size: var(--mjf-meta); }

/* -------------------------------------------------------------------- canvas */

.fb-canvas { max-width: 760px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--mjf-stack); }
.fb-canvas-head { display: flex; flex-direction: column; gap: 6px; }
.fb-canvas-head h2 { margin: 0; font-size: 1.5rem; font-weight: 600; letter-spacing: var(--mj-tracking-tight, -0.01em); color: var(--mj-text-primary); }
.fb-canvas-head p { margin: 0; max-width: 60ch; font-size: var(--mjf-body); line-height: 1.55; color: var(--mj-text-secondary); }

.fb-q-list { display: flex; flex-direction: column; gap: 10px; }

/* One question. Previously this was ~120px tall for a one-line question, because the
   three actions were stacked in a fixed column down the right edge. They are a row
   now, revealed on hover, so the card is as tall as its content. */
.fb-q {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border-radius: var(--mjf-radius);
  border: 1px solid var(--mj-border-subtle);
  background: var(--mj-bg-surface);
  cursor: pointer;
  transition: border-color var(--mjf-ease), box-shadow var(--mjf-ease);
}
.fb-q:hover { border-color: var(--mj-border-strong); box-shadow: var(--mj-shadow-sm); }
.fb-q:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: 2px; }
.fb-q.is-selected { border-color: var(--mj-brand-primary); box-shadow: 0 0 0 1px var(--mj-brand-primary); }

/* Drag handle — pointer/touch reorder (arrows remain the keyboard fallback). */
.fb-q-handle {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 28px;
  cursor: grab;
  border: none;
  background: transparent;
  color: var(--mj-text-disabled);
  border-radius: var(--mjf-radius-sm);
  touch-action: none;
  transition: color var(--mjf-ease), background var(--mjf-ease);
}
.fb-q:hover .fb-q-handle:not(:disabled) { color: var(--mj-text-secondary); }
.fb-q-handle:hover:not(:disabled) { background: var(--mj-bg-surface-hover); color: var(--mj-text-primary); }
.fb-q-handle:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: 1px; }
.fb-q-handle:disabled { opacity: 0.35; cursor: not-allowed; }
.fb-q-handle:active { cursor: grabbing; }

/* CDK drag-drop visual states — token-only so dark mode stays intact. */
.fb-q-list.cdk-drop-list-dragging .fb-q:not(.cdk-drag-placeholder) { transition: transform var(--mjf-ease); }
.cdk-drag-preview.fb-q { box-shadow: var(--mj-shadow-lg); border-color: var(--mj-brand-primary); }
.fb-q-drag-preview {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: var(--mjf-radius);
  border: 1px solid var(--mj-brand-primary);
  background: var(--mj-bg-surface);
  color: var(--mj-text-primary);
  box-shadow: var(--mj-shadow-lg);
}
.cdk-drag-placeholder { opacity: 0.4; border-style: dashed !important; border-color: var(--mj-brand-primary) !important; background: var(--mj-bg-surface-sunken) !important; }
.cdk-drag-animating { transition: transform var(--mjf-ease); }

/* The number sits in its own gutter so every question label starts on the same
   vertical line, however many digits the index has. */
.fb-q-num {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  margin-top: 2px;
  font-size: var(--mjf-label);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  border-radius: var(--mjf-radius-sm);
  color: var(--mj-text-muted);
  background: var(--mj-bg-surface-sunken);
}
.fb-q.is-selected .fb-q-num { color: var(--mj-brand-primary); background: color-mix(in srgb, var(--mj-brand-primary) 12%, var(--mj-bg-surface)); }

.fb-q-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; padding-right: 8px; }
.fb-q-label { font-size: var(--mjf-body); font-weight: 600; color: var(--mj-text-primary); word-break: break-word; }
.fb-q-help { font-size: var(--mjf-meta); color: var(--mj-text-muted); word-break: break-word; }
.fb-q-tags { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-top: 2px; }
.fb-q-tags .mjf-badge { padding: 1px 8px; font-size: 0.6875rem; }

/* Actions live in the card's top-right corner and appear on hover. They stay visible
   whenever focus is inside the card, so the keyboard path never depends on hover. */
.fb-q-side {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border-radius: var(--mjf-radius-sm);
  background: var(--mj-bg-surface);
  box-shadow: var(--mj-shadow-sm);
}

/* Row controls that stay out of the way until the row is engaged.

   One definition rather than one per card type: a screen card wore the same delete button as a
   question card but sat outside this rule, so its trash icon was on permanently while every
   question's hid — the canvas looked like the screens were the only things you could destroy.

   All three parts are load-bearing. Fading rather than un-displaying keeps the button in the tab
   order, which is what lets the focus-within rule bring it back for a keyboard user. And a touch
   device has no hover at all, so without the last rule the control would be unreachable on a
   phone — the builder is not mobile-first, but "invisible forever" is not a trade-off worth
   making by accident. */
.fb-reveal {
  opacity: 0;
  transition: opacity var(--mjf-ease);
}
.fb-q:hover .fb-reveal,
.fb-q:focus-within .fb-reveal,
.fb-screen:hover .fb-reveal,
.fb-screen:focus-within .fb-reveal,
.fb-page-head:hover .fb-reveal,
.fb-page-head:focus-within .fb-reveal { opacity: 1; }
@media (hover: none) { .fb-reveal { opacity: 1; } }

.fb-q-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  font-size: var(--mjf-meta);
  cursor: pointer;
  border-radius: var(--mjf-radius-sm);
  border: none;
  background: transparent;
  color: var(--mj-text-muted);
  transition: background var(--mjf-ease), color var(--mjf-ease);
}
.fb-q-btn:hover:not(:disabled) { background: var(--mj-bg-surface-hover); color: var(--mj-text-primary); }
.fb-q-btn:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: -1px; }
.fb-q-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.fb-q-btn--danger:hover:not(:disabled) { background: var(--mj-status-error-bg); color: var(--mj-status-error-text); }

.fb-canvas-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--mjf-gap-sm);
  padding: 56px var(--mjf-card-pad);
  text-align: center;
  color: var(--mj-text-secondary);
  border: 1px dashed var(--mj-border-default);
  border-radius: var(--mjf-radius);
}
.fb-canvas-empty i { font-size: 1.5rem; color: var(--mj-text-disabled); }
.fb-canvas-empty p { margin: 0; font-size: var(--mjf-meta); }

/* ------------------------------------------------------- non-Build tab panes */

/* Full-bleed, like the Build pane and unlike the other centred ones. This tab is two-pane,
   and a centred max-width box pushed BOTH panes into the middle of the screen — a rail
   floating in open space with a wall of empty page either side of it. The rail belongs
   against the edge, the way every rail in this builder sits; the padding and the readable
   measure move inside, onto the content that actually needs them. */
.fb-distribute { flex: 1; min-height: 0; overflow: hidden; }
.fb-distribute mjf-distribution-manager { display: block; height: 100%; }
.fb-design { flex: 1; min-height: 0; padding: var(--mjf-stack) var(--mjf-gutter); overflow: hidden; }
.fb-design mjf-design-panel { display: block; height: 100%; }

/* --------------------------------------------------------------- small screens */

@media (max-width: 1100px) {
  .fb-body { grid-template-columns: 220px minmax(0, 1fr); }
  /* The properties panel becomes a full-width strip under the canvas rather than a
     340px column squeezing the canvas to nothing. */
  .fb-pane--right { grid-column: 1 / -1; border-left: none; border-top: 1px solid var(--mjf-rule); }
}

@media (max-width: 900px) {
  .fb-top { padding: 12px var(--mjf-gutter); }
  .fb-tabs { padding: 0 var(--mjf-gutter); gap: var(--mjf-gap); }
  .fb-body { grid-template-columns: 1fr; grid-auto-rows: min-content; overflow-y: auto; }
  /* Stacked, the canvas leads. Source order puts the ~14-item palette first, which on a
     phone means a full screen of controls before you can see the form you opened. */
  .fb-pane--center { order: 1; }
  .fb-pane--left { order: 2; }
  .fb-pane--right { order: 3; }
  .fb-pane { padding: var(--mjf-gap) var(--mjf-gutter); }
  .fb-pane--center { padding-bottom: 48px; }
  .fb-pane--left, .fb-pane--right { border: none; border-top: 1px solid var(--mjf-rule); }
  .fb-palette { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 4px; }
  .fb-q-side { position: static; opacity: 1; box-shadow: none; background: transparent; }
}
`;

/** Combined styles for the form builder shell (shared design layer + layout). */
// FORMS_VIZ_CSS carries the question-type palette: the group colours the rail's glyphs and
// the canvas type pills read from. Included here rather than in the components because both
// of those live in this component's template.
export const FORM_BUILDER_STYLES = `${FORMS_UI_CSS}\n${FORMS_VIZ_CSS}\n${LAYOUT_CSS}`;
