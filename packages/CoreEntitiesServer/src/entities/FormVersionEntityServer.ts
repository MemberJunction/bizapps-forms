/**
 * Server-side `MJ_BizApps_Forms: Form Versions`: a published version is immutable, and only the
 * publishing engine publishes or retires one. The rules and the reasons for them are in
 * `form-version-rules.ts`; this class only reads the row and enforces them on every write path.
 *
 * Where each half is enforced, and why there:
 *  - `ValidateAsync` (opted in by `DefaultSkipAsyncValidation`), which MJ runs inside `Save()` for
 *    every writer — GraphQL, `MJ.SaveEntityGraph`, actions, engines — before the row is written,
 *    unless the save options switch it off.
 *  - `Save()`, for the two saves MJ does not validate: `ReplayOnly`, and `SkipAsyncValidation: true`
 *    (see `refuseIfUnvalidated`).
 *  - `Delete()`, because MJ validates nothing on delete.
 */
import {
  BaseEntity,
  type EntityDeleteOptions,
  type EntitySaveOptions,
  type ValidationResult,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { mjBizAppsFormsFormVersionEntity } from '@mj-biz-apps/forms-entities';
import { FORMS_ENTITY } from '../shared/entity-names.js';
import {
  addViolations,
  changedFields,
  refuse,
  refuseIfUnvalidated,
  storedValue,
  untrackedUpdateViolation,
} from './entity-refusal.js';
import {
  FROZEN_VERSION_FIELDS,
  formVersionDeleteRefusal,
  formVersionWriteViolations,
  type FormVersionStatus,
} from './form-version-rules.js';

export const FORM_VERSION_ENTITY_NAME = FORMS_ENTITY.FormVersion;

@RegisterClass(BaseEntity, FORM_VERSION_ENTITY_NAME)
export class FormVersionEntityServer extends mjBizAppsFormsFormVersionEntity {
  /**
   * Set by the publishing engine on the instances it writes, and by nothing else.
   *
   * TRANSIENT — not a column. MJ moves only entity FIELDS across the wire: `SetMany` assigns
   * nothing that is not a field, and `MJ.SaveEntityGraph` serialises field values, so no client
   * can arrive with this set. A browser save always validates as an ordinary writer.
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
    const violations = formVersionWriteViolations({
      isNew: !this.IsSaved,
      storedStatus: storedValue<FormVersionStatus>(this, 'Status'),
      status: this.Status,
      changedFields: changedFields(this, FROZEN_VERSION_FIELDS),
      authorizedByEngine: this.AuthorizedByEngine,
    });
    return addViolations(result, violations, (field) => this.GetFieldByName(field)?.Value);
  }

  public override async Save(options?: EntitySaveOptions): Promise<boolean> {
    if (await refuseIfUnvalidated(this, options)) {
      return false;
    }
    return super.Save(options);
  }

  public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
    const refusal = formVersionDeleteRefusal(storedValue<FormVersionStatus>(this, 'Status') ?? this.Status);
    if (refusal) {
      return refuse(this, 'delete', refusal);
    }
    return super.Delete(options);
  }
}
