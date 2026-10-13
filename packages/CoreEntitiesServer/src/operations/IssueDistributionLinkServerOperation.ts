/**
 * `Forms.IssueDistributionLink` — the server body of the CodeGen-emitted
 * `FormsIssueDistributionLinkOperation`. Creates a share link for a form, open to responses; the slug,
 * its uniqueness retry and the credential all happen server-side (`FormDistributionEngine.Issue`).
 * Shape: see `PublishFormServerOperation`.
 *
 * Authorize asks for Create on Form Distributions as well as Update: the link is created, and the
 * provisioning hook then writes its credential back with an update save.
 */
import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
  FormsIssueDistributionLinkOperation,
  type FormsDistributionLinkOutput,
  type FormsIssueDistributionLinkInput,
} from '@mj-biz-apps/forms-entities';
import { FormDistributionEngine } from '../engines/FormDistributionEngine.js';
import { DISTRIBUTION_CHANNEL_TYPES } from '../magic-link/config.js';
import { requireDatabaseProvider } from '../shared/database-provider.js';
import { toDistributionLinkOutput } from './distribution-link-output.js';
import { authorizeDistributionAuthoring } from './form-authoring-authorization.js';
import {
  nullableInstantInput,
  nullablePositiveIntegerInput,
  optionalBooleanInput,
  optionalChoiceInput,
  optionalTextInput,
  requireTextInput,
} from './operation-input.js';

@RegisterClass(BaseRemotableOperation, 'Forms.IssueDistributionLink')
export class IssueDistributionLinkServerOperation extends FormsIssueDistributionLinkOperation {
  protected override async Authorize(_input: FormsIssueDistributionLinkInput, user: UserInfo): Promise<boolean> {
    return authorizeDistributionAuthoring(this.OperationKey, user, ['CanCreate', 'CanUpdate']);
  }

  protected override async InternalExecute(
    input: FormsIssueDistributionLinkInput,
    provider: IMetadataProvider,
    user: UserInfo,
  ): Promise<FormsDistributionLinkOutput> {
    const key = this.OperationKey;
    const request = {
      formId: requireTextInput(input?.FormID, 'FormID', key),
      // Optional: absent means the builder's default (PublicLink, the engine's DEFAULT_CHANNEL).
      channelType: optionalChoiceInput(input?.ChannelType, DISTRIBUTION_CHANNEL_TYPES, 'ChannelType', key),
      name: optionalTextInput(input?.Name, 'Name', key),
      slug: optionalTextInput(input?.Slug, 'Slug', key),
      maxResponses: nullablePositiveIntegerInput(input?.MaxResponses, 'MaxResponses', key),
      openAt: nullableInstantInput(input?.OpenAt, 'OpenAt', key),
      closeAt: nullableInstantInput(input?.CloseAt, 'CloseAt', key),
      captchaRequired: optionalBooleanInput(input?.CaptchaRequired, 'CaptchaRequired', key),
    };
    const database = requireDatabaseProvider(provider, key);
    return toDistributionLinkOutput(await FormDistributionEngine.Instance.Issue(request, database, user));
  }
}

/** Anti-tree-shake anchor: `LoadBizAppsFormsServer()` calls it so `@RegisterClass` above is kept. */
export function LoadIssueDistributionLinkOperation(): void {
  // intentionally empty
}
