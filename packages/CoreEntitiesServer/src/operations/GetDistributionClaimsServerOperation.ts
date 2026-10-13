/**
 * `Forms.GetDistributionClaims` — the server body of the CodeGen-emitted
 * `FormsGetDistributionClaimsOperation`. Which of a form's share-link slugs other installed apps own
 * (#292), and which claimant apps could not be consulted. Read-only. Shape: see
 * `PublishFormServerOperation`.
 *
 * Replaces the `FormDistributionClaims` GraphQL query (`DistributionClaimsResolver`, deleted). That
 * resolver required Update on Form Distributions, plus an API key's `view:run` scope on them; this
 * keeps the Update bar and adds the authoring rule every Forms operation applies (no anonymous or
 * magic-link session). The scope half has no equivalent here: `Authorize` sees only the user, and the
 * operation rows deliberately declare no `RequiredScope` (see the remote-operations metadata).
 */
import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
  FormsGetDistributionClaimsOperation,
  type FormsGetDistributionClaimsInput,
  type FormsGetDistributionClaimsOutput,
} from '@mj-biz-apps/forms-entities';
import { FormDistributionEngine } from '../engines/FormDistributionEngine.js';
import { requireDatabaseProvider } from '../shared/database-provider.js';
import { authorizeDistributionAuthoring } from './form-authoring-authorization.js';
import { requireTextInput } from './operation-input.js';

@RegisterClass(BaseRemotableOperation, 'Forms.GetDistributionClaims')
export class GetDistributionClaimsServerOperation extends FormsGetDistributionClaimsOperation {
  protected override async Authorize(_input: FormsGetDistributionClaimsInput, user: UserInfo): Promise<boolean> {
    return authorizeDistributionAuthoring(this.OperationKey, user, ['CanUpdate']);
  }

  protected override async InternalExecute(
    input: FormsGetDistributionClaimsInput,
    provider: IMetadataProvider,
    user: UserInfo,
  ): Promise<FormsGetDistributionClaimsOutput> {
    const formId = requireTextInput(input?.FormID, 'FormID', this.OperationKey);
    const database = requireDatabaseProvider(provider, this.OperationKey);
    const lookup = await FormDistributionEngine.Instance.GetClaims(formId, database, user);
    return {
      Claims: lookup.claims.map((claim) => ({
        AppName: claim.appName,
        Slug: claim.slug,
        OwnerLabel: claim.ownerLabel,
        RespondentURL: claim.respondentUrl,
      })),
      Failures: lookup.failures.map((failure) => ({ AppName: failure.appName, Message: failure.message })),
    };
  }
}

/** Anti-tree-shake anchor: `LoadBizAppsFormsServer()` calls it so `@RegisterClass` above is kept. */
export function LoadGetDistributionClaimsOperation(): void {
  // intentionally empty
}
