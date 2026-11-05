/**
 * `Forms.OpenDistribution` — the server body of the CodeGen-emitted `FormsOpenDistributionOperation`. Opens a share link to responses (Status Active and IsActive); the provisioning hook issues it a credential on the way.
 * Shape: see `PublishFormServerOperation`.
 */
import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
  FormsOpenDistributionOperation,
  type FormsDistributionLinkOutput,
  type FormsDistributionVerbInput,
} from '@mj-biz-apps/forms-entities';
import { FormDistributionEngine } from '../engines/FormDistributionEngine.js';
import { requireDatabaseProvider } from '../shared/database-provider.js';
import { toDistributionLinkOutput } from './distribution-link-output.js';
import { authorizeDistributionAuthoring } from './form-authoring-authorization.js';
import { requireTextInput } from './operation-input.js';

@RegisterClass(BaseRemotableOperation, 'Forms.OpenDistribution')
export class OpenDistributionServerOperation extends FormsOpenDistributionOperation {
  protected override async Authorize(_input: FormsDistributionVerbInput, user: UserInfo): Promise<boolean> {
    return authorizeDistributionAuthoring(this.OperationKey, user, ['CanUpdate']);
  }

  protected override async InternalExecute(
    input: FormsDistributionVerbInput,
    provider: IMetadataProvider,
    user: UserInfo,
  ): Promise<FormsDistributionLinkOutput> {
    const distributionId = requireTextInput(input?.FormDistributionID, 'FormDistributionID', this.OperationKey);
    const database = requireDatabaseProvider(provider, this.OperationKey);
    return toDistributionLinkOutput(await FormDistributionEngine.Instance.Open(distributionId, database, user));
  }
}

/** Anti-tree-shake anchor: `LoadBizAppsFormsServer()` calls it so `@RegisterClass` above is kept. */
export function LoadOpenDistributionOperation(): void {
  // intentionally empty
}
