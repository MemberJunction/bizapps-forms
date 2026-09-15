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
import { insightRoleFor, isChartedRole, type QuestionInsightRole } from './question-insight-roles';
import { temporalBuckets } from './temporal-buckets';
import { median } from './statistics';
import { extractChoiceValues, renderAnswer } from '../../shared/answer-values';
import { toDate } from '../../shared/runview-dates';

type ResponseRow = mjBizAppsFormsFormResponseEntityType;
type AnswerRow = mjBizAppsFormsFormResponseAnswerEntityType;

/** Max free-text answers surfaced in a breakdown card before truncation. */
const FREE_TEXT_CAP = 200;

/**
 * The scale NPS is defined on. A rating outside it did not come from an NPS control.
 *
 * Bucketing out-of-range values anyway let `50` count as a promoter and `-20` as a
 * detractor — and a single stored `99` produced a perfect score of 100 from one bad number.
 * The score is the headline of the card, so it must be computed only from ratings that
 * could actually be NPS ratings.
 */
const NPS_MIN = 0;
const NPS_MAX = 10;

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
      const role = insightRoleFor(q.type);
      const qAnswers = answersThatSaidSomething(role, byQuestion.get(q.id) ?? []);
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

/**
 * Drops answer rows that exist but chose nothing, so they are not counted as answers.
 *
 * Only choice questions can be in this state: a stored `[]` on a MultiChoice means the
 * respondent reached the question and selected none of its options, which is a skip in
 * substance however it is stored. Counting the row inflated `answeredCount`, understated the
 * "% skipped" figure on the card header, and left a card claiming two answers above bars
 * that totalled one selection.
 *
 * Deliberately narrow. A numeric `0`, a `false` boolean and an empty-string text answer are
 * all real answers with real meaning, and none of them comes near this filter.
 */
function answersThatSaidSomething(role: QuestionInsightRole, answers: AnswerRow[]): AnswerRow[] {
  if (role !== 'choice') return answers;
  return answers.filter((a) => extractChoiceValues(a).length > 0);
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
    // Scored over the on-scale ratings only. `answered`, `min`, `max` and `average` above
    // still describe every stored number — those report what IS in the column, which is the
    // honest reading and the only way an out-of-range value stays visible at all.
    let detractors = 0;
    let passives = 0;
    let promoters = 0;
    let rated = 0;
    for (const v of values) {
      if (v < NPS_MIN || v > NPS_MAX) continue;
      rated++;
      if (v <= 6) detractors++;
      else if (v <= 8) passives++;
      else promoters++;
    }
    if (rated > 0) {
      agg.npsSegments = { detractors, passives, promoters };
      agg.npsScore = Math.round(((promoters - detractors) / rated) * 100);
    }
    // With nothing on the scale, `npsScore` stays null and the card falls back to the plain
    // numeric aggregates — which is the truthful rendering of numbers that are not an NPS.
  }

  return agg;
}

/**
 * Builds the page completion / drop-off funnel.
 *
 * A page is "reached" when some response answered a question on it, which means a page with
 * no ANSWERABLE questions can never be reached — it collects nothing by definition. Such
 * pages are therefore not steps in the funnel at all, and including them broke the chart in
 * two ways on the most ordinary form shape there is:
 *
 *   - As the FIRST page, a welcome statement made `firstReached` zero, and every retention
 *     after it divides by that. The whole funnel read 0% while the reached counts printed
 *     beside the empty bars were not zero.
 *   - In the MIDDLE, it reported a 100% drop-off — the severe-warning treatment — at a page
 *     behaving exactly as designed, then showed every respondent returning on the next step.
 *
 * What is deliberately NOT filtered is a page that asks real questions nobody answered. That
 * is a genuine total drop-off and has to keep saying so.
 */
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

  const pages = [...def.pages]
    .filter((p) => p.questions.some((question) => isAnswerableQuestionType(question.type)))
    .sort((a, b) => a.displayOrder - b.displayOrder);
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
