/**
 * Retiring the resume links of a response (#138) — moved here from forms-server's
 * `magic-link/resume-invites.service.ts` with #303 Task 8, because its first caller is now
 * `FormSubmissionEngine` (a sealed response's links die with it) and this package cannot import
 * forms-server. Minting and the token lookup stay in forms-server beside the token code they need.
 *
 * REVOCATION IS BY RESOURCE, NOT BY TOKEN: every invite for a response carries that response in
 * `ResourceID`, so a `RunView` plus the minter's `RevokeAnonymousInvite` retires all of them, with
 * the ownership check the minter already performs on each one.
 */
import { LogError, RunView, type DatabaseProviderBase, type UserInfo } from '@memberjunction/core';
import type { MJMagicLinkInviteEntity } from '@memberjunction/core-entities';
import { quoteSqlString } from '@mj-biz-apps/forms-entities';
import { MagicLinkMinterRegistry } from './minter.js';

/** Core's invite entity, by name. Read here, written only through the minter. */
const INVITE_ENTITY = 'MJ: Magic Link Invites';

/** What a revoke pass did. Counted rather than boolean: partial success is the interesting case. */
export interface RevokeSummary {
  revoked: number;
  failed: number;
}

/**
 * Retire every live invite for a response — or only the device-held ones.
 *
 * `deviceOnly` is not a convenience switch, it is a security decision with two answers:
 *
 *   - **On final submit, `deviceOnly: false`.** The response is sealed; every credential that could
 *     reopen it dies with it. This is decision 3 as the review flipped it: an Active bearer sitting
 *     in an inbox for another 30 days, reading sealed intake answers, is disclosure the moment that
 *     mail is forwarded — and refusing later can say something useful ("submitted on <date>")
 *     rather than nothing.
 *   - **On start-over, `deviceOnly: true`.** The person pressing "Not you? Start over" is, by
 *     definition, NOT the owner — that is what the control is for. Letting a stranger on a shared
 *     device revoke the owner's emailed link would hand them a way to lock the respondent out of
 *     their own draft. `Email IS NULL` is exactly "held on a device, sent nowhere".
 *
 * Best-effort and never throws: it runs after a row is already written, so reporting a failure
 * would tell a respondent their submission failed when it did not.
 *
 * `provider` is the instance every read AND write of THIS pass runs through — every caller now
 * hands one of its own: the sealed-response revoke (`FormSubmissionEngine`, on an isolated provider
 * after the save commits) and the start-over/`/forget` path (forms-server's `resume-deps.ts`, via
 * `ResumeDepsContext.acquireProvider`). Without it, `new RunView()` and the minter's own `new
 * Metadata()` fallback would both reach the process-global provider instead — and that provider can
 * have another unit of work's transaction open on it (bizapps-forms#260/#265: Common.LogActivity),
 * so any query issued through it — by any caller, scoped or not — joins that transaction and races
 * its COMMIT. (Redeem is an HTTP call to core, not a query through this process's provider, so it is
 * not part of this list.)
 */
export async function revokeResponseInvites(
  responseId: string,
  options: { deviceOnly: boolean },
  contextUser: UserInfo,
  provider: DatabaseProviderBase,
): Promise<RevokeSummary> {
  const minter = MagicLinkMinterRegistry.Instance.Minter;
  if (!minter || !responseId) {
    return { revoked: 0, failed: 0 };
  }
  const filter =
    `ResourceID=${quoteSqlString(responseId)} AND Status='Active'` +
    (options.deviceOnly ? ' AND Email IS NULL' : '');
  const found = await new RunView(provider).RunView<MJMagicLinkInviteEntity>(
    { EntityName: INVITE_ENTITY, ExtraFilter: filter, Fields: ['ID'], ResultType: 'simple' },
    contextUser,
  );
  if (!found.Success) {
    LogError(`[Forms] could not list resume invites of response ${responseId}: ${found.ErrorMessage}`);
    return { revoked: 0, failed: 1 };
  }
  const summary: RevokeSummary = { revoked: 0, failed: 0 };
  for (const invite of found.Results) {
    const outcome = await minter.RevokeAnonymousInvite(
      { inviteId: invite.ID, resourceId: responseId },
      contextUser,
      provider,
    );
    if (outcome.success) {
      summary.revoked += 1;
    } else {
      summary.failed += 1;
      LogError(`[Forms] could not revoke resume invite ${invite.ID} of response ${responseId}: ${outcome.message}`);
    }
  }
  return summary;
}
