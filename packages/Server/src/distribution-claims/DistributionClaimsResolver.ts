/**
 * `FormDistributionClaims`: which of a form's share-link slugs other apps own (#292).
 *
 * An authenticated AUTHOR query, not a respondent one: errors reach the caller on purpose (see
 * `claims.service.ts`), so this is deliberately not wrapped in `respondentSafe`.
 * Discovered through the `*Resolver.{js,ts}` glob registered in `RESOLVER_PATHS` (`../index.ts`).
 */
import { Arg, Ctx, Query, Resolver } from 'type-graphql';
import { AppContext, GetReadOnlyProvider, ResolverBase } from '@memberjunction/server';
import type { UserInfo } from '@memberjunction/core';

import { defaultClaimsServiceDeps, loadFormDistributionClaims, toClaimsResultType } from './claims.service.js';
import { DistributionClaimsResultType } from './graphql-types.js';

@Resolver()
export class DistributionClaimsResolver extends ResolverBase {
  @Query(() => DistributionClaimsResultType)
  async FormDistributionClaims(
    @Arg('formId', () => String) formId: string,
    @Ctx() { providers, userPayload }: AppContext,
  ): Promise<DistributionClaimsResultType> {
    const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
    const deps = defaultClaimsServiceDeps(provider);
    const lookup = await loadFormDistributionClaims(deps, formId, this.requireUser(userPayload));
    return toClaimsResultType(lookup);
  }

  private requireUser(userPayload: AppContext['userPayload']): UserInfo {
    const user = this.GetUserFromPayload(userPayload);
    if (!user) {
      throw new Error('No active session for the share-link claims request.');
    }
    return user;
  }
}
