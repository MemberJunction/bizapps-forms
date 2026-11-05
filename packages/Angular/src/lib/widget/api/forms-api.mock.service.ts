/**
 * Development mock S1 transport. Same {@link IFormsApiService} interface, so swapping to
 * {@link FormsGraphQLApiService} is a one-line provider change for a host that wants a demo.
 *
 * NOT in the `<mj-form>` bundle: `formsWidgetProviders` binds {@link FormsOfflineApiService} when
 * there is no `api-url`, because serving a projection built here put the projection builder on every
 * respondent's phone (#303 Task 10c fix round 1). `scripts/widget-bundle-guard.mjs` fails
 * `build:widget` if this module or `mock-form.data.ts` is bundled again.
 *
 * The seeded form exercises every Phase-1 question type (§5.3), both choice + scale
 * styles, conditional show/hide (S2), and validation rules — so the demo doubles as a
 * visual smoke test. It is served the way the real server serves a form: as the respondent
 * PROJECTION (`toRespondentDefinition`), so the demo renders exactly what a respondent's browser
 * would receive, and every save answers as the server would for a form with no knockouts.
 *
 * The builder's Preview does NOT go through this service: it renders the author's full draft and
 * never sends anything anywhere (see `MjFormComponent`).
 */
import { Injectable } from '@angular/core';
import type { FormsSaveResponseInput, FormsSaveResponseOutput } from '@mj-biz-apps/forms-entities';
import { toRespondentDefinition } from '@mj-biz-apps/forms-entities/contracts';

import type { IFormsApiService, RespondentFormLoad } from './forms-api.interface';
import { generateClientResponseId } from '../core/client-id';
import { buildMockForm } from './mock-form.data';

@Injectable()
export class FormsMockApiService implements IFormsApiService {
  /** Stable for the life of the mock, mirroring the real service's per-instance correlator. */
  private readonly sessionId = generateClientResponseId();

  public sessionCorrelator(): string {
    return this.sessionId;
  }

  public async loadRespondentForm(distributionSlug: string): Promise<RespondentFormLoad> {
    await this.simulateLatency();
    // Never a resume: the mock stands in for a standalone embed with no server, and resuming
    // requires a magic-link session scoped to a stored response — which is exactly what a mock
    // cannot have. A demo that "resumed" would be fiction.
    const definition = toRespondentDefinition(buildMockForm(distributionSlug));
    return { formVersionId: definition.formVersionId, definition };
  }

  public async saveResponse(input: FormsSaveResponseInput): Promise<FormsSaveResponseOutput> {
    await this.simulateLatency();
    const final = input.Mode === 'final';
    return {
      Success: true,
      // Echo the client-supplied id back: the server adopts it as the row's primary key.
      ResponseID: input.ClientResponseID,
      Status: final ? 'Complete' : 'Partial',
      Outcome: final ? 'ended' : 'continue',
      ...(final ? { ConfirmationMessage: 'Thank you! Your response has been recorded.' } : {}),
      Errors: [],
    };
  }

  /** Mimic network round-trip so loading + progress UI are exercised. */
  private simulateLatency(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 250));
  }
}
