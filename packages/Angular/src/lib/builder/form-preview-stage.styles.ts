/**
 * Preview-stage styles — plain-CSS string (the package builds with `ngc` only, no SCSS).
 *
 * Kept out of the component file so `form-preview-stage.spec.ts` can assert the invariants
 * this CSS has to hold without an Angular JIT compiler, which the vitest node env has not got.
 * All colours are `--mj-*` builder tokens; the form INSIDE the stage themes itself from
 * `--mjf-*` tokens set on its host at runtime.
 */
export const PREVIEW_STAGE_STYLES = /* css */ `
:host {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  font-family: var(--mj-font-family);
}

.ps-bar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--mj-border-default);
  background: var(--mj-bg-surface);
}

/* Sunken, so a framed device reads as an object ON a surface rather than a box drawn in the
   same plane. This is the whole reason the device sizes are legible at a glance. */
.ps-desk {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  background: var(--mj-bg-surface-sunken);
}

/* A VIEWPORT, not a panel: fixed box, scrolling inside. That is the whole difference between
   previewing a phone and previewing a very narrow desktop — the fold only exists if the frame
   stops somewhere. */
.ps-stage {
  flex: none;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--mj-bg-page, var(--mj-bg-surface));
  transition: width 0.18s cubic-bezier(0.2, 0, 0, 1),
    height 0.18s cubic-bezier(0.2, 0, 0, 1);
}

/* Only the narrowed sizes get a frame. Desktop fills the desk, and drawing a border around
   something edge-to-edge marks nothing. */
.ps-stage--framed {
  margin: 1rem 0;
  border: 1px solid var(--mj-border-default);
  border-radius: var(--mj-radius-lg);
  box-shadow: 0 18px 40px -22px color-mix(in srgb, var(--mj-text-primary) 55%, transparent);
  /* Deliberately no overflow shorthand here, however much rounded corners look like they want
     one: the shorthand resets overflow-y as well, which silently turned the device frame into a
     fixed window showing only the top of the form with no way to reach the rest. The base rule
     clips to the radius just as well AND scrolls. */
}

/* Height only. Never \`display\`: the widget's own :host is a flex column, and that chain is what
   lets a welcome or ending screen centre itself in the room the stage gives it. A host pane that
   set \`display: block\` here beat the widget's :host on specificity and pinned every screen to
   the top of a tall empty box — which is exactly why there is a spec asserting this. Without the
   min-height the widget is content-height inside a fixed-height frame, so a welcome screen
   rendered as a short band at the top with the desk showing through beneath it. */
.ps-stage > mj-form {
  min-height: 100%;
  box-sizing: border-box;
}

.ps-devices {
  display: inline-flex;
  gap: 0.25rem;
  padding: 0.25rem;
  border: 1px solid var(--mj-border-default);
  border-radius: var(--mj-radius-md);
  background: var(--mj-bg-surface-sunken);
}

/* Big enough that the glyph reads as a monitor, a tablet and a phone at a glance. At 2rem the
   three silhouettes were near-identical rounded rectangles and the control looked like three
   unlabelled buttons rather than a size switch. */
.ps-device {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.5rem;
  font-size: 1.125rem;
  border: none;
  border-radius: var(--mj-radius-sm);
  background: transparent;
  color: var(--mj-text-secondary);
  cursor: pointer;
  transition: var(--mj-transition-base);
}
.ps-device:hover { color: var(--mj-text-primary); }
.ps-device:focus-visible {
  outline: 2px solid var(--mj-brand-primary);
  outline-offset: 1px;
}

/* The lifted-tile treatment rather than a colour swap: at 2rem an icon is too small to carry a
   state on its own colour alone, and against a sunken track a raised surface reads as pressed
   from across the room. */
.ps-device.is-on {
  background: var(--mj-bg-surface);
  color: var(--mj-brand-primary);
  box-shadow: var(--mj-shadow-sm);
}

.ps-width {
  margin-left: auto;
  font-size: 0.8125rem;
  color: var(--mj-text-muted);
  white-space: nowrap;
}

/* Said out loud rather than left to be discovered: the frame is not the width the author asked
   for, and a silently cropped tablet is exactly the wrong thing to trust. */
.ps-narrowed {
  margin-left: 0.375rem;
  padding: 0.0625rem 0.375rem;
  border-radius: 999px;
  background: var(--mj-bg-surface-sunken);
  color: var(--mj-text-secondary);
}

/* ------------------------------------------------------- screen strip (bottom) */

/* Same segmented-track language as .ps-devices — one visual grammar for "pick one of these",
   so the author only has to learn the control once. Centred rather than left-aligned because
   this strip maps the respondent's PATH, and a path reads as a path when it sits under the
   thing it describes rather than tucked into a corner. */
.ps-screens {
  flex: none;
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0.25rem;
  padding: 0.5rem 0.75rem;
  border-top: 1px solid var(--mj-border-default);
  background: var(--mj-bg-surface);
}

.ps-screen {
  display: inline-flex;
  align-items: center;
  gap: 0.4375rem;
  /* A real tap target on the touch devices this builder is also used from. */
  min-height: 2.25rem;
  padding: 0.3125rem 0.75rem;
  font: inherit;
  font-size: 0.8125rem;
  border: none;
  border-radius: var(--mj-radius-sm);
  background: transparent;
  color: var(--mj-text-secondary);
  cursor: pointer;
  transition: var(--mj-transition-base);
}
.ps-screen:hover { background: var(--mj-bg-surface-hover); color: var(--mj-text-primary); }
.ps-screen:focus-visible {
  outline: 2px solid var(--mj-brand-primary);
  outline-offset: 1px;
}

/* Lifted tile + brand colour, matching .ps-device.is-on: pressed reads from across the room
   without relying on colour alone, which WCAG 1.4.1 asks for and colour-blind authors need. */
.ps-screen.is-on {
  background: var(--mj-bg-surface-sunken);
  color: var(--mj-brand-primary);
  box-shadow: var(--mj-shadow-sm);
  font-weight: 600;
}

/* Ending screens are labelled by their own title, which authors write as whole sentences.
   Truncated with the full text on the button's title attribute rather than wrapped, so one
   long ending cannot push the strip into a second row and shift every other chip. */
.ps-screen__label {
  max-width: 11rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .ps-stage { transition: none; }
}
`;
