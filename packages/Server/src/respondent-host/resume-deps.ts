/**
 * The real world, behind {@link DeviceResumeDeps} — the adapter the three resume routes run on.
 *
 * Kept apart from `device-resume.service.ts` on purpose. That file holds the decisions (guard
 * order, what clears a cookie, who may be given a pointer) and is pure; this one holds the wiring
 * (which entity, which principal, which URL) and is not testable without a server. Splitting them
 * is what let both review must-fixes be proven by unit tests.
 */
import { LogError, RunView, type UserInfo } from '@memberjunction/core';
import { quoteSqlString } from '@mj-biz-apps/forms-entities';
import type {
  mjBizAppsFormsFormDistributionEntityType,
  mjBizAppsFormsFormResponseEntityType,
} from '@mj-biz-apps/forms-entities';

import {
  findInviteByRawToken,
  mintResponseInvite,
  revokeResponseInvites,
} from '../magic-link/resume-invites.service';
import { distributionQuotaExceeded } from '../public-submit/quota.service';
import { distributionWindowRefusal } from '../public-submit/distribution-window';
import { FORM_DISTRIBUTION_ENTITY, FORM_RESPONSE_ENTITY } from '../public-submit/entity-names';
import { FormsRateLimiter } from '../public-submit/rate-limit.service';
import { deviceResumeAllowed, distributionOfResponse } from '../public-submit/resume-columns';
import { getRespondentHostConfig } from './config';
import type { DeviceResumeDeps, ResumeDistribution, ResumeResponseRow } from './device-resume.service';
import { redeemRawToken } from './redeem.service';
import { buildResumeCookie, clearResumeCookieHeader } from './resume-cookie';

/** What the adapter needs from the host: a principal for its reads, and the caller's identity. */
export interface ResumeDepsContext {
  /** The system user — these routes read responses, which the anonymous role cannot do freely. */
  systemUser: UserInfo;
  /** The distribution slug these routes are scoped to. */
  slug: string;
  /** A rate-limit key derived from the resolved peer, never from anything the caller chose. */
  callerKey: string;
}

/** Build the dependency set for one request. */
export function makeDeviceResumeDeps(ctx: ResumeDepsContext): DeviceResumeDeps {
  const config = getRespondentHostConfig();
  return {
    loadDistribution: (slug) => loadDistribution(slug, ctx.systemUser),
    loadResponse: (responseId) => loadResponse(responseId, ctx.systemUser),
    redeem: async (rawToken) => {
      const result = await redeemRawToken(
        { redeemUrl: config.magicLinkRedeemUrl, fetchImpl: fetch },
        rawToken,
      );
      if (!result || !result.success || !result.token) {
        return { ok: false, errorCode: result?.errorCode };
      }
      return { ok: true, token: result.token };
    },
    mint: async ({ responseId, closeAt }) => {
      const minted = await mintResponseInvite(
        {
          responseId,
          channel: 'device',
          closeAt,
          lifetimeDays: config.deviceResumeDays,
          // ONE use, rotated on every resume. That is what turns a stolen pointer into a visible
          // failure at the owner's next reopen rather than a silent, lasting read.
          maxUses: 1,
        },
        ctx.systemUser,
      );
      return { ok: minted.ok, rawToken: minted.rawToken, expiresAt: minted.expiresAt };
    },
    revoke: async ({ responseId, deviceOnly }) => {
      await revokeResponseInvites(responseId, { deviceOnly }, ctx.systemUser);
    },
    inviteFor: async (rawToken) => {
      const found = await findInviteByRawToken(rawToken, ctx.systemUser);
      return { ok: found.ok, resourceId: found.resourceId };
    },
    scopeOf: readScopeClaim,
    allowRequest: (key) => FormsRateLimiter.Instance.charge([{ key, max: RESUME_RATE_MAX }]).allowed,
    cookieFor: (token, maxAgeSeconds) =>
      buildResumeCookie({ token, slug: ctx.slug, maxAgeSeconds, secure: config.resumeCookieSecure }),
    clearCookie: () => clearResumeCookieHeader(ctx.slug, config.resumeCookieSecure),
    callerKey: ctx.callerKey,
  };
}

/**
 * Requests per window, per caller, across the resume routes.
 *
 * Sized for a real respondent rather than for an attacker's convenience: reopening a form, saving a
 * draft and starting over are all things a person does a handful of times, and each one mints or
 * spends a row in core's invite table. The window itself is the submit pipeline's.
 */
const RESUME_RATE_MAX = 30;

/** The distribution behind a slug, judged by the SAME predicates the page route uses. */
async function loadDistribution(slug: string, contextUser: UserInfo): Promise<ResumeDistribution | undefined> {
  const result = await new RunView().RunView<mjBizAppsFormsFormDistributionEntityType>(
    {
      EntityName: FORM_DISTRIBUTION_ENTITY,
      ExtraFilter: `Slug=${quoteSqlString(slug)}`,
      ResultType: 'simple',
      MaxRows: 1,
    },
    contextUser,
  );
  if (!result.Success) {
    LogError(`[Forms] resume routes could not read distribution '${slug}': ${result.ErrorMessage}`);
    return undefined;
  }
  const row = result.Results[0];
  if (!row) {
    return undefined;
  }
  const window = distributionWindowRefusal(row, new Date());
  return {
    id: row.ID,
    // BOTH switches: the operator's host-wide one and the owner's per-link one. The per-link read
    // is the CodeGen-blocked seam, which answers false until the migration lands — so device resume
    // is inactive rather than silently ignoring an owner who turned it off.
    allowDeviceResume: getRespondentHostConfig().deviceResumeEnabled && deviceResumeAllowed(row),
    // The door's own reasons, not a second spelling of them. A link that cannot be opened cannot be
    // resumed into either, and finding that out here costs no redeem.
    doorRefusal: window ?? (distributionQuotaExceeded(row) ? 'distribution-full' : undefined),
    closeAt: row.CloseAt ? new Date(row.CloseAt) : null,
  };
}

/** One stored response, for the `/remember` ownership checks. */
async function loadResponse(responseId: string, contextUser: UserInfo): Promise<ResumeResponseRow | undefined> {
  const result = await new RunView().RunView<mjBizAppsFormsFormResponseEntityType>(
    {
      EntityName: FORM_RESPONSE_ENTITY,
      ExtraFilter: `ID=${quoteSqlString(responseId)}`,
      ResultType: 'simple',
      MaxRows: 1,
    },
    contextUser,
  );
  if (!result.Success) {
    LogError(`[Forms] resume routes could not read response ${responseId}: ${result.ErrorMessage}`);
    return undefined;
  }
  const row = result.Results[0];
  if (!row) {
    return undefined;
  }
  return {
    id: row.ID,
    status: row.Status,
    anonymousSessionId: row.AnonymousSessionID,
    formDistributionId: distributionOfResponse(row),
  };
}

/**
 * The response a freshly-minted session JWT is scoped to.
 *
 * Reads the payload WITHOUT verifying the signature, and that is safe here for one specific reason:
 * this token is not something a caller presented to us. Core minted it, over loopback, in response
 * to the redeem we just performed, and it goes straight back out to the browser. Nothing is
 * authorized on the basis of what this function returns — it only decides which response to mint
 * the NEXT pointer for, and a wrong answer there produces a pointer that resolves to nothing.
 *
 * Verifying it would mean holding core's signing key in this package, which is a far larger thing
 * to own than reading a claim off a token we watched being made.
 */
function readScopeClaim(sessionToken: string): string | undefined {
  try {
    const payload = sessionToken.split('.')[1];
    if (!payload) {
      return undefined;
    }
    const decoded: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof decoded !== 'object' || decoded === null) {
      return undefined;
    }
    const scopes = (decoded as { mj_scopes?: unknown }).mj_scopes;
    if (!Array.isArray(scopes) || scopes.length === 0) {
      return undefined;
    }
    const first = scopes[0] as { resourceId?: unknown };
    return typeof first?.resourceId === 'string' ? first.resourceId : undefined;
  } catch {
    return undefined;
  }
}
