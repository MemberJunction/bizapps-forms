/**
 * The authorized read behind the `FormDistributionClaims` query: may this caller see the form's
 * share links, which slugs are they, and which of those does another app own.
 *
 * Unlike the respondent-facing services, the caller here is an authenticated AUTHOR, so a refusal
 * or a failed read is thrown to them with the form id rather than flattened into an empty answer.
 * An empty `claims` list must only ever mean "nobody owns these slugs".
 */
import { GetGlobalObjectStore } from '@memberjunction/global';
import { Metadata, RunView, type RunViewParams, type RunViewResult, type UserInfo } from '@memberjunction/core';
import { quoteSqlString } from '@mj-biz-apps/forms-entities';

import { FORM_DISTRIBUTION_ENTITY } from '../public-submit/entity-names.js';
import type { ClaimFailure, ClaimLookup, DistributionClaimProvider } from './claim-contract.js';
import { findDistributionClaims, readClaimProviders } from './find-claims.js';
// Type-only on purpose: the class carries type-graphql decorators that need reflect-metadata at load,
// which only the server (and not this service's unit tests) provides. Plain objects satisfy it structurally.
import type { DistributionClaimsResultType } from './graphql-types.js';

export type SlugReadResult = { ok: true; slugs: string[] } | { ok: false; error: string };

/** Everything the lookup touches outside itself, so tests need no database or global store. */
export interface ClaimsServiceDeps {
  canUpdateDistributions(user: UserInfo): boolean;
  readSlugs(formId: string, user: UserInfo): Promise<SlugReadResult>;
  providers(): { providers: DistributionClaimProvider[]; failures: ClaimFailure[] };
}

/** The narrow RunView surface the slug read needs. */
export interface SlugRunView {
  RunView<T = unknown>(params: RunViewParams, contextUser?: UserInfo): Promise<RunViewResult<T>>;
}

/**
 * Resolve the claims for one form's own share-link slugs.
 * Checks, in order: formId present, caller may update share links, slugs readable.
 * Throws on any of those; provider trouble is reported in the result instead.
 */
export async function loadFormDistributionClaims(deps: ClaimsServiceDeps, formId: string, user: UserInfo): Promise<ClaimLookup> {
  if (formId.trim().length === 0) {
    throw new Error('formId is required to look up share-link claims.');
  }
  if (!deps.canUpdateDistributions(user)) {
    throw new Error(`Not allowed to read share-link claims for form ${formId}.`);
  }
  const read = await deps.readSlugs(formId, user);
  // `'error' in read` rather than `!read.ok`: with strictNullChecks off (this build) a boolean-literal
  // discriminant does not narrow, but `in` does.
  if ('error' in read) {
    throw new Error(`Could not read share links for form ${formId}: ${read.error}`);
  }
  const registry = deps.providers();
  const found = await findDistributionClaims(read.slugs, user, registry.providers);
  return { claims: found.claims, failures: [...registry.failures, ...found.failures] };
}

/** The default slug reader: the form's own non-null slugs, read under the CALLER's permissions. */
export function createSlugReader(runView: SlugRunView): ClaimsServiceDeps['readSlugs'] {
  return async (formId, user) => {
    const result = await runView.RunView<{ Slug: string }>(
      {
        EntityName: FORM_DISTRIBUTION_ENTITY,
        ExtraFilter: `FormID=${quoteSqlString(formId)} AND Slug IS NOT NULL`,
        Fields: ['Slug'],
        ResultType: 'simple',
      },
      user,
    );
    if (!result.Success) {
      return { ok: false, error: result.ErrorMessage || 'the view reported failure without a message' };
    }
    return { ok: true, slugs: result.Results.map((row) => row.Slug) };
  };
}

export function defaultClaimsServiceDeps(): ClaimsServiceDeps {
  return {
    canUpdateDistributions: (user) => new Metadata().EntityByName(FORM_DISTRIBUTION_ENTITY)?.GetUserPermisions(user).CanUpdate ?? false,
    readSlugs: createSlugReader(new RunView()),
    providers: () => readClaimProviders(GetGlobalObjectStore()),
  };
}

/** Map the lookup to the GraphQL shapes; `respondentUrl: null` stays `null`. */
export function toClaimsResultType(lookup: ClaimLookup): DistributionClaimsResultType {
  return {
    claims: lookup.claims.map((c) => ({ appName: c.appName, slug: c.slug, ownerLabel: c.ownerLabel, respondentUrl: c.respondentUrl })),
    failures: lookup.failures.map((f) => ({ appName: f.appName, message: f.message })),
  };
}
