/**
 * Apply a published form's {@link FormStyleTokens} as CSS custom properties on the
 * widget host element. This is the ONLY place colors enter the widget: every
 * component styles itself with `--mjf-*` / `--mj-*` tokens, so a form is re-themed
 * purely by the `cssVariables` map the builder captured at publish time. No hardcoded
 * colors anywhere downstream.
 */
import type { FormStyleTokens } from '@mj-biz-apps/forms-entities';

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
