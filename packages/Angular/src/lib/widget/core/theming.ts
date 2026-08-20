/**
 * Apply a published form's {@link FormStyleTokens} as CSS custom properties on the
 * widget host element. This is the ONLY place colors enter the widget: every
 * component styles itself with `--mjf-*` / `--mj-*` tokens, so a form is re-themed
 * purely by the `cssVariables` map the builder captured at publish time. No hardcoded
 * colors anywhere downstream.
 */
import {
  contrastRatio,
  inkRepair,
  parseCssColor,
  readableInk,
  toCssRgb,
  type FormStyleTokens,
} from '@mj-biz-apps/forms-entities';

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
  const authored = tokens.cssVariables ?? {};
  ensureReadableInk(host, {
    ink: PAGE_INK_TOKEN in authored,
    accent: ACCENT_TOKEN in authored,
  });
}

/** The two tokens the guard may repair — and the two an author sets from the Design tab. */
const PAGE_INK_TOKEN = '--mjf-page-ink';
const ACCENT_TOKEN = '--mjf-accent';

/** Minimum contrast for a large UI element against the page (WCAG 1.4.11). */
const NON_TEXT_MIN = 3;

/** Which colours the author set explicitly, and which the guard may therefore not touch. */
interface AuthoredColors {
  ink: boolean;
  accent: boolean;
}

/**
 * Last step, after every authored token is on the element: make sure DEFAULT text can be read.
 *
 * Runs here rather than in the builder because this is the only point where the FINAL colours
 * are known — an author sets some tokens, the rest fall back to defaults, and custom CSS can
 * move either. Reading them back off the element is the only way to judge the pair that will
 * actually render.
 *
 * `inkAuthored` is what keeps this from fighting the person using it. When the author picked
 * the ink themselves the guard stands down entirely and the Design panel warns instead, because
 * a control that silently substitutes a different colour for the one you chose is
 * indistinguishable from a broken control — which is how it was reported. It still repairs the
 * pairing nobody chose: a themed background under the widget's default ink.
 */
function ensureReadableInk(host: HTMLElement, authored: AuthoredColors): void {
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
  const readable = inkRepair(background, ink, authored.ink);
  if (readable) {
    host.style.setProperty(PAGE_INK_TOKEN, toCssRgb(readable));
  }

  // The accent is the other colour that lands on the page — buttons, selected choices, the
  // progress fill. Judged on its own rather than only when the ink was repaired: an author who
  // themes the background and leaves the buttons default gets an invisible button, and the ink
  // being fine says nothing about that. Authorship gates it for the same reason as the ink —
  // a button colour someone deliberately picked is theirs, warned about but never swapped.
  if (authored.accent) {
    return;
  }
  const accent = parseCssColor(style.getPropertyValue(ACCENT_TOKEN).trim());
  if (accent && contrastRatio(background, accent) < NON_TEXT_MIN) {
    // `readableInk(bg, bg)` is "whichever extreme reads on this background" — a background can
    // never contrast with itself, so it always answers with one of the two.
    host.style.setProperty(ACCENT_TOKEN, toCssRgb(readable ?? readableInk(background, background)));
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
