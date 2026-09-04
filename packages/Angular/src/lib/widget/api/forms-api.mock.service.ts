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

import type { IFormsApiService, PublishedFormLoad } from './forms-api.interface';
import { generateClientResponseId } from '../core/client-id';
import { buildMockForm } from './mock-form.data';

@Injectable()
export class FormsMockApiService implements IFormsApiService {
  /** Stable for the life of the mock, mirroring the real service's per-instance correlator. */
  private readonly sessionId = generateClientResponseId();

  public sessionCorrelator(): string {
    return this.sessionId;
  }

  public async loadPublishedForm(distributionSlug: string): Promise<PublishedFormLoad | null> {
    await this.simulateLatency();
    // Never a resume: the mock stands in for a standalone embed/preview with no server, and
    // resuming requires a magic-link session scoped to a stored response — which is exactly what
    // a mock cannot have. A demo that "resumed" would be fiction.
    return { definition: buildMockForm(distributionSlug) };
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
