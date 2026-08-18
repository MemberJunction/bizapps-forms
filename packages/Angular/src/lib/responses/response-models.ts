/**
 * View-model types for the individual-response surface.
 *
 * Shared by all three mounts (reporting dashboard tab, builder tab, Form Response
 * entity-form override) — moved out of the dashboard's `reporting.model.ts` so that
 * nothing outside `lib/dashboard/` has to depend on the dashboard to render a response.
 * Nothing here is persisted; it is purely a read-model.
 */
import type { FormQuestionType } from '@mj-biz-apps/forms-entities';

/** A row in the individual-response list/grid. */
export interface ResponseListRow {
  responseId: string;
  status: 'Complete' | 'Partial';
  startedAt: Date | null;
  submittedAt: Date | null;
  respondent: string;
  answeredCount: number;
}

/** One labelled answer in the individual-response detail view. */
export interface ResponseAnswerView {
  questionId: string;
  prompt: string;
  type: FormQuestionType;
  /** Human-readable rendering of the answer. */
  displayValue: string;
}

/** The full individual-response detail view-model. */
export interface ResponseDetail {
  responseId: string;
  status: 'Complete' | 'Partial';
  startedAt: Date | null;
  submittedAt: Date | null;
  respondent: string;
  answers: ResponseAnswerView[];
}
