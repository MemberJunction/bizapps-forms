/**
 * Builders the reporting specs share: published questions, stored answer rows and value-count rows,
 * terse enough that a spec reads as the data it describes.
 */
import type { FormQuestionType, PublishedFormQuestion } from '@mj-biz-apps/forms-entities';
import type { InsightAnswerRow } from '../insight-answers.js';
import type { ValueCountRow } from '../report-queries.js';

export interface OptionSpec {
  value: string;
  label: string;
  matrixAxis?: 'Row' | 'Column';
}

/** A published question; options get ids and display orders in the order given. */
export function question(id: string, type: FormQuestionType, prompt = id, options: OptionSpec[] = []): PublishedFormQuestion {
  return {
    id,
    type,
    prompt,
    isRequired: false,
    displayOrder: 1,
    options: options.map((o, i) => ({ id: `${id}-opt-${i}`, displayOrder: i + 1, ...o })),
  };
}

let answerSeq = 0;

/** A stored answer row as the insight read returns it. */
export function insightAnswer(responseId: string, questionId: string, columns: Partial<Pick<InsightAnswerRow, 'TextValue' | 'JSONValue' | 'FileID'>>): InsightAnswerRow {
  answerSeq += 1;
  return { ID: `a-${answerSeq}`, ResponseID: responseId, QuestionID: questionId, TextValue: null, JSONValue: null, FileID: null, ...columns };
}

/** A value-count row as the query returns it. */
export function valueRow(questionId: string, answeredResponses: number, kind: ValueCountRow['ValueKind'], value: string, valueCount: number): ValueCountRow {
  return {
    QuestionID: questionId,
    AnsweredResponses: answeredResponses,
    ValueKind: kind,
    Value: value,
    NumericValue: kind === 'Numeric' ? Number(value) : null,
    ValueCount: valueCount,
  };
}
