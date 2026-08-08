/**
 * Decide which mapped values actually get written to a bound record — the rule layer that stands
 * between "what this submission said" and "what we are about to overwrite".
 *
 * Pure and shared: the server executes it on submit and the builder can run it to preview a
 * binding against a real response without a round trip, which matters because the interesting
 * outcomes here are the ones nobody sees until data is already wrong.
 *
 * The load-bearing rule is that ABSENT and EMPTY are different. A question the form never asked
 * is absent and can never write anything, under any policy. A question that was asked and
 * answered with a blank is present, and whether that blank may clear an existing value is
 * exactly what the merge rules decide. Collapsing the two is how a short form silently erases
 * what a longer one collected — and the naive `incoming[field] || current[field]` does precisely
 * that, which is why the presence test here is map membership rather than truthiness.
 */
import { mergeRuleFor, type FieldMappings, type MergePolicy } from './entity-binding';
import type { CanonicalAnswers, CanonicalAnswerValue } from './answer-canonical';

/** The mapped values a submission produced, plus anything required that it did not. */
export interface ResolvedMapping {
  /** Target field -> value. Membership means supplied; see the module note on absent vs empty. */
  values: Map<string, CanonicalAnswerValue>;
  /** Target fields whose mapping is `required` and which this submission did not answer. */
  missingRequired: string[];
}

/**
 * Turn a submission's answers into the values a binding would write.
 *
 * A `required` mapping counts a blank as missing, not as an answer: the point of marking a field
 * required is that the record is not worth creating without it, and a record whose Email column
 * holds an empty string satisfies no one's definition of having an email.
 *
 * Answers are looked up through {@link CanonicalAnswers}, so question-GUID casing is handled for
 * us — the mapping is authored from the published form (lowercase ids) while the stored answers
 * come back from SQL Server uppercased, and comparing them directly finds nothing at all.
 */
export function resolveMappedValues(mappings: FieldMappings, answers: CanonicalAnswers): ResolvedMapping {
  const values = new Map<string, CanonicalAnswerValue>();
  const missingRequired: string[] = [];

  for (const field of mappings.fields) {
    if (field.source.kind === 'static') {
      values.set(field.targetField, field.source.value);
      continue;
    }
    const answer = answers.Get(field.source.questionId);
    const supplied = answers.Has(field.source.questionId) && !isBlank(answer);
    if (supplied) {
      values.set(field.targetField, answer as CanonicalAnswerValue);
    } else if (field.required) {
      missingRequired.push(field.targetField);
    } else if (answers.Has(field.source.questionId)) {
      // Answered blank on an optional field: still SUPPLIED, and the merge rules decide whether
      // that blank may clear anything. Dropping it here would quietly turn every `latestWins`
      // field into `neverBlank`.
      values.set(field.targetField, answer as CanonicalAnswerValue);
    }
  }
  return { values, missingRequired };
}

/** What the planner needs to decide a write. */
export interface MergePlanInput {
  /** Mapped values keyed by target field. Membership means supplied — see the module note. */
  mapped: ReadonlyMap<string, CanonicalAnswerValue>;
  /** The record being merged into, keyed by field name, or null when creating. */
  existing: ReadonlyMap<string, unknown> | null;
  policy: MergePolicy;
  /** Fields that identify the record. Never rewritten on an update — see {@link planMerge}. */
  identityFields: readonly string[];
}

/**
 * Build the set of field writes for this submission — only what actually changes.
 *
 * An empty plan means the caller must not save at all: re-running a binding over an unchanged
 * response should not stamp `__mj_UpdatedAt`, fabricate a record-change row, or make a replay
 * look like an edit.
 *
 * On update the identity fields are skipped structurally rather than by policy. Rewriting the
 * field a record was matched on is never a within-record edit — it is a claim that this record
 * is now a different person, and if the new value belongs to somebody else it silently merges
 * two real records with no way back.
 */
export function planMerge(input: MergePlanInput): Map<string, CanonicalAnswerValue> {
  const plan = new Map<string, CanonicalAnswerValue>();
  const identity = new Set(input.identityFields.map((f) => f.toLowerCase()));

  for (const [targetField, incoming] of input.mapped) {
    if (input.existing === null) {
      // Creating: every supplied value is written, whatever rule governs later updates — the
      // rules describe what may overwrite, and there is nothing here to overwrite yet. Blanks
      // are still skipped, because writing '' where the column would otherwise be null records
      // an answer nobody gave.
      if (!isBlank(incoming)) {
        plan.set(targetField, incoming);
      }
      continue;
    }

    if (identity.has(targetField.toLowerCase())) {
      continue;
    }

    const current = input.existing.get(targetField);
    if (valuesMatch(current, incoming)) {
      continue;
    }
    if (allowsWrite(mergeRuleFor(input.policy, targetField), current, incoming)) {
      plan.set(targetField, incoming);
    }
  }
  return plan;
}

function allowsWrite(rule: string, current: unknown, incoming: CanonicalAnswerValue): boolean {
  switch (rule) {
    case 'writeOnce':
      return isBlank(current);
    case 'latestWins':
      // The only rule that can clear a field, and only because the respondent was asked and
      // answered blank — an unasked question never reaches here at all.
      return true;
    case 'neverBlank':
    default:
      return !isBlank(incoming);
  }
}

/**
 * Whether a value counts as "nothing".
 *
 * `0` and `false` are answers and are never blank. A whitespace-only string is treated as blank
 * so that "  " cannot overwrite a real value under `neverBlank`; the value itself is still
 * written verbatim when a rule does allow it, because trimming what gets stored is a separate
 * decision from deciding whether it is worth storing.
 */
function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  return typeof value === 'string' && value.trim() === '';
}

/**
 * Whether the incoming value is already what the record holds.
 *
 * Compared loosely across the string/number boundary because the two sides arrive from different
 * places: a canonical answer may be the string "42" while the column holds the number 42, and
 * writing one over the other is a no-op that would otherwise show up as an edit in the audit
 * trail on every single replay.
 */
function valuesMatch(current: unknown, incoming: CanonicalAnswerValue): boolean {
  if (current === incoming) {
    return true;
  }
  if (isBlank(current) && isBlank(incoming)) {
    return true;
  }
  if (current instanceof Date && typeof incoming === 'string') {
    return !Number.isNaN(current.getTime()) && current.toISOString() === incoming;
  }
  if (
    (typeof current === 'number' || typeof current === 'boolean') &&
    (typeof incoming === 'string' || typeof incoming === 'number' || typeof incoming === 'boolean')
  ) {
    return String(current) === String(incoming);
  }
  return false;
}
