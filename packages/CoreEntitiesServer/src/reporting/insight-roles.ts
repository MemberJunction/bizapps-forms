/**
 * What kind of INSIGHT each question type yields — which section of the reporting summary a
 * question lands in, and which card renders it (#303 Task 9). Moved here from forms-ng's
 * `question-insight-roles.ts`, deleted in Task 10; the dashboard now receives each question's role
 * in the summary rather than deciding it.
 *
 * The contract's `analysisKindFor` says what an answer IS; this says what a reader can learn from a
 * thousand of them, and the two diverge on purpose:
 *  - IDENTITY (Email, Phone, Website, Address, ContactInfo) is personal data one by one and
 *    coverage in aggregate: counted into the respondent profile, never shown as values.
 *  - CONSENT (Checkbox, Legal) has YesNo's shape but reads as an acceptance rate.
 *  - TEMPORAL (Date, Time) is unanalysable by value and useful by period.
 *
 * It decides what LEAVES the server, so it is a privacy rule as much as a presentation one: a type
 * mapped to a charted role has its value distribution returned to the caller. That is why the table
 * is a total `Record` over the question types — a new type with no decided role is a compile error,
 * not a card that silently charts email addresses (which is how `Email` once reached the dashboard).
 */
import type { FormQuestionType } from '@mj-biz-apps/forms-entities';

/** How a question contributes to the summary. */
export type QuestionInsightRole =
  | 'choice'
  | 'scale'
  | 'sentiment'
  | 'consent'
  | 'identity'
  | 'openText'
  | 'attachment'
  | 'temporal'
  | 'composite'
  | 'none';

/** The roles whose answers are charted in the per-question breakdowns (`FormsQuestionBreakdown.Role`). */
export type ChartedRole = Extract<QuestionInsightRole, 'choice' | 'scale' | 'sentiment' | 'consent' | 'temporal' | 'composite'>;

export const QUESTION_INSIGHT_ROLE: Record<FormQuestionType, QuestionInsightRole> = {
  SingleChoice: 'choice',
  MultiChoice: 'choice',
  Dropdown: 'choice',
  PictureChoice: 'choice',
  // Charted as a distribution of selections, not a position-weighted rank aggregate.
  Ranking: 'choice',

  Number: 'scale',
  Rating: 'scale',
  NPS: 'scale',
  OpinionScale: 'scale',

  YesNo: 'sentiment',
  Checkbox: 'consent',
  Legal: 'consent',

  Email: 'identity',
  Phone: 'identity',
  Website: 'identity',
  Address: 'identity',
  ContactInfo: 'identity',

  // ShortText carries names and reference codes as often as opinions; neither text type is charted.
  ShortText: 'openText',
  LongText: 'openText',

  FileUpload: 'attachment',
  Doodle: 'attachment',

  Date: 'temporal',
  Time: 'temporal',

  // Charted as row x column cell counts, never as rendered answers.
  Matrix: 'composite',

  Statement: 'none',
};

/** The role of a question type; a type outside the table (a snapshot from a newer build) is a throw, not a guess. */
export function insightRoleFor(type: FormQuestionType): QuestionInsightRole {
  const role = QUESTION_INSIGHT_ROLE[type];
  if (!role) {
    throw new Error(`Unknown FormQuestionType: ${String(type)}`);
  }
  return role;
}

/** Whether a role's questions are charted in the per-question breakdowns. */
export function isChartedRole(role: QuestionInsightRole): role is ChartedRole {
  return role !== 'identity' && role !== 'attachment' && role !== 'openText' && role !== 'none';
}
