/**
 * What an ANONYMOUS caller is allowed to see of a published form.
 *
 * This is the only place the respondent-facing projection is decided, and it is deliberately a
 * pure function rather than an object literal inside the resolver: it performs a **contract
 * narrowing** — it removes data that used to be in a shipped GraphQL response — and a narrowing
 * nothing can test is a narrowing that can be deleted with the suite green.
 *
 * The narrowing is `automations`. Those are SERVER configuration: action and agent ids, entity
 * bindings, trigger conditions, knockout wiring. The widget renders pages, screens and settings
 * and never reads `automations` from the public definition — the server re-resolves them from its
 * own snapshot at submit time — so an anonymous respondent has no business receiving them.
 *
 * EMPTIED, NOT DELETED. `automations` is required on `PublishedFormDefinition`, and the widget's
 * transport casts the parsed JSON straight to that type without checking
 * (`forms-api.graphql.service.ts`), so a missing key would be a lie the compiler cannot catch.
 * An empty array keeps the parsed shape honest.
 */
import type { PublishedFormDefinition } from '@mj-biz-apps/forms-entities';

/** The scalar fields of the public `PublishedForm` response, ready to assign onto the GraphQL type. */
export interface PublicFormPayload {
  formId: string;
  formVersionId: string;
  name: string;
  description: string | undefined;
  renderMode: string;
  settingsJSON: string;
  styleTokensJSON: string;
  definitionJSON: string;
}

/** Project a resolved definition into the anonymous-safe payload. */
export function publicFormPayload(definition: PublishedFormDefinition): PublicFormPayload {
  return {
    formId: definition.formId,
    formVersionId: definition.formVersionId,
    name: definition.name,
    description: definition.description,
    renderMode: definition.renderMode,
    settingsJSON: JSON.stringify(definition.settings),
    styleTokensJSON: JSON.stringify(definition.styleTokens),
    definitionJSON: JSON.stringify(publicDefinition(definition)),
  };
}

/**
 * The definition as an anonymous caller may have it.
 *
 * Separate from the payload above so a test can assert the SHAPE without parsing JSON back out,
 * and so a future second narrowing has an obvious home rather than being appended to a spread.
 */
export function publicDefinition(definition: PublishedFormDefinition): PublishedFormDefinition {
  return { ...definition, automations: [] };
}
