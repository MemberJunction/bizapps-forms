/**
 * Build the answers map the conditional evaluator consumes, keyed the way conditions reference
 * questions.
 *
 * The subtlety is casing, and it is the same trap that has already shipped twice. A
 * `ConditionalRule` names questions by the ids in the PUBLISHED SNAPSHOT — client-minted, and
 * therefore lowercase. The stored answers come back from SQL Server with `uniqueidentifier`
 * rendered uppercase. `evaluateConditionalRule` does an exact `answers.get(condition.questionId)`,
 * so a map built from the stored rows would miss every condition and silently evaluate every
 * automation as "condition did not hold" — automations configured correctly would simply never
 * fire, with nothing logged.
 *
 * So the map is built by walking the SNAPSHOT's questions and looking each one up through
 * {@link CanonicalAnswers}, which folds. The keys are then exactly the strings the rules use, and
 * the fold happens once, on the side that knows about it.
 */
import {
  clockTimeOf,
  isFileAnswer,
  type AnswerValue,
  type CanonicalAnswers,
  type PublishedFormDefinition,
  type PublishedFormQuestion,
} from '@mj-biz-apps/forms-entities';

/**
 * Map every question in the published definition to its answer, omitting unanswered ones.
 *
 * Unanswered questions are left out rather than mapped to null, because `isAnswerSupplied` — the
 * single definition of "answered" that the `isAnswered` operator rests on — treats an absent key
 * and a null the same way, and leaving them out keeps the map honest about what was collected.
 */
export function buildConditionAnswers(
  definition: PublishedFormDefinition,
  answers: CanonicalAnswers,
): Map<string, AnswerValue> {
  const map = new Map<string, AnswerValue>();
  for (const page of definition.pages) {
    for (const question of page.questions) {
      if (!answers.Has(question.id)) {
        continue;
      }
      map.set(question.id, conditionValueFor(question, answers.Get(question.id)));
    }
  }
  return map;
}

/**
 * The value a rule about THIS question should be compared against.
 *
 * The second scale trap, and the same failure the module header describes: a map whose values do
 * not match what the rules use makes an automation "configured correctly simply never fire, with
 * nothing logged". Casing was the first; the `date` column is the second.
 *
 * A `Time` answer is STORED as the clock on the epoch date in UTC (`14:30` →
 * `1970-01-01T14:30:00Z`, see `answer-date.ts`), and `CanonicalAnswers` hands that on as the ISO
 * instant — deliberately, because entity binding writes it into real datetime columns. But
 * `toComparable` reads an ISO instant on the DATE scale, while a rule an author writes for a Time
 * question (`"12:00"`) is on the TIME scale, and the two scales never compare. So every
 * `equals`/`greaterThan`/`lessThan` on a Time question evaluated false.
 *
 * Converting here rather than in `collapseAnswer` is the point: this is the one place that has the
 * QUESTION, and so the only place that can tell a Time from a Date. `collapseAnswer` keeps
 * returning the instant for the consumers that want an instant.
 *
 * Visibility rules never had this problem — they read the wire value (`14:30`) rather than the
 * stored one. Closing that fork is what `forms-entities`'s shared contracts exist for; this closes
 * it on the automation path too.
 */
function conditionValueFor(
  question: PublishedFormQuestion,
  value: ReturnType<CanonicalAnswers['Get']>,
): AnswerValue {
  const answer = toAnswerValue(value);
  if (question.type !== 'Time' || typeof answer !== 'string') {
    return answer;
  }
  const instant = new Date(answer);
  // A value that is not an instant is passed through untouched: it is either already a clock, or
  // text the column could not parse, and inventing a reading from it would be worse than either.
  return Number.isNaN(instant.getTime()) ? answer : clockTimeOf(instant);
}

/**
 * Narrow a canonical answer to what the evaluator compares against.
 *
 * A file answer becomes its bare GUID: the evaluator's operators are all scalar or array
 * comparisons, and a `{ fileId }` object would satisfy `isAnswered` by accident of being truthy
 * while failing every other operator in a way no author could debug. Arrays pass through, because
 * a multi-select is exactly what `in` and `contains` exist for.
 */
function toAnswerValue(value: ReturnType<CanonicalAnswers['Get']>): AnswerValue {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (isFileAnswer(value)) {
    return value.fileId;
  }
  if (Array.isArray(value)) {
    return value.every((v) => typeof v === 'number')
      ? (value as number[])
      : value.map((v) => (typeof v === 'string' ? v : String(v)));
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return value;
}
