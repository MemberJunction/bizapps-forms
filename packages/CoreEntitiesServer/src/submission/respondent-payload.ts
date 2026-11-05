/**
 * What an ANONYMOUS respondent's browser receives of a published form — `Forms.GetRespondentForm`'s
 * `DefinitionJSON` (#302, #303 Task 8).
 *
 * It used to be a DENYLIST: `{ ...definition, automations: [] }`, so every key a later change added
 * to the snapshot shipped to every respondent, and by the time anyone looked the payload carried the
 * scoring table, every ending screen with its redirect URL, and the knockout conditions. It is now
 * the contracts' ALLOWLIST, {@link toRespondentDefinition}, built field by field: no `scoring`, no
 * `endScreens`, no score or knockout condition, no automations, quota or redirect. Which ending a
 * respondent lands on is `Forms.SaveResponse`'s answer, resolved here on the server.
 *
 * One thing is WIDENED on the way: the captcha flag. The snapshot is what the form published; the
 * payload is what this LINK demands — see {@link withDistributionCaptcha}.
 *
 * Pure: a narrowing nothing can test is a narrowing that can be deleted with the suite green.
 */
import { toRespondentDefinition, type PublishedFormDefinition, type RespondentFormDefinition } from '@mj-biz-apps/forms-entities';
import { captchaRequired } from './turnstile.js';

/**
 * The definition as the respondent's LINK makes it, not merely as the form was published.
 *
 * A captcha is demanded by the form's own setting OR by the share link's `CaptchaRequired` column,
 * and the submit gate has always gated on both. The read path once returned the snapshot's setting
 * alone, so a link with the column on rendered no challenge, collected no token, and had every
 * completed submission refused with `missing-token` (#151). The OR is {@link captchaRequired}
 * itself, the function the gate calls, so the two cannot drift.
 *
 * NEVER WRITES THROUGH: when the flag changes it returns a fresh object; when it does not, it returns
 * the argument itself — so do not mutate what this returns.
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
 * The respondent projection for this link: the allowlist, with the link's captcha demand folded in.
 *
 * `distributionCaptchaRequired` is REQUIRED rather than optional: the caller always has the resolved
 * distribution in hand, and an optional flag would let a future call site reintroduce the half
 * answer this parameter exists to remove.
 */
export function respondentDefinitionFor(
  definition: PublishedFormDefinition,
  distributionCaptchaRequired: boolean,
): RespondentFormDefinition {
  return toRespondentDefinition(withDistributionCaptcha(definition, distributionCaptchaRequired));
}
