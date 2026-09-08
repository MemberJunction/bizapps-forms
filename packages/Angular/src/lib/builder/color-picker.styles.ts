/**
 * Colour picker styles — plain-CSS string (the package builds with `ngc` only, no SCSS).
 *
 * The two gradients on `.cp-plane` are the only place in the builder where a literal colour is
 * correct: white and black there are not theme decisions, they are the saturation and value AXES
 * of the colour space the control draws. Swapping them for tokens would make the plane show a
 * different colour from the one it reports. The UI-token gate is told so explicitly.
 */
export const COLOR_PICKER_STYLES = /* css */ `
:host {
  position: relative;
  display: inline-block;
}

/* Colour only. The code used to ride on the swatch, which put arbitrary author-chosen text on
   an arbitrary author-chosen background — the exact legibility problem this panel warns about,
   committed by the panel itself — and said the same thing twice, since the hex is right there
   the moment the picker opens. A bordered chip in a labelled row needs no caption.

   Still a generous target rather than a dot: 3.5rem by 2.25rem reads as a control, clears the
   44px-ish touch guidance on the short axis, and gives enough area to actually judge a colour. */
.cp-swatch {
  display: block;
  width: 3.5rem;
  height: 2.25rem;
  padding: 0;
  /* The border is load-bearing, not trim: without it a white swatch on the panel's white
     surface is an invisible control. */
  border: 1px solid var(--mj-border-default);
  border-radius: var(--mjf-radius-sm);
  cursor: pointer;
  transition: var(--mj-transition-base);
}
.cp-swatch:hover { border-color: var(--mj-brand-primary); }
.cp-swatch:focus-visible {
  outline: 2px solid var(--mj-brand-primary);
  outline-offset: 2px;
}

.cp-pop {
  position: absolute;
  z-index: 40;
  top: calc(100% + 0.375rem);
  right: 0;
  width: 15rem;
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  padding: 0.75rem;
  border: 1px solid var(--mj-border-default);
  border-radius: var(--mj-radius-md);
  background: var(--mj-bg-surface);
  box-shadow: 0 16px 40px -12px color-mix(in srgb, var(--mj-text-primary) 40%, transparent);
}

/* Saturation left-to-right over the hue, brightness top-to-bottom over both. */
.cp-plane {
  position: relative;
  height: 8.5rem;
  border-radius: var(--mj-radius-sm);
  cursor: crosshair;
  touch-action: none;
  /* ui-gate: allow-literal-color(3) — these ARE the axes of the colour space, not theme
     decisions: saturation is the white ramp and brightness is the black one. Tokenised, the
     plane would show a different colour from the one it reports. */
  background-image:
    linear-gradient(to top, #000, transparent),
    linear-gradient(to right, #fff, transparent);
}
.cp-plane:focus-visible {
  outline: 2px solid var(--mj-brand-primary);
  outline-offset: 2px;
}

/* A ring, not a filled dot: the author has to see the colour UNDER the cursor to judge it. */
.cp-plane__dot {
  position: absolute;
  width: 14px;
  height: 14px;
  margin: -7px 0 0 -7px;
  /* ui-gate: allow-literal-color(3) — a white ring inside a dark halo is the one treatment
     that stays visible over EVERY colour the plane can show, which is the cursor's whole job. */
  border: 2px solid #fff;
  border-radius: 50%;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.45);
  pointer-events: none;
}

.cp-hue {
  width: 100%;
  height: 0.875rem;
  margin: 0;
  padding: 0;
  border-radius: 999px;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  /* ui-gate: allow-literal-color(4) — the hue axis itself, in spectrum order. */
  background: linear-gradient(
    to right,
    #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%
  );
}
.cp-hue:focus-visible {
  outline: 2px solid var(--mj-brand-primary);
  outline-offset: 2px;
}
.cp-hue::-webkit-slider-thumb {
  appearance: none;
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  /* ui-gate: allow-literal-color(4) — same ring, same reason: it rides on the spectrum. */
  border: 2px solid #fff;
  border-radius: 50%;
  background: transparent;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.45);
  cursor: pointer;
}
.cp-hue::-moz-range-thumb {
  width: 14px;
  height: 14px;
  /* ui-gate: allow-literal-color(4) — same ring, same reason: it rides on the spectrum. */
  border: 2px solid #fff;
  border-radius: 50%;
  background: transparent;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.45);
  cursor: pointer;
}

.cp-entry { display: flex; align-items: center; gap: 0.5rem; }
.cp-entry__chip {
  flex: none;
  width: 1.75rem;
  height: 1.75rem;
  border: 1px solid var(--mj-border-default);
  border-radius: var(--mjf-radius-sm);
}
.cp-hex {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 2rem;
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--mj-border-default);
  border-radius: var(--mjf-radius-sm);
  background: var(--mj-bg-surface);
  color: var(--mj-text-primary);
  font-family: var(--mj-font-family-mono, monospace);
  font-size: 0.8125rem;
  text-transform: lowercase;
}
.cp-hex:focus-visible {
  outline: 2px solid var(--mj-brand-primary);
  outline-offset: 1px;
}

/* Advisory, not an error: this colour is applied exactly as chosen, and the note says what it
   will cost. Amber rather than red, and no icon-only version — the number is the message. */
.cp-warn {
  display: flex;
  align-items: flex-start;
  gap: 0.375rem;
  margin: 0;
  padding: 0.375rem 0.5rem;
  border-radius: var(--mjf-radius-sm);
  background: color-mix(in srgb, var(--mj-status-warning) 14%, transparent);
  color: var(--mj-text-primary);
  font-size: 0.75rem;
  line-height: 1.35;
}
.cp-warn i { margin-top: 0.125rem; color: var(--mj-status-warning); }

/* Three columns, because each ROW of PRESET_SWATCHES is one complete theme — page background,
   font colour, accent. A five-column grid would wrap those triples across rows and turn three
   coherent themes back into nine loose colours. */
.cp-presets {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.375rem;
}
.cp-preset {
  height: 1.875rem;
  border: 1px solid var(--mj-border-subtle);
  border-radius: var(--mjf-radius-sm);
  cursor: pointer;
  transition: var(--mj-transition-base);
}
.cp-preset:hover { transform: translateY(-1px); }
.cp-preset:focus-visible {
  outline: 2px solid var(--mj-brand-primary);
  outline-offset: 2px;
}
/* Ring rather than a tick: a check mark would need a contrasting colour, which is precisely
   what an arbitrary swatch cannot guarantee. */
.cp-preset.is-on {
  box-shadow: 0 0 0 2px var(--mj-bg-surface), 0 0 0 4px var(--mj-brand-primary);
}

@media (prefers-reduced-motion: reduce) {
  .cp-preset:hover { transform: none; }
}
`;
