/**
 * What the ONE untyped scope claim names.
 *
 * `mj_scopes[].resourceId` carries a distribution id for a public link, a `FormResponse` id for a
 * resume link, and — once #137 lands — a `FormDistributionRecipient` id, all in one claim, because
 * the pinned core's `RedeemInvite` passes only `resourceId` and never populates `ResourceType`.
 * Three kinds of id arrive through one field and the server has to dispatch on them.
 *
 * RESOLVED IN A FIXED ORDER rather than by type, and the order is chosen so the ordinary public
 * path pays nothing: the distribution id is already in hand from the definition load, so a
 * public-link session is settled by a string comparison and never reaches the database. Only a
 * claim that is NOT this distribution costs one narrow read. A claim that is neither (a #137
 * recipient id, an id from a deleted row) misses, and the request behaves exactly as it does today.
 *
 * All three ids are UUID primary keys of different tables, so the order is CORRECT rather than
 * merely convenient — no value can be both. It is still a second spelling of a rule core could tell
 * us directly: when core learns to populate `ResourceType` from the invite's existing
 * `ResourceTypeID` column, this collapses into a switch and the read disappears. That is a logged
 * follow-up, not a blocker, and this is the one place it has to change.
 */
import type { UserInfo } from '@memberjunction/core';

import type { DefinitionRunViewProvider } from './definition-loader.service';
import { findScopedResponse } from './response-lookup.service';

/**
 * Whether this session is an ordinary public-link session for the distribution being submitted to.
 *
 * Case-folded because the two sides spell a GUID differently: MJ mints the invite's `ResourceID`
 * client-side (lowercase) and SQL Server returns the distribution's `ID` uppercased. A
 * case-sensitive comparison would classify EVERY public-link session as a candidate response id and
 * buy a wasted read per submission — and, worse, would make the resume branch look reachable from a
 * public link.
 */
export function scopeNamesDistribution(scopeResourceId: string | undefined, distributionId: string): boolean {
  const scope = (scopeResourceId ?? '').trim().toLowerCase();
  return scope !== '' && scope === (distributionId ?? '').trim().toLowerCase();
}

/** The outcome of asking what the claim named. Flat, like every result type in this package. */
export interface ScopedResponseResult {
  /** False only when the lookup itself failed — never for "the claim named something else". */
  ok: boolean;
  /** The response this session may act on, when the claim named one. */
  responseId?: string;
}

/**
 * Resolve the session's scope claim to the response it names, or to nothing.
 *
 * FAILS SOFT on a lookup error, and that is safe rather than convenient: with no scope the caller
 * is treated as an ordinary public-link session, which creates a fresh row rather than adopting an
 * unverified one. The WRITE gate is unchanged either way — `responseIsOurs` still refuses a foreign
 * row — so the worst outcome of a failed read here is a second draft, not a disclosure.
 *
 * Runs under the ELEVATED principal, like every other response lookup in the pipeline: the
 * anonymous respondent's read grant is row-filtered to their own response, and using it here would
 * make the dispatch depend on the very scope it is trying to establish.
 */
export async function resolveScopedResponseId(
  provider: DefinitionRunViewProvider,
  args: { scopeResourceId?: string; distributionId: string },
  contextUser: UserInfo,
): Promise<ScopedResponseResult> {
  const scope = (args.scopeResourceId ?? '').trim();
  if (scope === '' || scopeNamesDistribution(scope, args.distributionId)) {
    return { ok: true };
  }
  const found = await findScopedResponse(provider, { responseId: scope }, contextUser);
  if (!found.ok) {
    return { ok: false };
  }
  return { ok: true, responseId: found.response?.ID };
}
