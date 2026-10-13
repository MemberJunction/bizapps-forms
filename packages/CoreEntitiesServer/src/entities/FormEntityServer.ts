/**
 * Server-side `MJ_BizApps_Forms: Forms`: the status machine in `form-status-rules.ts`, enforced on
 * every write path, and the one cross-record consequence of a status change — archiving a form
 * closes its live distributions in the same transaction.
 *
 * Why the distributions close HERE rather than in whatever archives the form: archiving is the
 * statement "respondents can no longer reach this", and a distribution left `Active` under a
 * `Closed` form keeps a live magic-link credential for a form nobody is serving. Closing them is
 * not a separate step a caller may forget; it is what `Closed` means. Each distribution's own
 * subclass then withdraws its credential, as it does for any other close.
 */
import {
  BaseEntity,
  LogError,
  RunInEntityTransaction,
  RunView,
  type EntitySaveOptions,
  type IEntityDataProvider,
  type IRunViewProvider,
  type ValidationResult,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
  mjBizAppsFormsFormEntity,
  quoteSqlString,
  type mjBizAppsFormsFormDistributionEntity,
} from '@mj-biz-apps/forms-entities';
import { addViolations, refuse, refuseIfUnvalidated, storedValue, untrackedUpdateViolation } from './entity-refusal.js';
import {
  closesForm,
  formStatusViolations,
  needsPublishedVersionCheck,
  type FormStatus,
  type FormStatusWrite,
} from './form-status-rules.js';
import { FORM_VERSION_ENTITY_NAME } from './FormVersionEntityServer.js';
import { DISTRIBUTION_ENTITY_NAME } from '../magic-link/provision-runner.js';

export const FORM_ENTITY_NAME = 'MJ_BizApps_Forms: Forms';

/** Whether the row's provider also runs views — every server provider does. */
function runsViews(provider: IEntityDataProvider | undefined): provider is IEntityDataProvider & IRunViewProvider {
  return !!provider && 'RunView' in provider && typeof provider.RunView === 'function';
}

@RegisterClass(BaseEntity, FORM_ENTITY_NAME)
export class FormEntityServer extends mjBizAppsFormsFormEntity {
  /**
   * Set by the publishing engine on the instance it writes, and by nothing else. Required to move
   * a form from Draft to Published.
   *
   * TRANSIENT — not a column, so no wire format carries it (see `FormVersionEntityServer`).
   */
  public AuthorizedByEngine = false;

  public override get DefaultSkipAsyncValidation(): boolean {
    return false;
  }

  public override async ValidateAsync(): Promise<ValidationResult> {
    const result = await super.ValidateAsync();
    const untracked = untrackedUpdateViolation(this);
    if (untracked) {
      return addViolations(result, [untracked], (field) => this.GetFieldByName(field)?.Value);
    }
    const write = this.statusWrite();
    if (needsPublishedVersionCheck(write)) {
      write.publishedVersionExists = await this.hasPublishedVersion();
    }
    return addViolations(result, formStatusViolations(write), (field) => this.GetFieldByName(field)?.Value);
  }

  /**
   * Saves the form; when the save archives it, closes every `Active` distribution in the same
   * transaction, so the form and its links are never seen half-archived. A distribution that
   * cannot be closed rolls the archive back and refuses it, with that distribution named.
   */
  public override async Save(options?: EntitySaveOptions): Promise<boolean> {
    if (await refuseIfUnvalidated(this, options)) {
      return false;
    }
    if (!closesForm(this.statusWrite())) {
      return super.Save(options);
    }
    try {
      return await RunInEntityTransaction(this.ProviderToUse, async () => {
        if (!(await super.Save(options))) {
          return false;
        }
        await this.closeActiveDistributions();
        return true;
      });
    } catch (e) {
      const message =
        `Could not archive form ${this.ID}: ${e instanceof Error ? e.message : String(e)}. ` +
        `The archive was rolled back; the form and its links are unchanged.`;
      LogError(`[FormEntityServer] ${message}`);
      return refuse(this, 'update', message);
    }
  }

  private statusWrite(): FormStatusWrite {
    return {
      isNew: !this.IsSaved,
      storedStatus: storedValue<FormStatus>(this, 'Status'),
      status: this.Status,
      isTemplate: this.IsTemplate,
      authorizedByEngine: this.AuthorizedByEngine,
    };
  }

  /** Whether the form has a Published version; `undefined` when that could not be read. */
  private async hasPublishedVersion(): Promise<boolean | undefined> {
    const provider = this.ProviderToUse;
    if (!runsViews(provider)) {
      LogError(`[FormEntityServer] Form ${this.ID}: the provider cannot run views, so its versions cannot be read.`);
      return undefined;
    }
    const read = await new RunView(provider).RunView<{ ID: string }>(
      {
        EntityName: FORM_VERSION_ENTITY_NAME,
        ExtraFilter: `FormID=${quoteSqlString(this.ID)} AND Status='Published'`,
        Fields: ['ID'],
        ResultType: 'simple',
        MaxRows: 1,
        BypassCache: true,
      },
      this.ContextCurrentUser,
    );
    if (!read.Success) {
      LogError(`[FormEntityServer] Could not read the published version of form ${this.ID}: ${read.ErrorMessage}`);
      return undefined;
    }
    return read.Results.length > 0;
  }

  /** Close every Active distribution of this form, or throw naming the one that would not close. */
  private async closeActiveDistributions(): Promise<void> {
    const provider = this.ProviderToUse;
    if (!runsViews(provider)) {
      throw new Error('the provider cannot run views, so the form\'s distributions could not be read');
    }
    const read = await new RunView(provider).RunView<mjBizAppsFormsFormDistributionEntity>(
      {
        EntityName: DISTRIBUTION_ENTITY_NAME,
        ExtraFilter: `FormID=${quoteSqlString(this.ID)} AND Status='Active'`,
        ResultType: 'entity_object',
        BypassCache: true,
      },
      this.ContextCurrentUser,
    );
    if (!read.Success) {
      throw new Error(`its distributions could not be read (${read.ErrorMessage})`);
    }
    for (const distribution of read.Results) {
      distribution.Status = 'Closed';
      if (!(await distribution.Save())) {
        throw new Error(
          `distribution ${distribution.ID} could not be closed (${distribution.LatestResult?.CompleteMessage ?? 'no detail reported'})`,
        );
      }
    }
  }
}
