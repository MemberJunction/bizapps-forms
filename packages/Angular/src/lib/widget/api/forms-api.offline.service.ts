/**
 * The transport for a `<mj-form>` with no `api-url`: there is no server, so there is nothing to load
 * a form from and nowhere to save one.
 *
 * Two hosts land here. The builder's Preview hands the widget the author's full draft and never calls
 * the transport at all (`MjFormComponent` sends nothing for a `full` form), so it only needs SOMETHING
 * bound to the token. A real embed missing its `api-url` is a configuration gap, and it gets the one
 * fixed "not available" sentence with the reason in the console — never a demo form pretending to be
 * the author's.
 *
 * This replaced `FormsMockApiService` in the shipped bundle (#303 Task 10c fix round 1): the mock
 * served a projection built in the browser, which put the projection builder on every respondent's
 * phone for a path no respondent takes. The mock still exists for development, outside `<mj-form>`.
 */
import { Injectable } from '@angular/core';
import type { FormsSaveResponseInput, FormsSaveResponseOutput } from '@mj-biz-apps/forms-entities';

import {
  FormUnavailableError,
  ResponseNotSavedError,
  type IFormsApiService,
  type RespondentFormLoad,
} from './forms-api.interface';
import { generateClientResponseId } from '../core/client-id';

/** Why every call here fails — for the console. */
const NO_SERVER = 'this <mj-form> has no api-url attribute, so there is no server to talk to';

@Injectable()
export class FormsOfflineApiService implements IFormsApiService {
  private readonly sessionId = generateClientResponseId();

  public sessionCorrelator(): string {
    return this.sessionId;
  }

  public async loadRespondentForm(distributionSlug: string): Promise<RespondentFormLoad> {
    throw new FormUnavailableError(`Cannot load '${distributionSlug}': ${NO_SERVER}.`);
  }

  public async saveResponse(input: FormsSaveResponseInput): Promise<FormsSaveResponseOutput> {
    throw new ResponseNotSavedError(`Cannot save response ${input.ClientResponseID}: ${NO_SERVER}.`);
  }
}
