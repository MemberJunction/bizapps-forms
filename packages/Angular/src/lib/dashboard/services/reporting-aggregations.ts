/**
 * Pure aggregation helpers for the Forms reporting dashboard (WP-F).
 *
 * Deliberately free of Angular / RunView so they are trivially unit-testable:
 * each takes already-fetched rows + the published snapshot and returns a piece
 * of the `FormReportData` read-model. The service layer does the I/O.
 *
 * The per-RESPONSE builders (`buildResponseRows` / `buildResponseDetail`) live in
 * `lib/responses/response-aggregations.ts` — they are shared by three mounts, only one of
 * which is this dashboard. Answer-value extraction and rendering are shared primitives in
 * `lib/shared/answer-values.ts`; this file consumes them rather than owning a second copy.
 */
import type {
  mjBizAppsFormsFormResponseEntityType,
  mjBizAppsFormsFormResponseAnswerEntityType,
  PublishedFormDefinition,
  PublishedFormQuestion,
  FormQuestionType,
} from '@mj-biz-apps/forms-entities';
import { isAnswerableQuestionType } from '@mj-biz-apps/forms-entities';
import type {
  FormSummaryStats,
  QuestionBreakdown,
  DistributionBucket,
  NumericAggregate,
  FunnelStep,
} from '../models/reporting.model';
import { insightRoleFor, isChartedRole } from './question-insight-roles';
import { temporalBuckets } from './temporal-buckets';
import { extractChoiceValues, renderAnswer } from '../../shared/answer-values';
import { toDate } from '../../shared/runview-dates';

type ResponseRow = mjBizAppsFormsFormResponseEntityType;
type AnswerRow = mjBizAppsFormsFormResponseAnswerEntityType;

/** Max free-text answers surfaced in a breakdown card before truncation. */
const FREE_TEXT_CAP = 200;

/**
 * The longest gap between StartedAt and SubmittedAt that is credible as one sitting.
 *
 * Beyond this the pair is not a duration, it is a broken `StartedAt` — an epoch default, a
 * resumed draft, a row migrated without its start time. Including such a pair does not make
 * the figure slightly wrong; it makes it wrong by orders of magnitude, and it is reported
 * under a label claiming to say how long the form takes to fill in.
 *
 * A day is deliberately generous. Nobody spends eight hours on a form, so anything this
 * check discards was never a real session, and a genuine long-but-plausible fill is kept.
 */
const PLAUSIBLE_SESSION_SECONDS = 24 * 60 * 60;

/**
 * Builds top-line summary stats from response rows.
 *
 * The HEADLINE `totalResponses` counts COMPLETE responses only — a Partial row is an
 * in-progress autosave, not a submitted response, and must never inflate the count a form
 * owner sees. `partialResponses` still surfaces the in-progress count separately, and
 * `completionRate` is complete / (complete + partial) so the drop-off signal is preserved.
 */
export function buildSummary(responses: ResponseRow[]): FormSummaryStats {
  let complete = 0;
  let partial = 0;
  const durations: number[] = [];
  let lastSubmitted: Date | null = null;

  for (const r of responses) {
    if (r.Status !== 'Complete') {
      partial++;
      continue;
    }
    complete++;
    const submitted = toDate(r.SubmittedAt);
    const started = toDate(r.StartedAt);
    if (submitted && started) {
      const secs = (submitted.getTime() - started.getTime()) / 1000;
      if (secs >= 0 && secs <= PLAUSIBLE_SESSION_SECONDS) {
        durations.push(secs);
      }
    }
    if (submitted && (!lastSubmitted || submitted > lastSubmitted)) {
      lastSubmitted = submitted;
    }
  }

  const started = complete + partial;
  return {
    // Headline count is Complete-only (Partials are in-progress, not responses).
    totalResponses: complete,
    completeResponses: complete,
    partialResponses: partial,
    // Completion rate keeps the started (complete + partial) denominator as the drop-off signal.
    completionRate: started > 0 ? complete / started : 0,
    typicalCompletionSeconds: median(durations),
    lastSubmittedAt: lastSubmitted,
  };
}

/**
 * The middle value of a sample, or null when there is no sample.
 *
 * Averaging is what this replaces. Fill times are heavily right-skewed even in clean data —
 * most people take two minutes and one leaves the tab open over lunch — so the mean answers
 * a question nobody asked. The median is what "typical" means.
 */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Builds the charted breakdowns — and ONLY the charted ones.
 *
 * Questions whose role is identity, attachment or written answer are dropped here rather than
 * being given a card that cannot say anything true about them. They are not lost: the report
 * builds `RespondentProfile` and `OpenTextInsight[]` from exactly the questions this filter
 * removes, so every answerable question is still accounted for somewhere in the view.
 */
export function buildBreakdowns(
  questions: PublishedFormQuestion[],
  answers: AnswerRow[],
): QuestionBreakdown[] {
  const byQuestion = groupBy(answers, (a) => a.QuestionID);

  return questions
    .filter((q) => isAnswerableQuestionType(q.type)) // display-only types collect no answer
    .filter((q) => isChartedRole(insightRoleFor(q.type)))
    .map((q) => {
      const qAnswers = byQuestion.get(q.id) ?? [];
      const role = insightRoleFor(q.type);
      const base: QuestionBreakdown = {
        questionId: q.id,
        prompt: q.prompt,
        type: q.type,
        role,
        answeredCount: qAnswers.length,
        buckets: [],
        numeric: null,
        textAnswers: [],
      };
      switch (role) {
        case 'choice':
          base.buckets = choiceBuckets(q, qAnswers);
          break;
        case 'sentiment':
        case 'consent':
          base.buckets = booleanBuckets(qAnswers);
          break;
        case 'scale':
          base.numeric = numericAggregate(q.type, qAnswers);
          break;
        case 'temporal':
          base.buckets = temporalBuckets(q.type, qAnswers);
          break;
        case 'composite':
          // Matrix has no aggregate form yet, so its answers are listed in their rendered
          // one-line shape. Informative, if not summarised.
          base.textAnswers = qAnswers
            .map((a) => renderAnswer(q, a).trim())
            .filter((t) => t.length > 0)
            .slice(0, FREE_TEXT_CAP);
          break;
        default:
          // Unreachable: isChartedRole already excluded every other role. Left explicit so a
          // new charted role fails loudly in review rather than rendering an empty card.
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

/** Yes/No distribution. Labels stay Yes/No; the consent CARD does the "accepted" reading. */
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
