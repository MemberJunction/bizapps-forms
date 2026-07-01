/**
 * Standalone mock S1 transport. Lets the widget build, render, and demo end-to-end
 * before WP-B's resolvers land — same {@link IFormsApiService} interface, so swapping
 * to {@link FormsGraphQLApiService} is a one-line provider change.
 *
 * The seeded form exercises every Phase-1 question type (§5.3), both choice + scale
 * styles, conditional show/hide (S2), and validation rules — so the demo doubles as a
 * visual smoke test.
 */
import { Injectable } from '@angular/core';
import type {
  PublishedFormDefinition,
  FormSubmissionInput,
  FormSubmissionResult,
} from '@mj-biz-apps/forms-entities';

import type { IFormsApiService } from './forms-api.interface';
import { buildMockForm } from './mock-form.data';

@Injectable()
export class FormsMockApiService implements IFormsApiService {
  public async loadPublishedForm(
    distributionSlug: string,
  ): Promise<PublishedFormDefinition | null> {
    await this.simulateLatency();
    return buildMockForm(distributionSlug);
  }

  public async submitResponse(
    input: FormSubmissionInput,
    existingResponseId?: string,
  ): Promise<FormSubmissionResult> {
    await this.simulateLatency();
    return {
      success: true,
      // Echo the client-supplied id back (it is the widget's stable idempotency key), falling
      // back to a minted id only if none was sent.
      responseId: existingResponseId ?? `mock-${Date.now().toString(36)}`,
      status: input.partial ? 'Partial' : 'Complete',
      confirmationMessage: input.partial
        ? 'Your progress has been saved.'
        : 'Thank you! Your response has been recorded.',
    };
  }

  /** Mimic network round-trip so loading + progress UI are exercised. */
  private simulateLatency(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 250));
  }
}
