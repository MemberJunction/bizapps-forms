/**
 * Put a resumed draft's stored answers back into the widget's answer map.
 *
 * The inverse of `toAnswerInputs`, and it routes the same way — on `answerColumnFor(question.type)`
 * rather than on which column happens to be populated. That matters because the stored row is a
 * fact about the DATABASE and the answer map is a fact about the CONTROLS: a question whose type
 * changed since the draft was saved has an answer in the wrong column, and reading "whichever
 * column has something in it" would hand a `<input type="number">` the string it used to hold.
 *
 * TWO THINGS ARE DELIBERATELY DROPPED rather than approximated:
 *   - an answer whose question no longer exists in this version (the author deleted it), and
 *   - an answer that cannot be written back in the spelling its control accepts.
 * Both are reported, because the second one is otherwise invisible in the worst way: a stored value
 * a control silently rejects leaves the field blank, the respondent re-answers, and nothing ever
 * said their earlier answer was discarded.
 */
import {
  answerColumnFor,
  collapseAnswer,
  dateAnswerText,
  foldQuestionId,
  isAnswerableQuestionType,
  type AnswerValue,
  type PublishedFormDefinition,
  type PublishedFormQuestion,
  type ResumeSnapshot,
  type StoredAnswerRow,
} from '@mj-biz-apps/forms-entities';

/** What a prefill did, and what it could not do. */
export interface PrefillResult {
  /** How many answers were put back. */
  applied: number;
  /** Question ids whose stored answer was dropped — gone from this version, or unwritable. */
  dropped: string[];
}

/** The narrow slice of `FormRuntime` this needs, so the mapping is testable without one. */
export interface PrefillTarget {
  setValue(questionId: string, value: AnswerValue): void;
}

/**
 * Write every still-valid stored answer into `target`.
 *
 * Question ids are matched CASE-INSENSITIVELY through `foldQuestionId`, because the snapshot's ids
 * come back from SQL Server (uppercased) while the published definition carries the spelling MJ
 * minted client-side (lowercase). A case-sensitive match here would drop every answer of every
 * resumed draft, and would look exactly like a form whose questions had all been deleted.
 */
export function prefillFromResume(
  target: PrefillTarget,
  definition: Pick<PublishedFormDefinition, 'pages'>,
  snapshot: ResumeSnapshot,
): PrefillResult {
  const questions = questionsById(definition);
  const dropped: string[] = [];
  let applied = 0;

  for (const row of snapshot.answers) {
    const question = questions.get(foldQuestionId(row.QuestionID));
    if (!question) {
      // The author removed this question. Its answer stays in the database until the first save
      // after the resume, which reconciles it away; the respondent simply never sees it.
      dropped.push(row.QuestionID);
      continue;
    }
    const value = answerValueFromStored(question, row);
    if (value === undefined) {
      dropped.push(row.QuestionID);
      continue;
    }
    target.setValue(question.id, value);
    applied += 1;
  }

  return { applied, dropped };
}

/** Every ANSWERABLE question of the definition, keyed by its folded id. */
function questionsById(definition: Pick<PublishedFormDefinition, 'pages'>): Map<string, PublishedFormQuestion> {
  const map = new Map<string, PublishedFormQuestion>();
  for (const page of definition.pages) {
    for (const question of page.questions) {
      // A `Statement` holds no answer, so a stored row against one is a data oddity rather than
      // something to render — and `setValue` on it would put a value where nothing reads it.
      if (isAnswerableQuestionType(question.type)) {
        map.set(foldQuestionId(question.id), question);
      }
    }
  }
  return map;
}

/**
 * One stored row as the value this question's control holds, or `undefined` when it cannot be.
 *
 * Routed by the question's own answer column, so a stored value in the WRONG column (the type
 * changed under an open draft) is dropped rather than coerced.
 */
export function answerValueFromStored(
  question: PublishedFormQuestion,
  row: StoredAnswerRow,
): AnswerValue | undefined {
  switch (answerColumnFor(question.type)) {
    case 'text':
      return row.TextValue ?? undefined;
    case 'numeric':
      return row.NumericValue ?? undefined;
    case 'boolean':
      return row.BooleanValue ?? undefined;
    case 'file':
      return row.FileID ?? undefined;
    case 'date':
      return dateValueFor(question, row);
    case 'json':
      return jsonValueFor(row);
    default:
      return undefined;
  }
}

/**
 * A stored `DATETIMEOFFSET` as the text its control accepts — `14:30` for a Time, `2026-09-01` for
 * a Date.
 *
 * `dateAnswerText` is the contract's own inverse of the write, and its JSDoc anticipated exactly
 * this caller. The extra check here is the one thing it cannot do: it deliberately preserves a time
 * component that a non-widget client stored on a Date question (`2026-09-01 15:00`), because
 * discarding it would truncate the column for the detail page and the export — but
 * `<input type="date">` silently BLANKS anything that is not a bare calendar day. So a value that
 * would not round-trip into the control is dropped and reported instead of being shown as empty.
 */
function dateValueFor(question: PublishedFormQuestion, row: StoredAnswerRow): AnswerValue | undefined {
  if (row.DateValue == null) {
    return undefined;
  }
  const instant = row.DateValue instanceof Date ? row.DateValue : new Date(row.DateValue);
  if (Number.isNaN(instant.getTime())) {
    return undefined;
  }
  const text = dateAnswerText(question.type, instant);
  if (question.type === 'Time') {
    return text;
  }
  // A bare `YYYY-MM-DD` is what a date control round-trips; anything longer carries a time.
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : undefined;
}

/**
 * A stored JSON answer as the structure its control holds.
 *
 * Read through `collapseAnswer` rather than `JSON.parse` so a value that was stored as raw
 * unparseable text comes back the way every other reader of the column sees it. A file reference is
 * refused here: `{ fileId }` is not an `AnswerValue`, and a JSON-column question is never a file
 * question, so its presence means the row belongs to a question whose type has changed.
 */
function jsonValueFor(row: StoredAnswerRow): AnswerValue | undefined {
  if (row.JSONValue == null) {
    return undefined;
  }
  const value = collapseAnswer({ JSONValue: row.JSONValue });
  if (value === undefined || typeof value === 'object' && value !== null && 'fileId' in value) {
    return undefined;
  }
  return value as AnswerValue;
}
