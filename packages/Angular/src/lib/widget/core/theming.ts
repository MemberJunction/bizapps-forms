/**
 * Apply a published form's {@link FormStyleTokens} as CSS custom properties on the
 * widget host element. This is the ONLY place colors enter the widget: every
 * component styles itself with `--mjf-*` / `--mj-*` tokens, so a form is re-themed
 * purely by the `cssVariables` map the builder captured at publish time. No hardcoded
 * colors anywhere downstream.
 */
import type { FormStyleTokens } from '@mj-biz-apps/forms-entities';

import { contrastRatio, parseCssColor, readableInk, toCssRgb } from './readable-ink';

/**
 * Set each `--token: value` from `styleTokens.cssVariables` on `host.style`, inject
 * optional `customCSS` into a scoped `<style>` inside the host, and expose `logoURL`
 * as the `--mjf-logo-url` token. Token names are passed through verbatim; only
 * `--`-prefixed custom properties are accepted (defensive — never lets a raw color in
 * under a non-custom-property name).
 */
export function applyStyleTokens(host: HTMLElement, tokens: FormStyleTokens | undefined): void {
  if (!tokens) {
    return;
  }
  for (const [name, value] of Object.entries(tokens.cssVariables ?? {})) {
    if (name.startsWith('--')) {
      host.style.setProperty(name, value);
    }
  }
  if (tokens.logoURL) {
    host.style.setProperty('--mjf-logo-url', `url("${tokens.logoURL}")`);
  }
  if (tokens.customCSS) {
    applyCustomCss(host, tokens.customCSS);
  }
  ensureReadableInk(host);
}

/**
 * Last step, after every authored token is on the element: make sure the text can be read.
 *
 * Runs here rather than in the builder because this is the only point where the FINAL colours
 * are known — an author sets some tokens, the rest fall back to defaults, and custom CSS can
 * move either. Reading them back off the element is the only way to judge the pair that will
 * actually render.
 *
 * Only ever raises contrast. An ink that already clears AA is left exactly as authored, so this
 * is invisible to every theme that was fine to begin with.
 */
function ensureReadableInk(host: HTMLElement): void {
  if (typeof getComputedStyle !== 'function') {
    return;
  }
  const style = getComputedStyle(host);
  // The RESOLVED colours, not the raw custom properties. A custom property hands back whatever
  // the author typed — hex, rgb(), a colour name, another var() — whereas `color` and
  // `background-color` are always resolved to rgb() by the engine. Reading the tokens directly
  // is how the first version of this guard silently did nothing on every hex theme, which is
  // most of them.
  const background = parseCssColor(style.backgroundColor);
  const ink = parseCssColor(style.color);
  if (!background || !ink) {
    return;
  }
  const readable = readableInk(background, ink);
  if (readable !== ink) {
    host.style.setProperty('--mjf-page-ink', toCssRgb(readable));
    // The accent is the other authored colour that lands on the page — buttons, selected
    // choices, the progress fill. Left alone when it works; swapped for the repaired ink when
    // it does not, so a themed form never has a second invisible layer under the first.
    const accent = parseCssColor(style.getPropertyValue('--mjf-accent').trim());
    if (accent && contrastRatio(background, accent) < 3) {
      host.style.setProperty('--mjf-accent', toCssRgb(readable));
    }
  }
}

/** Inject form-author custom CSS once, inside the host so it stays scoped to the widget. */
function applyCustomCss(host: HTMLElement, css: string): void {
  const existing = host.querySelector('style[data-mjf-custom]');
  if (existing) {
    existing.textContent = css;
    return;
  }
  const style = host.ownerDocument.createElement('style');
  style.setAttribute('data-mjf-custom', '');
  style.textContent = css;
  host.appendChild(style);
}
