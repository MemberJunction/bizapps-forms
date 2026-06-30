/**
 * Pure aggregation helpers for the Forms reporting dashboard (WP-F).
 *
 * Deliberately free of Angular / RunView so they are trivially unit-testable:
 * each takes already-fetched rows + the published snapshot and returns a piece
 * of the `FormReportData` read-model. The service layer does the I/O.
 */
import type {
  mjBizAppsFormsFormResponseEntityType,
  mjBizAppsFormsFormResponseAnswerEntityType,
  PublishedFormDefinition,
  PublishedFormQuestion,
  FormQuestionType,
} from '@mj-biz-apps/forms-entities';
import type {
  FormSummaryStats,
  QuestionBreakdown,
  BreakdownKind,
  DistributionBucket,
  NumericAggregate,
  FunnelStep,
  ResponseListRow,
  ResponseDetail,
  ResponseAnswerView,
} from '../models/reporting.model';

type ResponseRow = mjBizAppsFormsFormResponseEntityType;
type AnswerRow = mjBizAppsFormsFormResponseAnswerEntityType;

/** Max free-text answers surfaced in a breakdown card before truncation. */
const FREE_TEXT_CAP = 200;

/** Question types whose answers are visualised as a choice distribution. */
const CHOICE_TYPES: ReadonlySet<FormQuestionType> = new Set([
  'SingleChoice',
  'MultiChoice',
  'Dropdown',
]);

/** Question types aggregated numerically. */
const NUMERIC_TYPES: ReadonlySet<FormQuestionType> = new Set([
  'Number',
  'Rating',
  'NPS',
]);

/** Free-text-style types listed verbatim. */
const TEXT_TYPES: ReadonlySet<FormQuestionType> = new Set([
  'ShortText',
  'LongText',
  'Email',
  'Phone',
]);

/** Flattens a definition's pages into questions in page/display order. */
export function flattenQuestions(def: PublishedFormDefinition): PublishedFormQuestion[] {
  const out: PublishedFormQuestion[] = [];
  const pages = [...def.pages].sort((a, b) => a.displayOrder - b.displayOrder);
  for (const p of pages) {
    const qs = [...p.questions].sort((a, b) => a.displayOrder - b.displayOrder);
    out.push(...qs);
  }
  return out;
}

/** Maps a question type to the breakdown visualisation kind. */
export function breakdownKindFor(type: FormQuestionType): BreakdownKind {
  if (type === 'YesNo') return 'boolean';
  if (CHOICE_TYPES.has(type)) return 'distribution';
  if (NUMERIC_TYPES.has(type)) return 'numeric';
  return 'freeText';
}

/** Builds top-line summary stats from response rows. */
export function buildSummary(responses: ResponseRow[]): FormSummaryStats {
  const total = responses.length;
  let complete = 0;
  let durationSum = 0;
  let durationCount = 0;
  let lastSubmitted: Date | null = null;

  for (const r of responses) {
    if (r.Status === 'Complete') {
      complete++;
      const submitted = toDate(r.SubmittedAt);
      const started = toDate(r.StartedAt);
      if (submitted && started) {
        const secs = (submitted.getTime() - started.getTime()) / 1000;
        if (secs >= 0) {
          durationSum += secs;
          durationCount++;
        }
      }
      if (submitted && (!lastSubmitted || submitted > lastSubmitted)) {
        lastSubmitted = submitted;
      }
    }
  }

  return {
    totalResponses: total,
    completeResponses: complete,
    partialResponses: total - complete,
    completionRate: total > 0 ? complete / total : 0,
    averageCompletionSeconds: durationCount > 0 ? durationSum / durationCount : null,
    lastSubmittedAt: lastSubmitted,
  };
}

/** Builds per-question breakdowns. */
export function buildBreakdowns(
  questions: PublishedFormQuestion[],
  answers: AnswerRow[],
): QuestionBreakdown[] {
  const byQuestion = groupBy(answers, (a) => a.QuestionID);

  return questions
    .filter((q) => q.type !== 'Statement') // display-only, nothing to aggregate
    .map((q) => {
      const qAnswers = byQuestion.get(q.id) ?? [];
      const kind = breakdownKindFor(q.type);
      const base: QuestionBreakdown = {
        questionId: q.id,
        prompt: q.prompt,
        type: q.type,
        kind,
        answeredCount: qAnswers.length,
        buckets: [],
        numeric: null,
        textAnswers: [],
      };
      switch (kind) {
        case 'distribution':
          base.buckets = choiceBuckets(q, qAnswers);
          break;
        case 'boolean':
          base.buckets = booleanBuckets(qAnswers);
          break;
        case 'numeric':
          base.numeric = numericAggregate(q.type, qAnswers);
          break;
        case 'freeText':
          base.textAnswers = qAnswers
            .map((a) => (a.TextValue ?? '').trim())
            .filter((t) => t.length > 0)
            .slice(0, FREE_TEXT_CAP);
          break;
      }
      return base;
    });
}

/** Distribution buckets for choice questions, seeded from the option list. */
function choiceBuckets(
  question: PublishedFormQuestion,
  answers: AnswerRow[],
): DistributionBucket[] {
  const counts = new Map<string, number>();
  const labelByValue = new Map<string, string>();
  for (const opt of question.options) {
    counts.set(opt.value, 0);
    labelByValue.set(opt.value, opt.label);
  }

  let totalSelections = 0;
  for (const a of answers) {
    for (const value of extractChoiceValues(a)) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
      if (!labelByValue.has(value)) {
        labelByValue.set(value, value); // value not in option list (legacy/free)
      }
      totalSelections++;
    }
  }

  const buckets: DistributionBucket[] = [];
  for (const [value, count] of counts) {
    buckets.push({
      label: labelByValue.get(value) ?? value,
      count,
      fraction: totalSelections > 0 ? count / totalSelections : 0,
    });
  }
  return buckets.sort((a, b) => b.count - a.count);
}

/** Extracts selected values from an answer (single value or multi JSON array). */
function extractChoiceValues(a: AnswerRow): string[] {
  if (a.JSONValue) {
    try {
      const parsed: unknown = JSON.parse(a.JSONValue);
      if (Array.isArray(parsed)) {
        return parsed.map((v) => String(v));
      }
    } catch {
      // fall through to TextValue
    }
  }
  if (a.TextValue !== null && a.TextValue !== undefined && a.TextValue !== '') {
    return [a.TextValue];
  }
  return [];
}

/** Yes/No distribution. */
function booleanBuckets(answers: AnswerRow[]): DistributionBucket[] {
  let yes = 0;
  let no = 0;
  for (const a of answers) {
    if (a.BooleanValue === true) yes++;
    else if (a.BooleanValue === false) no++;
  }
  const total = yes + no;
  return [
    { label: 'Yes', count: yes, fraction: total > 0 ? yes / total : 0 },
    { label: 'No', count: no, fraction: total > 0 ? no / total : 0 },
  ];
}

/** Numeric aggregate, with NPS scoring when applicable. */
function numericAggregate(type: FormQuestionType, answers: AnswerRow[]): NumericAggregate {
  const values: number[] = [];
  for (const a of answers) {
    if (a.NumericValue !== null && a.NumericValue !== undefined) {
      values.push(a.NumericValue);
    }
  }
  const answered = values.length;
  if (answered === 0) {
    return { answered: 0, min: null, max: null, average: null, npsScore: null };
  }

  let min = values[0];
  let max = values[0];
  let sum = 0;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }

  const agg: NumericAggregate = {
    answered,
    min,
    max,
    average: sum / answered,
    npsScore: null,
  };

  if (type === 'NPS') {
    let detractors = 0;
    let passives = 0;
    let promoters = 0;
    for (const v of values) {
      if (v <= 6) detractors++;
      else if (v <= 8) passives++;
      else promoters++;
    }
    agg.npsSegments = { detractors, passives, promoters };
    agg.npsScore = Math.round(((promoters - detractors) / answered) * 100);
  }

  return agg;
}

/** Builds the page completion / drop-off funnel. */
export function buildFunnel(
  def: PublishedFormDefinition,
  answers: AnswerRow[],
): FunnelStep[] {
  const answeredQuestionByResponse = new Map<string, Set<string>>();
  for (const a of answers) {
    let set = answeredQuestionByResponse.get(a.ResponseID);
    if (!set) {
      set = new Set<string>();
      answeredQuestionByResponse.set(a.ResponseID, set);
    }
    set.add(a.QuestionID);
  }

  const pages = [...def.pages].sort((a, b) => a.displayOrder - b.displayOrder);
  const steps: FunnelStep[] = [];
  let firstReached = 0;
  let prevReached = 0;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const pageQuestionIds = new Set(page.questions.map((q) => q.id));
    let reached = 0;
    for (const answered of answeredQuestionByResponse.values()) {
      if (hasIntersection(answered, pageQuestionIds)) {
        reached++;
      }
    }
    if (i === 0) {
      firstReached = reached;
    }
    steps.push({
      pageId: page.id,
      title: page.title || `Page ${i + 1}`,
      displayOrder: page.displayOrder,
      reached,
      retention: firstReached > 0 ? reached / firstReached : 0,
      dropOff: prevReached > 0 ? Math.max(0, (prevReached - reached) / prevReached) : 0,
    });
    prevReached = reached;
  }

  return steps;
}

/** Builds the response-list rows. */
export function buildResponseRows(
  responses: ResponseRow[],
  answers: AnswerRow[],
): ResponseListRow[] {
  const answerCountByResponse = new Map<string, number>();
  for (const a of answers) {
    answerCountByResponse.set(a.ResponseID, (answerCountByResponse.get(a.ResponseID) ?? 0) + 1);
  }
  return responses.map((r) => ({
    responseId: r.ID,
    status: r.Status,
    startedAt: toDate(r.StartedAt),
    submittedAt: toDate(r.SubmittedAt),
    respondent: respondentLabel(r),
    answeredCount: answerCountByResponse.get(r.ID) ?? 0,
  }));
}

/** Builds a single response detail with labelled answers. */
export function buildResponseDetail(
  response: ResponseRow,
  answers: AnswerRow[],
  questions: PublishedFormQuestion[],
): ResponseDetail {
  const questionById = new Map(questions.map((q) => [q.id, q]));
  const answerViews: ResponseAnswerView[] = [];
  for (const a of answers) {
    const q = questionById.get(a.QuestionID);
    if (!q || q.type === 'Statement') {
      continue;
    }
    answerViews.push({
      questionId: q.id,
      prompt: q.prompt,
      type: q.type,
      displayValue: renderAnswer(q, a),
    });
  }
  return {
    responseId: response.ID,
    status: response.Status,
    startedAt: toDate(response.StartedAt),
    submittedAt: toDate(response.SubmittedAt),
    respondent: respondentLabel(response),
    answers: answerViews,
  };
}

/** Renders an answer to a human-readable string, label-mapping choices. */
export function renderAnswer(q: PublishedFormQuestion, a: AnswerRow): string {
  if (q.type === 'YesNo') {
    return a.BooleanValue === true ? 'Yes' : a.BooleanValue === false ? 'No' : '';
  }
  if (CHOICE_TYPES.has(q.type)) {
    const labelByValue = new Map(q.options.map((o) => [o.value, o.label]));
    return extractChoiceValues(a)
      .map((v) => labelByValue.get(v) ?? v)
      .join(', ');
  }
  if (NUMERIC_TYPES.has(q.type)) {
    return a.NumericValue !== null && a.NumericValue !== undefined ? String(a.NumericValue) : '';
  }
  if (q.type === 'Date' || q.type === 'Time') {
    const d = toDate(a.DateValue);
    return d ? d.toISOString() : '';
  }
  if (q.type === 'FileUpload') {
    return a.FileID ? `File: ${a.FileID}` : '';
  }
  if (TEXT_TYPES.has(q.type)) {
    return a.TextValue ?? '';
  }
  return a.TextValue ?? a.JSONValue ?? '';
}

/** Respondent display label: person name, else anonymous session marker. */
function respondentLabel(r: ResponseRow): string {
  if (r.RespondentPerson) return r.RespondentPerson;
  if (r.AnonymousSessionID) return 'Anonymous';
  return 'Anonymous';
}

/** Coerces a possibly-string datetime into a Date, or null. */
function toDate(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const arr = map.get(k);
    if (arr) arr.push(item);
    else map.set(k, [item]);
  }
  return map;
}

function hasIntersection(a: Set<string>, b: Set<string>): boolean {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const v of small) {
    if (large.has(v)) return true;
  }
  return false;
}
