/**
 * The per-question breakdowns of a response summary — CHARTED questions only (choice, scale, yes/no,
 * consent, date/time, Matrix; `insight-roles.ts`). Identity, attachment and written questions are
 * summarised by the profile and open-text sections instead, and never appear here.
 *
 * Built from the `Forms: Question Answer Value Counts` rows (Complete responses; a multi-select
 * array already expanded to one value per choice, as `extractChoiceValues` reads it), plus the Matrix
 * answer rows the engine reads itself (`insight-answers.ts`). Rules carried over from forms-ng
 * `reporting-aggregations.ts`:
 *  - choice: every option seeded (a never-chosen option shows at zero), most chosen first, fractions
 *    over all selections; a choice answer that selected nothing is not an answer;
 *  - scale: min, max and mean over every stored number; NPS scored over ratings 0..10 ONLY (a stored
 *    99 once produced a perfect score of 100), segments 0-6 / 7-8 / 9-10;
 *  - yes/no and consent: Yes then No; date/time: periods in order (`temporal.ts`).
 *
 * New on the server, because the result now leaves for a browser that never held the raw rows:
 *  - an answer value that is not one of the question's options is counted in ONE
 *    {@link OFF_LIST_LABEL} bucket, never under its own text — the dashboard showed such a value as a
 *    bucket label, and it can be anything a client sent (an email address typed into a choice);
 *  - a Matrix is row x column cell counts (`MatrixCells`), where the dashboard listed up to 200
 *    rendered answers;
 *  - `AnsweredCount` counts responses that stored a VALUE (the query's AnsweredResponses); the
 *    dashboard counted answer rows, blank ones included, for every type but choice.
 */
import {
  foldQuestionId,
  isAnswerableQuestionType,
  OFF_LIST_LABEL,
  parseJsonObject,
  type FormQuestionType,
  type FormsAnswerBucket,
  type FormsMatrixCell,
  type FormsNumericAggregate,
  type FormsQuestionBreakdown,
  type PublishedFormQuestion,
  type PublishedFormQuestionOption,
} from '@mj-biz-apps/forms-entities';
import { insightRoleFor, isChartedRole, type ChartedRole } from './insight-roles.js';
import type { InsightAnswerRow } from './insight-answers.js';
import type { ValueCountRow } from './report-queries.js';
import { temporalBuckets } from './temporal.js';

/** The scale NPS is defined on. A rating outside it did not come from an NPS control. */
const NPS_MIN = 0;
const NPS_MAX = 10;

/** One charted card per charted, answerable question, in the order `questions` holds them. */
export function buildQuestionBreakdowns(
  questions: readonly PublishedFormQuestion[],
  valueRows: readonly ValueCountRow[],
  matrixAnswers: readonly InsightAnswerRow[],
): FormsQuestionBreakdown[] {
  const rowsByQuestion = groupBy(valueRows, (row) => foldQuestionId(row.QuestionID));
  const matrixByQuestion = groupBy(matrixAnswers, (row) => foldQuestionId(row.QuestionID));
  const cards: FormsQuestionBreakdown[] = [];
  for (const question of questions) {
    const role = insightRoleFor(question.type);
    if (!isAnswerableQuestionType(question.type) || !isChartedRole(role)) {
      continue;
    }
    const key = foldQuestionId(question.id);
    cards.push(
      role === 'composite'
        ? matrixCard(question, matrixByQuestion.get(key) ?? [])
        : valueCard(question, role, rowsByQuestion.get(key) ?? []),
    );
  }
  return cards;
}

/** A card built from the value-count rows: every charted role but Matrix. */
function valueCard(question: PublishedFormQuestion, role: Exclude<ChartedRole, 'composite'>, rows: readonly ValueCountRow[]): FormsQuestionBreakdown {
  const card = emptyCard(question, role, rows[0]?.AnsweredResponses ?? 0);
  switch (role) {
    case 'choice':
      card.Buckets = choiceBuckets(question.options, rows.filter((row) => row.ValueKind === 'Text'));
      break;
    case 'sentiment':
    case 'consent':
      card.Buckets = booleanBuckets(rows.filter((row) => row.ValueKind === 'Boolean'));
      break;
    case 'scale':
      card.Numeric = numericAggregate(question.type, rows.filter((row) => row.ValueKind === 'Numeric'));
      break;
    case 'temporal':
      card.Buckets = temporalBuckets(
        question.type,
        rows.filter((row) => row.ValueKind === 'Date').map((row) => ({ instant: new Date(row.Value), count: row.ValueCount })),
      );
      break;
  }
  return card;
}

function emptyCard(question: PublishedFormQuestion, role: ChartedRole, answered: number): FormsQuestionBreakdown {
  return {
    QuestionID: question.id,
    Prompt: question.prompt,
    QuestionType: question.type,
    Role: role,
    AnsweredCount: answered,
    Buckets: [],
    Numeric: null,
    MatrixCells: [],
  };
}

/** Option-seeded counts, off-list values folded into {@link OFF_LIST_LABEL}, most chosen first. */
function choiceBuckets(options: readonly PublishedFormQuestionOption[], rows: readonly ValueCountRow[]): FormsAnswerBucket[] {
  const counts = new Map<string, number>(options.map((option) => [option.value, 0]));
  let offList = 0;
  let total = 0;
  for (const row of rows) {
    const seeded = counts.get(row.Value);
    if (seeded === undefined) {
      offList += row.ValueCount;
    } else {
      counts.set(row.Value, seeded + row.ValueCount);
    }
    total += row.ValueCount;
  }
  const labelled = options.map((option) => ({ label: option.label, count: counts.get(option.value) ?? 0 }));
  if (offList > 0) {
    labelled.push({ label: OFF_LIST_LABEL, count: offList });
  }
  // A stable sort: options tied on count keep the author's order, and Other sorts after them.
  return labelled
    .sort((a, b) => b.count - a.count)
    .map(({ label, count }) => ({ Label: label, Count: count, Fraction: total > 0 ? count / total : 0 }));
}

/** Yes then No. Labels stay Yes/No; the consent card does the "accepted" reading. */
function booleanBuckets(rows: readonly ValueCountRow[]): FormsAnswerBucket[] {
  const yes = rows.filter((row) => row.Value === 'true').reduce((sum, row) => sum + row.ValueCount, 0);
  const no = rows.filter((row) => row.Value === 'false').reduce((sum, row) => sum + row.ValueCount, 0);
  const total = yes + no;
  return [
    { Label: 'Yes', Count: yes, Fraction: total > 0 ? yes / total : 0 },
    { Label: 'No', Count: no, Fraction: total > 0 ? no / total : 0 },
  ];
}

/**
 * Min, max and mean over every stored number, weighted by how many answers held each; NPS scored over
 * the on-scale ratings only. `Answered`, min, max and mean still describe every number in the column
 * — the honest reading, and the only way an out-of-range value stays visible at all.
 */
function numericAggregate(type: FormQuestionType, rows: readonly ValueCountRow[]): FormsNumericAggregate {
  const values = rows.filter((row): row is ValueCountRow & { NumericValue: number } => row.NumericValue !== null);
  const answered = values.reduce((sum, row) => sum + row.ValueCount, 0);
  if (answered === 0) {
    return { Answered: 0, Min: null, Max: null, Average: null, NPSScore: null, NPSSegments: null };
  }
  // Reduced, not spread into Math.min: a Number question can hold more distinct values than a call
  // may take arguments.
  const aggregate: FormsNumericAggregate = {
    Answered: answered,
    Min: values.reduce((min, row) => Math.min(min, row.NumericValue), Number.POSITIVE_INFINITY),
    Max: values.reduce((max, row) => Math.max(max, row.NumericValue), Number.NEGATIVE_INFINITY),
    Average: values.reduce((sum, row) => sum + row.NumericValue * row.ValueCount, 0) / answered,
    NPSScore: null,
    NPSSegments: null,
  };
  if (type === 'NPS') {
    const segments = { Detractors: 0, Passives: 0, Promoters: 0 };
    for (const { NumericValue: rating, ValueCount: count } of values) {
      if (rating < NPS_MIN || rating > NPS_MAX) {
        continue;
      }
      if (rating <= 6) segments.Detractors += count;
      else if (rating <= 8) segments.Passives += count;
      else segments.Promoters += count;
    }
    const rated = segments.Detractors + segments.Passives + segments.Promoters;
    if (rated > 0) {
      aggregate.NPSSegments = segments;
      aggregate.NPSScore = Math.round(((segments.Promoters - segments.Detractors) / rated) * 100);
    }
  }
  return aggregate;
}

/** The axis an option is on; absent is a row, as the contract says. */
function axisOf(option: PublishedFormQuestionOption): 'Row' | 'Column' {
  return option.matrixAxis ?? 'Row';
}

/**
 * A Matrix as cell counts: every authored row x column in option order (zeros included), then any
 * cell naming a row or column the author never offered, under {@link OFF_LIST_LABEL}. A response
 * counts as having answered when it chose at least one cell; a malformed or empty answer chose none.
 */
function matrixCard(question: PublishedFormQuestion, answers: readonly InsightAnswerRow[]): FormsQuestionBreakdown {
  const byOrder = [...question.options].sort((a, b) => a.displayOrder - b.displayOrder);
  const rows = byOrder.filter((option) => axisOf(option) === 'Row');
  const columns = byOrder.filter((option) => axisOf(option) === 'Column');
  const rowValues = new Set(rows.map((option) => option.value));
  const columnValues = new Set(columns.map((option) => option.value));
  const counts = new Map<string, number>();
  const cellKey = (row: string, column: string): string => `${row}\u0000${column}`;
  const answeredBy = new Set<string>();

  for (const answer of answers) {
    for (const [row, picked] of Object.entries(parseJsonObject(answer.JSONValue) ?? {})) {
      const cells = (Array.isArray(picked) ? picked : [picked]).map((cell) => String(cell ?? '').trim()).filter((cell) => cell !== '');
      for (const cell of cells) {
        const key = cellKey(rowValues.has(row) ? row : OFF_LIST_LABEL, columnValues.has(cell) ? cell : OFF_LIST_LABEL);
        counts.set(key, (counts.get(key) ?? 0) + 1);
        answeredBy.add(answer.ResponseID);
      }
    }
  }

  const cells: FormsMatrixCell[] = [];
  const rowLabels = [...rows.map((option) => ({ value: option.value, label: option.label })), { value: OFF_LIST_LABEL, label: OFF_LIST_LABEL }];
  const columnLabels = [...columns.map((option) => ({ value: option.value, label: option.label })), { value: OFF_LIST_LABEL, label: OFF_LIST_LABEL }];
  for (const row of rowLabels) {
    for (const column of columnLabels) {
      const count = counts.get(cellKey(row.value, column.value)) ?? 0;
      const authored = row.value !== OFF_LIST_LABEL && column.value !== OFF_LIST_LABEL;
      if (authored || count > 0) {
        cells.push({ RowLabel: row.label, ColumnLabel: column.label, Count: count });
      }
    }
  }
  const card = emptyCard(question, 'composite', answeredBy.size);
  card.MatrixCells = cells;
  return card;
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const group = groups.get(k);
    if (group) group.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}
