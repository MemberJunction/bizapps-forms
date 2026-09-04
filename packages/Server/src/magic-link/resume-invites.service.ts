/**
 * Response-scoped magic-link invites — the credential a respondent reopens a draft with (#138).
 *
 * The same `MagicLinkInviteMinter` that provisions a distribution's public link mints these; only
 * the resource and the numbers differ. Nothing here is a new token format, a new table or a new
 * redeem path — a resume link IS a magic link, and every property that makes one safe (hash-only
 * storage, atomic use counting, expiry, revocation, the audit trail) comes with it.
 *
 * | | Device invite | Emailed invite |
 * |---|---|---|
 * | `MaxUses` | 1, rotated on every resume | host-configurable, 25 by default |
 * | `ExpiresAt` | min(CloseAt, now + 15d) | min(CloseAt, now + 30d) |
 * | `Email` | null — which is what keeps it out of the re-send match | the address it went to |
 *
 * REVOCATION IS BY RESOURCE, NOT BY TOKEN, and that is worth stating because the design originally
 * logged "core: revoke by token" as a follow-up it needed. It does not: every invite for a response
 * carries that response in `ResourceID`, so a `RunView` plus the minter's existing
 * `RevokeAnonymousInvite` retires all of them — with no core change, and with the ownership check
 * the minter already performs on each one.
 */
import { LogError, RunView, type UserInfo } from '@memberjunction/core';
import type { MJMagicLinkInviteEntity } from '@memberjunction/core-entities';
import { quoteSqlString } from '@mj-biz-apps/forms-entities';
import {
  MagicLinkMinterRegistry,
  getMagicLinkProvisioningConfig,
} from '@mj-biz-apps/forms-core-entities-server';

import { FORM_RESPONSE_ENTITY } from '../public-submit/entity-names';
import { hashToken } from './token.js';

/** Core's invite entity, by name. Read here, written only through the minter. */
const INVITE_ENTITY = 'MJ: Magic Link Invites';

/** Which channel an invite was minted for. The ONLY thing that differs after the redeem: nothing. */
export type ResumeChannel = 'device' | 'email';

/** What a mint produced. Flat, like every result type in this package. */
export interface ResumeInviteMint {
  ok: boolean;
  inviteId?: string;
  /** The RAW token. Goes to a cookie or an email body and NOWHERE else — never to a log or a result. */
  rawToken?: string;
  /** The expiry actually written, so a caller can size a cookie's Max-Age to it. */
  expiresAt?: Date;
  message?: string;
}

/** Everything a response-scoped mint needs. */
export interface ResumeInviteRequest {
  responseId: string;
  channel: ResumeChannel;
  /** Set for the email channel only. */
  email?: string;
  /** The link's own closing date, when it has one — the invite must never outlive its form. */
  closeAt?: Date | null;
  /** Lifetime for this channel, in days. */
  lifetimeDays: number;
  /** Redemptions allowed. 1 for a device invite, which is rotated on every resume. */
  maxUses: number;
}

/**
 * Mint an invite whose resource is one FormResponse.
 *
 * Never throws: a failed mint must not fail the save that triggered it. The respondent simply has
 * no same-device resume, and the reason goes to the log with the response id — never the token.
 */
export async function mintResponseInvite(
  request: ResumeInviteRequest,
  contextUser: UserInfo,
): Promise<ResumeInviteMint> {
  const minter = MagicLinkMinterRegistry.Instance.Minter;
  if (!minter) {
    return { ok: false, message: 'no magic-link minter is registered on this host' };
  }
  const config = getMagicLinkProvisioningConfig();
  const expiresAt = earliestExpiry(request.closeAt, request.lifetimeDays);
  const result = await minter.MintAnonymousInvite(
    {
      applicationName: config.applicationName,
      roleName: config.roleName,
      // The RESOURCE is the response, which is the whole design: redeeming this mints a session
      // whose scope names one row, and the row filters do the rest.
      resourceTypeName: FORM_RESPONSE_ENTITY,
      resourceId: request.responseId,
      maxUses: request.maxUses,
      expiresAt,
      email: request.channel === 'email' ? request.email : null,
    },
    contextUser,
  );
  if (!result.success || !result.rawToken) {
    LogError(`[Forms] resume invite mint failed for response ${request.responseId}: ${result.message ?? 'unknown'}`);
    return { ok: false, message: result.message };
  }
  return { ok: true, inviteId: result.inviteId, rawToken: result.rawToken, expiresAt };
}

/**
 * The instant an invite expires: the earlier of the link's own closing date and this channel's
 * lifetime.
 *
 * A credential must never outlive the form it opens — a token that still redeems into a closed
 * distribution is a bearer nobody can use and nobody has retired.
 */
export function earliestExpiry(closeAt: Date | null | undefined, lifetimeDays: number): Date {
  const byLifetime = new Date(Date.now() + lifetimeDays * 24 * 60 * 60 * 1000);
  if (!closeAt) {
    return byLifetime;
  }
  const close = closeAt instanceof Date ? closeAt : new Date(closeAt);
  if (Number.isNaN(close.getTime())) {
    return byLifetime;
  }
  return close.getTime() < byLifetime.getTime() ? close : byLifetime;
}

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
 */
export async function revokeResponseInvites(
  responseId: string,
  options: { deviceOnly: boolean },
  contextUser: UserInfo,
): Promise<RevokeSummary> {
  const minter = MagicLinkMinterRegistry.Instance.Minter;
  if (!minter || !responseId) {
    return { revoked: 0, failed: 0 };
  }
  const filter =
    `ResourceID=${quoteSqlString(responseId)} AND Status='Active'` +
    (options.deviceOnly ? ' AND Email IS NULL' : '');
  const found = await new RunView().RunView<MJMagicLinkInviteEntity>(
    { EntityName: INVITE_ENTITY, ExtraFilter: filter, Fields: ['ID'], ResultType: 'simple' },
    contextUser,
  );
  if (!found.Success) {
    LogError(`[Forms] could not list resume invites of response ${responseId}: ${found.ErrorMessage}`);
    return { revoked: 0, failed: 1 };
  }
  const summary: RevokeSummary = { revoked: 0, failed: 0 };
  for (const invite of found.Results) {
    const outcome = await minter.RevokeAnonymousInvite({ inviteId: invite.ID, resourceId: responseId }, contextUser);
    if (outcome.success) {
      summary.revoked += 1;
    } else {
      summary.failed += 1;
      LogError(`[Forms] could not revoke resume invite ${invite.ID} of response ${responseId}: ${outcome.message}`);
    }
  }
  return summary;
}

/** What a token lookup found. Ids only — the token itself never comes back out. */
export interface InviteByToken {
  ok: boolean;
  inviteId?: string;
  /** The response this token opens, so a caller can compare it to the one it holds. */
  resourceId?: string;
  status?: string;
}

/**
 * Find the invite a raw token belongs to, WITHOUT redeeming it.
 *
 * Matched on the SHA-256 hash, because that is all the database has — core stores only the hash,
 * and this is deliberately the same one-way comparison the redeem path performs. The raw token
 * never appears in the filter, so it cannot reach a query log.
 *
 * The one caller is the `/remember` guard, which has to answer "does the pointer this browser
 * already holds name a different draft?" without spending the pointer's single use.
 */
export async function findInviteByRawToken(
  rawToken: string,
  contextUser: UserInfo,
): Promise<InviteByToken> {
  if (!rawToken) {
    return { ok: true };
  }
  const found = await new RunView().RunView<MJMagicLinkInviteEntity>(
    {
      EntityName: INVITE_ENTITY,
      ExtraFilter: `TokenHash=${quoteSqlString(hashToken(rawToken))}`,
      Fields: ['ID', 'ResourceID', 'Status'],
      ResultType: 'simple',
      MaxRows: 1,
    },
    contextUser,
  );
  if (!found.Success) {
    LogError(`[Forms] resume invite lookup by token failed: ${found.ErrorMessage}`);
    return { ok: false };
  }
  const row = found.Results[0];
  return { ok: true, inviteId: row?.ID, resourceId: row?.ResourceID ?? undefined, status: row?.Status };
}
