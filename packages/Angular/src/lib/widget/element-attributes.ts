/**
 * The `<mj-form>` attribute contract, in ONE table.
 *
 * The element used to keep two lists: `observedAttributes`, which named four attributes, and an
 * `attributeChangedCallback` that acted on one of them. The other three — `api-url`, `token` and
 * `turnstile-site-key` — were watched and then dropped on the floor.
 *
 * That is not a cosmetic inconsistency. The connection config is read once, synchronously, at
 * the start of `connectedCallback`, and `formsWidgetProviders` picks the MOCK transport whenever
 * `graphqlUrl` is empty. So the ordinary embedding sequence
 *
 *     const el = document.createElement('mj-form');
 *     document.body.appendChild(el);        // config captured here: api-url is null
 *     el.setAttribute('api-url', '…');      // observed, ignored, forever
 *
 * produced a widget bolted to the mock: it rendered the built-in DEMO form instead of the real
 * one, accepted a respondent's answers, and returned "Thank you! Your response has been
 * recorded." having written nothing anywhere. Silent, and indistinguishable from success.
 *
 * One table, derived both ways, so the two can never disagree again.
 */
import { normalizeApiConfig, type FormsApiConfig } from './api/forms-api.config';

/**
 * What a change to each attribute has to do.
 *
 * `input` — hand the new value to the running component.
 * `rebuild` — tear the Angular application down and build it again. The connection is baked
 * into the injector by `formsWidgetProviders`, so there is no in-place way to change it.
 */
const ATTRIBUTE_EFFECTS = {
  slug: 'input',
  'api-url': 'rebuild',
  token: 'rebuild',
  'turnstile-site-key': 'rebuild',
} as const satisfies Record<string, 'input' | 'rebuild'>;

export type ElementAttribute = keyof typeof ATTRIBUTE_EFFECTS;
export type AttributeEffect = (typeof ATTRIBUTE_EFFECTS)[ElementAttribute];

/** Exactly the attributes the element observes — derived, never hand-listed. */
export const ELEMENT_ATTRIBUTES = Object.keys(ATTRIBUTE_EFFECTS) as readonly ElementAttribute[];

/** What to do about a change to `name`, or `undefined` when it is none of our business. */
export function effectOf(name: string): AttributeEffect | undefined {
  return Object.prototype.hasOwnProperty.call(ATTRIBUTE_EFFECTS, name)
    ? ATTRIBUTE_EFFECTS[name as ElementAttribute]
    : undefined;
}

/**
 * Build the connection config from the element's attributes.
 *
 * Takes a reader rather than the element so the mapping is testable without a DOM, and so the
 * caller is forced to read the attributes at the moment the config is built rather than closing
 * over values captured earlier — which is the other half of the bug above.
 */
export function configFromAttributes(read: (name: string) => string | null): FormsApiConfig {
  return normalizeApiConfig({
    graphqlUrl: read('api-url') ?? '',
    token: read('token') ?? undefined,
    turnstileSiteKey: read('turnstile-site-key') ?? undefined,
  });
}
