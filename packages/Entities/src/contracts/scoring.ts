/**
 * Scoring (RULES_AND_BRANCHING_PLAN C4): per-option points, summed into one running total that
 * `source: 'score'` conditions can read — the assessment archetype (points → total → bands →
 * the conditional ending picks the band).
 *
 * The configuration lives in `FormQuestion.ScoringConfig` — a column that shipped with the schema
 * and was never read until now — and travels into the published snapshot as
 * `PublishedFormQuestion.scoring`. Its extended property reads, in full: "JSON scoring
 * configuration (e.g. LLM-judge prompt or numeric weights); null when unscored". An earlier
 * version of this comment quoted only the tail of that, which inverted the point: the column was
 * documented from the start as holding EITHER an LLM-judge prompt or numeric weights, so the
 * sibling-key tolerance in `parseQuestionScoring` honours the original design rather than working
 * around it.
 *
 * Pure and shared: widget and server MUST compute the same total from the same answers.
 */
import { isAnswerSupplied, type AnswerValue } from './conditional-rule';

/** The scoring half of a question's `ScoringConfig` JSON. */
export interface QuestionScoring {
  /**
   * Points per option VALUE — the published identity, i.e. what the widget stores as the
   * answer (`Value ?? Label`, uniquified). Entries that are not finite numbers contribute 0.
   */
  points?: Record<string, number>;
}

/** The slice of a published question that scoring reads — structural to avoid a type cycle. */
export interface ScorableQuestion {
  id: string;
  scoring?: QuestionScoring;
}

/**
 * The running total for these answers — a fold over the scored questions.
 *
 * Total by construction: an unanswered question, an option with no points entry, a malformed
 * points value, and a composite answer all contribute 0; the result is always a finite number.
 * Multi-select answers sum the points of every selected option. `hasOwnProperty` rather than a
 * bare index because the points object comes from `JSON.parse` of author-editable text — a
 * respondent answering the literal string "constructor" must score 0, not a function.
 */
export function computeScore(
  questions: ReadonlyArray<ScorableQuestion>,
  answers: ReadonlyMap<string, AnswerValue>,
): number {
  let total = 0;
  for (const question of questions) {
    const points = question.scoring?.points;
    if (!points) {
      continue;
    }
    const answer = answers.get(question.id);
    if (!isAnswerSupplied(answer)) {
      continue;
    }
    const selected = Array.isArray(answer) ? answer.map((v) => String(v)) : [String(answer)];
    for (const key of selected) {
      if (!Object.prototype.hasOwnProperty.call(points, key)) {
        continue;
      }
      const value = points[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        total += value;
      }
    }
  }
  return total;
}

/**
 * Parse a `ScoringConfig` column (JSON string or already-parsed object) into the scoring the
 * runtime uses, or undefined when it holds nothing usable.
 *
 * Deliberately tolerant, like the snapshot parser's posture toward side-effect configuration:
 * `ScoringConfig` is documented to also hold non-scoring content (an LLM-judge prompt), so an
 * unrecognized shape means "this question does not score", never a failed parse. Only finite
 * numeric entries survive.
 */
export function parseQuestionScoring(raw: unknown): QuestionScoring | undefined {
  if (raw === null || raw === undefined) {
    return undefined;
  }
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    if (raw.trim().length === 0) {
      return undefined;
    }
    try {
      parsed = JSON.parse(raw);
    } catch {
      return undefined; // not JSON — an LLM-judge prompt or free text; not scoring
    }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return undefined;
  }
  const pointsRaw = (parsed as Record<string, unknown>)['points'];
  if (pointsRaw === null || typeof pointsRaw !== 'object' || Array.isArray(pointsRaw)) {
    return undefined;
  }
  const points: Record<string, number> = {};
  for (const [key, value] of Object.entries(pointsRaw as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      points[key] = value;
    }
  }
  return Object.keys(points).length > 0 ? { points } : undefined;
}

/**
 * Serialize scoring back into the `ScoringConfig` column, preserving any NON-scoring keys the
 * column already holds (the documented LLM-judge use is a sibling key, not a competitor).
 * Returns the JSON to store, or null when removing the points leaves nothing else in the
 * column.
 */
export function serializeQuestionScoring(
  existingRaw: string | null | undefined,
  scoring: QuestionScoring | undefined,
): string | null {
  let existing: Record<string, unknown> = {};
  if (typeof existingRaw === 'string' && existingRaw.trim().length > 0) {
    try {
      const parsed: unknown = JSON.parse(existingRaw);
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        existing = parsed as Record<string, unknown>;
      }
    } catch {
      // Unparseable existing content (free text): points cannot merge into it. Preserve it
      // untouched when there is nothing to write; replacing it is the caller's explicit call.
      if (scoring === undefined) {
        return existingRaw;
      }
      existing = {};
    }
  }
  if (scoring?.points && Object.keys(scoring.points).length > 0) {
    existing['points'] = scoring.points;
  } else {
    delete existing['points'];
  }
  return Object.keys(existing).length > 0 ? JSON.stringify(existing) : null;
}
