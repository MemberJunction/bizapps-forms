/**
 * Forms home's data seam: the grid, the lifecycle verbs, and the three ways to start a form.
 *
 * Nothing here decides anything about a form. The grid is `../shared/form-catalog`; archive,
 * restore and "start from a saved template" are Remote Operations (`Forms.ArchiveForm`,
 * `Forms.RestoreForm`, `Forms.CreateFormFromTemplate`) whose rules live on the server, where an
 * Action or an agent gets the same answer (spec #303 §9); the brief and starter-template routes
 * stay Actions. What this adds is the one shape each surface wants back, so the dashboard reads
 * outcomes rather than three result conventions.
 */
import { Injectable } from '@angular/core';
import type { ActionParam } from '@memberjunction/actions-base';
import {
  FormsArchiveFormOperation,
  FormsCreateFormFromTemplateOperation,
  FormsRestoreFormOperation,
  type FormsCreateFormFromTemplateOutput,
  type FormsFormLifecycleOutput,
} from '@mj-biz-apps/forms-entities';
import { readFormListing } from '../shared/form-catalog';
import { runActionByName } from '../shared/authoring-actions';
import { runOperation, type OperationOutcome } from '../shared/remote-operation';
import { FORMS_ENTITY } from '../shared/entity-names';

import type { FormSummaryRow } from './home-models';
import { buildFormRows, readFormIdFromResult } from './home-aggregations';

/** What archiving or restoring writes: the form, and the share links archiving closes. */
const LIFECYCLE_WRITES = [FORMS_ENTITY.Form, FORMS_ENTITY.FormDistribution];

/** Outcome of running an authoring/template action. */
export interface AuthoringResult {
  success: boolean;
  formId: string | null;
  message: string;
}

@Injectable()
export class FormsHomeService {
  /** The Forms grid: every working form with its category and Complete-response count. */
  public async loadForms(): Promise<FormSummaryRow[]> {
    const listing = await readFormListing();
    return buildFormRows(listing.forms, listing.categories, listing.counts);
  }

  /**
   * Archive a form (`Closed`), closing every Active share link in the same transaction — the
   * offered stand-in for "delete", because a form that collected responses must keep them.
   */
  public archive(formId: string): Promise<OperationOutcome<FormsFormLifecycleOutput>> {
    return runOperation(new FormsArchiveFormOperation(), { FormID: formId }, `archiving form ${formId}`, LIFECYCLE_WRITES);
  }

  /**
   * Restore an archived form: back to `Published` when it has a published version, else `Draft`.
   * Its share links stay closed until someone reopens them, so restoring never silently puts a
   * public link back in front of respondents.
   */
  public restore(formId: string): Promise<OperationOutcome<FormsFormLifecycleOutput>> {
    return runOperation(new FormsRestoreFormOperation(), { FormID: formId }, `restoring form ${formId}`, LIFECYCLE_WRITES);
  }

  /** A new Draft form copied from a SAVED template, named `name`. */
  public createFromTemplate(
    templateFormId: string,
    name: string,
  ): Promise<OperationOutcome<FormsCreateFormFromTemplateOutput>> {
    return runOperation(
      new FormsCreateFormFromTemplateOperation(),
      { TemplateFormID: templateFormId, Name: name },
      `creating a form from template ${templateFormId}`,
      [FORMS_ENTITY.Form],
    );
  }

  /** Run an authoring/template Action by name and report the form it created. */
  public async runAuthoringAction(actionName: string, inputs: ActionParam[]): Promise<AuthoringResult> {
    const run = await runActionByName(actionName, inputs);
    if (!run.ok) {
      return { success: false, formId: null, message: run.message };
    }
    if (!run.result.Success) {
      return {
        success: false,
        formId: null,
        // A reason, not a headline: Forms home prefixes it with "The authoring action failed".
        message: run.result.Message || 'the action reported a failure with no error message',
      };
    }
    return { success: true, formId: readFormIdFromResult(run.result), message: run.result.Message || 'Form created.' };
  }
}
