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
 *
 * The projection also WIDENS one field — see {@link withDistributionCaptcha}. The snapshot is
 * what the form published; the payload is what this link demands, and for a captcha those differ.
 */
import type { PublishedFormDefinition } from '@mj-biz-apps/forms-entities';
import { captchaRequired } from './turnstile.service';

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

/**
 * The definition as the respondent's LINK makes it, not merely as the form was published.
 *
 * A captcha is demanded by the form's own setting OR by the share link's `CaptchaRequired`
 * column, and the submit pipeline has always gated on both (`submit-pipeline.ts`, stage 4).
 * This read path did not: it returned the snapshot's setting alone, so a link with the column
 * on rendered no challenge, collected no token, and had every completed submission refused
 * with `missing-token` — a form nobody could submit, with nothing on screen to act on (#151).
 *
 * The OR is {@link captchaRequired} itself, the same function the gate calls, so the two
 * cannot drift into disagreeing about what "required" means.
 *
 * Applied BEFORE serialization, and to the definition rather than to `settings` alone, because
 * the widget's transport selects `definitionJSON` and parses THAT into the whole definition
 * (`forms-api.graphql.service.ts`) — writing the flag onto `settingsJSON` only would have
 * satisfied a shape check and changed nothing the respondent sees.
 *
 * NEVER WRITES THROUGH — but it is not unconditionally a new object, and the difference matters to
 * anyone extending this. When the flag changes it returns a fresh object; when it does not, there
 * is nothing to change and it returns the argument itself. So the guarantee here is NON-MUTATION,
 * which {@link publicDefinition} also gives but by the stronger route of always spreading. Do not
 * read the two as interchangeable, and do not mutate what this returns: on the unchanged path —
 * which is both of the common states, neither side asking for a captcha or the form already
 * asking — that object is the caller's own.
 */
export function withDistributionCaptcha(
  definition: PublishedFormDefinition,
  distributionCaptchaRequired: boolean,
): PublishedFormDefinition {
  const required = captchaRequired(definition.settings.captchaRequired, distributionCaptchaRequired);
  if (required === definition.settings.captchaRequired) {
    return definition;
  }
  return { ...definition, settings: { ...definition.settings, captchaRequired: required } };
}

/**
 * Project a resolved definition into the anonymous-safe payload.
 *
 * `distributionCaptchaRequired` is REQUIRED rather than optional: the caller always has the
 * resolved distribution in hand, and an optional flag would let a future call site quietly
 * reintroduce the half-answer this parameter exists to remove.
 */
export function publicFormPayload(
  definition: PublishedFormDefinition,
  distributionCaptchaRequired: boolean,
): PublicFormPayload {
  const resolved = withDistributionCaptcha(definition, distributionCaptchaRequired);
  return {
    formId: resolved.formId,
    formVersionId: resolved.formVersionId,
    name: resolved.name,
    description: resolved.description,
    renderMode: resolved.renderMode,
    settingsJSON: JSON.stringify(resolved.settings),
    styleTokensJSON: JSON.stringify(resolved.styleTokens),
    definitionJSON: JSON.stringify(publicDefinition(resolved)),
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
