/**
 * Registers `<mj-form>` as a browser custom element so it can be embedded by a plain
 * `<script>` tag with no Explorer shell:
 *
 * ```html
 * <mj-form slug="my-survey" api-url="https://api.example.com/graphql" token="…"
 *          turnstile-site-key="0x4AAAAAAA…"></mj-form>
 * ```
 *
 * `turnstile-site-key` is the PUBLIC Cloudflare Turnstile site key (global, one widget
 * for all forms). It is only consulted when a form has captcha turned on; leave it off
 * for forms that don't require a challenge.
 *
 * This is a thin, dependency-free Angular Elements equivalent: it bootstraps a
 * standalone Angular application per element instance via `createApplication` +
 * `createComponent`, and maps the element's attributes onto the component's signal
 * inputs. We avoid `@angular/elements` here only because it is not part of the
 * widget's dependency set; the registration is isolated to THIS file, so switching to
 * `createCustomElement` later is a localized change.
 *
 * The host chooses the transport: pass `api-url` to use the live GraphQL service, or
 * omit it to fall back to the standalone mock (great for embeds/previews/demos).
 */
import { ApplicationRef, ComponentRef, createComponent } from '@angular/core';
import { createApplication } from '@angular/platform-browser';

import { ELEMENT_ATTRIBUTES, configFromAttributes, effectOf, inputsFromAttributes } from './element-attributes';
import { keepInPlace } from './element-host';
import { formsWidgetProviders } from './widget-providers';
import { MjFormComponent } from './mj-form.component';

/** Element tag the widget registers under. */
export const MJ_FORM_TAG = 'mj-form';

/** Attributes the element reflects onto the root component. */


/**
 * Define the `<mj-form>` custom element. Idempotent: a second call is a no-op if the
 * tag is already registered. Call once at script load.
 */
export function registerMjFormElement(): void {
  if (typeof customElements === 'undefined' || customElements.get(MJ_FORM_TAG)) {
    return;
  }
  customElements.define(MJ_FORM_TAG, MjFormElement);
}

/**
 * The custom-element class. Each instance hosts its own bootstrapped Angular
 * application + `MjFormComponent`, wired to whichever transport its attributes select.
 */
class MjFormElement extends HTMLElement {
  static get observedAttributes(): readonly string[] {
    return ELEMENT_ATTRIBUTES;
  }

  private appRef?: ApplicationRef;
  private componentRef?: ComponentRef<MjFormComponent>;
  /** Serialises mounts so a burst of attribute changes cannot build two applications. */
  private mounting?: Promise<void>;
  /**
   * True while a rebuild tears the old application down. That teardown detaches this element from
   * the page and {@link teardownInPlace} puts it back; both are ours, not the page's, so the
   * connected/disconnected callbacks they fire must not tear down or mount again.
   */
  private rebuilding = false;

  public connectedCallback(): void {
    if (this.rebuilding) {
      return;
    }
    void this.mount();
  }

  public attributeChangedCallback(name: string, previous: string | null, value: string | null): void {
    if (previous === value) {
      return;
    }
    switch (effectOf(name)) {
      case 'input':
        this.componentRef?.setInput(name, value ?? '');
        break;
      case 'rebuild':
        // Only once something is running: before that, mount() reads the attributes itself.
        if (this.appRef) {
          void this.mount();
        }
        break;
      default:
        break;
    }
  }

  public disconnectedCallback(): void {
    if (this.rebuilding) {
      return;
    }
    this.teardown();
  }

  /**
   * Build (or rebuild) the Angular application for this element.
   *
   * Serialised through `mounting`, and the attributes are read AFTER the await rather than
   * before it. Both matter: `createApplication` is asynchronous, so a host that appends the
   * element and then sets its attributes in the same tick — the ordinary way to do it — would
   * otherwise have its config captured before those attributes existed, and be left talking to
   * the mock transport with no way to recover.
   */
  private async mount(): Promise<void> {
    const run = this.mounting ?? Promise.resolve();
    this.mounting = run.then(async () => {
      if (!this.isConnected) {
        return;
      }
      this.teardownInPlace();
      const app = await createApplication({
        providers: formsWidgetProviders(configFromAttributes((n) => this.getAttribute(n))),
      });
      if (!this.isConnected) {
        // Removed while we were building; do not attach an orphan view.
        app.destroy();
        return;
      }
      const componentRef = createComponent(MjFormComponent, {
        environmentInjector: app.injector,
        hostElement: this,
      });
      for (const [name, value] of inputsFromAttributes((n) => this.getAttribute(n))) {
        componentRef.setInput(name, value);
      }
      app.attachView(componentRef.hostView);
      this.appRef = app;
      this.componentRef = componentRef;
    });
    await this.mounting;
  }

  /**
   * Tear the running application down for a rebuild, keeping this element in the page.
   *
   * `teardown()` alone is right for `disconnectedCallback`, where the page has already removed the
   * element. Here the element is still connected, and destroying a component hosted on it detaches
   * it (see `element-host.ts`) — so without this, the `isConnected` check after
   * `createApplication` read our own detach as the page removing the form, and a rebuild left
   * nothing behind.
   */
  private teardownInPlace(): void {
    this.rebuilding = true;
    try {
      keepInPlace(this, () => this.teardown());
    } finally {
      this.rebuilding = false;
    }
  }

  private teardown(): void {
    this.componentRef?.destroy();
    this.appRef?.destroy();
    this.componentRef = undefined;
    this.appRef = undefined;
  }
}
