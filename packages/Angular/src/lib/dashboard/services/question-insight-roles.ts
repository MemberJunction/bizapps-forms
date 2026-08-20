/**
 * What kind of INSIGHT each question type yields — the dashboard's analytical taxonomy.
 *
 * The contract's `analysisKindFor` says what an answer IS (choice, numeric, text, composite).
 * That is the right question for a validator and the wrong one for an analyst, and reading it
 * as an analytical plan is what put four cards listing people's names and email addresses at
 * the top of the Insights view. `Email` is `analysis: 'text'`, so it rendered as free text —
 * a column of real addresses on a dashboard, which is both useless as analysis and a needless
 * exposure of personal data that the Responses view already shows properly.
 *
 * So this is a second, deliberately different mapping: not "what shape is this value" but
 * "what can a reader learn from a thousand of them". The two diverge in three places that
 * matter, and each is the reason a role exists:
 *
 *   - IDENTITY (Email, Phone, Website, Address, ContactInfo). Individually these are personal
 *     data; in aggregate they are COVERAGE and REACH — how many people can we contact, how
 *     many are distinct, which domains and countries did they come from. The values never
 *     reach the screen; the counts do. See `respondent-profile.ts`.
 *   - CONSENT (Checkbox, Legal). Identical in shape to YesNo — one boolean — but nobody reads
 *     a consent box as a fifty-fifty opinion split. The reading is an acceptance RATE, and it
 *     is usually a compliance question rather than a curiosity.
 *   - TEMPORAL (Date, Time). The contract calls these unanalysable because there is nothing
 *     to bucket by value. There is plenty to bucket by PERIOD, and "which month" or "what
 *     time of day" is often the whole point of asking.
 *
 * Everything here is presentation policy and belongs to the dashboard, exactly as the
 * contract's own comment says: "the contract says what the data is, and the dashboard decides
 * which card renders it."
 */
import type { FormQuestionType } from '@mj-biz-apps/forms-entities';

/**
 * How a question contributes to the report.
 *
 * This REPLACED `BreakdownKind`, rather than joining it. Two overlapping taxonomies over the
 * same types is how they drift apart, and the old one could not express the distinctions
 * above anyway.
 */
export type QuestionInsightRole =
  /** A distribution over named options — the bar-chart questions. */
  | 'choice'
  /** A number with a range: averages, spread, NPS. */
  | 'scale'
  /** A two-way opinion split (YesNo). */
  | 'sentiment'
  /** An acceptance rate (Checkbox, Legal) — read as compliance, not as opinion. */
  | 'consent'
  /** Who the respondent is. Counted and profiled, never displayed. */
  | 'identity'
  /** Written answers: response rate, typical length, recurring themes. */
  | 'openText'
  /** Something attached: an upload rate and a pointer to the file. */
  | 'attachment'
  /** A date or time, bucketed into periods. */
  | 'temporal'
  /** A structured answer with named parts (Matrix) — listed, not aggregated. */
  | 'composite'
  /** Collects nothing (Statement). */
  | 'none';

/**
 * Type to role, exhaustively.
 *
 * Typed as a total `Record<FormQuestionType, …>` on purpose, matching the builder's palette
 * catalog: adding a question type to the contract without deciding what it MEANS analytically
 * is a compile error here, not a card that silently renders as free text — which is precisely
 * how `Email` ended up printing addresses.
 */
export const QUESTION_INSIGHT_ROLE: Record<FormQuestionType, QuestionInsightRole> = {
  // Distributions over options.
  SingleChoice: 'choice',
  MultiChoice: 'choice',
  Dropdown: 'choice',
  PictureChoice: 'choice',
  // Ranking is `analysis: 'choice'` and its buckets do count option selections, so it charts
  // like one. It is not a true rank aggregation — that would weight by position — and it is
  // labelled as a distribution rather than pretending otherwise.
  Ranking: 'choice',

  // Numbers with a range.
  Number: 'scale',
  Rating: 'scale',
  NPS: 'scale',
  OpinionScale: 'scale',

  YesNo: 'sentiment',
  Checkbox: 'consent',
  Legal: 'consent',

  // Personal data. Aggregated into the respondent profile; never rendered as values.
  Email: 'identity',
  Phone: 'identity',
  Website: 'identity',
  Address: 'identity',
  ContactInfo: 'identity',

  // Written answers. ShortText carries names and reference codes as often as it carries
  // opinions, so neither spelling shows verbatims here — the Responses view does that, per
  // response, where the answer has a person attached and means something.
  ShortText: 'openText',
  LongText: 'openText',

  FileUpload: 'attachment',
  Signature: 'attachment',

  Date: 'temporal',
  Time: 'temporal',

  Matrix: 'composite',

  Statement: 'none',
};

/** What a question contributes to the report. */
export function insightRoleFor(type: FormQuestionType): QuestionInsightRole {
  const role = QUESTION_INSIGHT_ROLE[type];
  if (!role) {
    throw new Error(`Unknown FormQuestionType: ${String(type)}`);
  }
  return role;
}

/**
 * Which part of the Insights view a role appears in.
 *
 * The three sections answer three different questions — who reached us, what they chose, what
 * they wrote — and a question belongs to exactly one. Returning `'none'` means the question
 * contributes nothing and is omitted rather than rendered as an empty card.
 */
export type InsightSection = 'profile' | 'chart' | 'openText' | 'none';

export function insightSectionFor(role: QuestionInsightRole): InsightSection {
  switch (role) {
    case 'identity':
    case 'attachment':
      return 'profile';
    case 'openText':
      return 'openText';
    case 'none':
      return 'none';
    default:
      return 'chart';
  }
}

/** Whether a question's answers are charted in the "What they chose" section. */
export function isChartedRole(role: QuestionInsightRole): boolean {
  return insightSectionFor(role) === 'chart';
}
