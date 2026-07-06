/**
 * Typed access to the Cloudflare Turnstile browser global and a one-shot loader for
 * its script. Kept separate from the component so the render logic has a strongly-typed
 * seam (no `any`) and so tests can stub the global on `window`.
 *
 * The script (`https://challenges.cloudflare.com/turnstile/v0/api.js`) is loaded at most
 * once per document, regardless of how many `<mj-form>` instances are on the page.
 */

/** Options passed to `turnstile.render` (explicit mode subset we use). */
export interface TurnstileRenderOptions {
  sitekey: string;
  callback: (token: string) => void;
  'expired-callback'?: () => void;
  'error-callback'?: () => void;
}

/** The subset of the Cloudflare Turnstile API this widget calls. */
export interface TurnstileApi {
  render(container: HTMLElement, options: TurnstileRenderOptions): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

/** Window augmented with the Turnstile global once the script has loaded. */
interface TurnstileWindow extends Window {
  turnstile?: TurnstileApi;
}

/** Default Cloudflare Turnstile script URL (overridable via widget config). */
export const DEFAULT_TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

/** DOM id for the singleton `<script>` tag, so we never inject it twice. */
const SCRIPT_ELEMENT_ID = 'mjf-turnstile-script';

/** In-flight/settled load promise, shared across all widget instances on the page. */
let loadPromise: Promise<void> | null = null;

/** The Turnstile global if the script has loaded, else undefined. */
export function getTurnstile(): TurnstileApi | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  return (window as TurnstileWindow).turnstile;
}

/**
 * Ensure the Turnstile script is loaded exactly once, resolving when `window.turnstile`
 * is available. Rejects if the script fails to load or there is no DOM. Subsequent calls
 * return the same promise.
 */
export function ensureTurnstileScript(scriptUrl = DEFAULT_TURNSTILE_SCRIPT_URL): Promise<void> {
  if (getTurnstile()) {
    return Promise.resolve();
  }
  if (loadPromise) {
    return loadPromise;
  }
  if (typeof document === 'undefined') {
    return Promise.reject(new Error('Turnstile requires a DOM.'));
  }
  loadPromise = injectScript(scriptUrl);
  return loadPromise;
}

/** Inject the script tag (or await an existing one) and resolve when the global appears. */
function injectScript(scriptUrl: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ELEMENT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Turnstile script failed to load.')), {
        once: true,
      });
      return;
    }
    const script = document.createElement('script');
    script.id = SCRIPT_ELEMENT_ID;
    script.src = scriptUrl;
    script.async = true;
    script.defer = true;
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => {
      loadPromise = null; // allow a later retry
      reject(new Error('Turnstile script failed to load.'));
    }, { once: true });
    document.head.appendChild(script);
  });
}

/** Test-only: reset the module-level load state so specs start clean. */
export function resetTurnstileLoaderForTest(): void {
  loadPromise = null;
}
