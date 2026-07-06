/**
 * Browser bundle entry point for the `<mj-form>` custom element (DG-5).
 *
 * `npm run build` (ngc) compiles this to `dist/widget-entry.js` with the widget component
 * AOT-compiled and its templates/styles inlined; `npm run build:widget` then bundles that
 * compiled output — plus the Angular runtime it pulls in — into a single self-contained,
 * browser-loadable file at `dist/widget/mj-form.js`.
 *
 * The respondent host page (`@mj-biz-apps/forms-server` → `host-page.ts`) loads that bundle
 * via `<script src="/forms/widget/mj-form.js">`. Importing this module immediately registers
 * the element, so `customElements.whenDefined('mj-form')` resolves on script load — no
 * Explorer shell, no MJ global provider, no JIT compiler.
 *
 * This is the ONLY place the registration is auto-invoked at import time; the library's
 * public API keeps `registerMjFormElement()` as an explicit call for embedders that bootstrap
 * their own way.
 */
import { registerMjFormElement } from './lib/widget/register-element';

registerMjFormElement();
