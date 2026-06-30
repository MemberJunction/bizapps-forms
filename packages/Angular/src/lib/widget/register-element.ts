/**
 * Registers `<mj-form>` as a browser custom element so it can be embedded by a plain
 * `<script>` tag with no Explorer shell:
 *
 * ```html
 * <mj-form slug="my-survey" api-url="https://api.example.com/graphql" token="…"></mj-form>
 * ```
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

import { FORMS_API_SERVICE } from './api/forms-api.interface';
import { FORMS_API_CONFIG, type FormsApiConfig } from './api/forms-api.config';
import { FormsGraphQLApiService } from './api/forms-api.graphql.service';
import { FormsMockApiService } from './api/forms-api.mock.service';
import { MjFormComponent } from './mj-form.component';

/** Element tag the widget registers under. */
export const MJ_FORM_TAG = 'mj-form';

/** Attributes the element reflects onto the root component. */
const OBSERVED_ATTRS = ['slug', 'api-url', 'token'] as const;

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
    return OBSERVED_ATTRS;
  }

  private appRef?: ApplicationRef;
  private componentRef?: ComponentRef<MjFormComponent>;

  public async connectedCallback(): Promise<void> {
    if (this.componentRef) {
      return;
    }
    const config: FormsApiConfig = {
      graphqlUrl: this.getAttribute('api-url') ?? '',
      token: this.getAttribute('token') ?? undefined,
    };
    const apiServiceProvider = config.graphqlUrl
      ? { provide: FORMS_API_SERVICE, useClass: FormsGraphQLApiService }
      : { provide: FORMS_API_SERVICE, useClass: FormsMockApiService };

    const app = await createApplication({
      providers: [
        { provide: FORMS_API_CONFIG, useValue: config },
        apiServiceProvider,
        FormsGraphQLApiService,
        FormsMockApiService,
      ],
    });
    this.appRef = app;

    const componentRef = createComponent(MjFormComponent, {
      environmentInjector: app.injector,
      hostElement: this,
    });
    componentRef.setInput('slug', this.getAttribute('slug') ?? '');
    app.attachView(componentRef.hostView);
    this.componentRef = componentRef;
  }

  public attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === 'slug' && this.componentRef) {
      this.componentRef.setInput('slug', value ?? '');
    }
  }

  public disconnectedCallback(): void {
    this.componentRef?.destroy();
    this.appRef?.destroy();
    this.componentRef = undefined;
    this.appRef = undefined;
  }
}
