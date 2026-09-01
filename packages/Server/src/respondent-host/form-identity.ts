/**
 * The identity a shared distribution link carries: the form's name and description, baked into the
 * host page's `<title>` and Open Graph tags so a link pasted into Slack, Teams, email or a text
 * message unfurls as *this* form rather than as a generic card reading "Form" (bizapps-forms#120).
 *
 * WHY the live `Form` row and not the published snapshot: the snapshot's `name` / `description`
 * are copies of these same two columns taken at publish time, and reading it means loading the
 * whole definition JSON — which the widget then loads again over GraphQL — to extract two strings
 * on the hottest unauthenticated path in the product. The row is the form's identity as its
 * author currently states it, and it is one primary-key read for one column.
 *
 * The NAME needs no read at all: the distribution view already joins it (`Form`), and the door has
 * that row in hand by the time this runs.
 */
import type { UserInfo } from '@memberjunction/core';
import { LogError } from '@memberjunction/core';
import { quoteSqlString } from '@mj-biz-apps/forms-entities';
import type {
  mjBizAppsFormsFormDistributionEntityType,
  mjBizAppsFormsFormEntityType,
} from '@mj-biz-apps/forms-entities';

import { FORM_ENTITY } from '../public-submit/entity-names.js';
import type { RedeemRunViewProvider } from './redeem.service.js';

/** What the host page bakes into its head. */
export interface FormIdentity {
  /** The form's name — tab title and `og:title`. */
  name: string;
  /** The form's description — `og:description`. Absent when the form has none. */
  description?: string;
}

/** The slice of the resolved distribution row the identity is derived from. */
export type FormIdentitySource = Pick<mjBizAppsFormsFormDistributionEntityType, 'FormID' | 'Form' | 'Slug'>;

/**
 * Resolve the identity for the host page. Never throws and never blocks the form: a description
 * that cannot be read is LOGGED (with the slug and form id, so the log line can be traced back to
 * a link) and omitted — the second line of an unfurl card is not worth a respondent's form.
 */
export async function loadFormIdentity(
  provider: RedeemRunViewProvider,
  contextUser: UserInfo,
  source: FormIdentitySource,
): Promise<FormIdentity> {
  const description = await loadDescription(provider, contextUser, source);
  return description ? { name: source.Form, description } : { name: source.Form };
}

/** One primary-key read of one column, or `undefined` (logged) if it cannot be read. */
async function loadDescription(
  provider: RedeemRunViewProvider,
  contextUser: UserInfo,
  source: FormIdentitySource,
): Promise<string | undefined> {
  const result = await provider.RunView<mjBizAppsFormsFormEntityType>(
    {
      EntityName: FORM_ENTITY,
      ExtraFilter: `ID=${quoteSqlString(source.FormID)}`,
      Fields: ['Description'],
      ResultType: 'simple',
      MaxRows: 1,
    },
    contextUser,
  );
  // RunView never throws — check Success. A distribution without its form is unrepresentable
  // (hard FK), so an empty result is as anomalous as a failed read and gets the same log line.
  const row = result.Success ? result.Results[0] : undefined;
  if (!row) {
    const why = result.Success ? 'no row' : result.ErrorMessage;
    LogError(
      `[Forms] Could not read the description of form ${source.FormID} for link "${source.Slug}" ` +
        `(${why}); the page will carry its name only.`,
    );
    return undefined;
  }
  const trimmed = row.Description?.trim();
  return trimmed ? trimmed : undefined;
}
