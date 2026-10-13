/**
 * Which Work Queue message, if any, a respondent save owes the `Forms.RunAutomations` handler — and
 * the partial-save key that makes an identical re-save a duplicate (#303 Task 8, spec §5 and §12).
 *
 * The message is published inside the save's transaction (see `FormSubmissionEngine`), so the
 * response and the work it owes commit together or not at all. Deciding here whether there IS any
 * work is what keeps the queue free of messages whose delivery would plan nothing:
 *  - a final COMPLETION owes an `OnComplete` message when the version runs the four legacy hooks, or
 *    has an active step that fires on completion;
 *  - a PARTIAL save owes an `OnPartial` message only when the version has an active `OnPartial` /
 *    `OnCompleteOrPartial` step (legacy hooks never ran for a partial save);
 *  - a KNOCKOUT owes nothing: a disqualified respondent's response fires no automations.
 * "Active" and "fires" are read from the published snapshot with the handler's own rule
 * (`triggerMatches`), because the snapshot is what the handler plans from.
 */
import { createHash } from 'node:crypto';
import { resolveOnSubmitDispatch, type PublishedFormDefinition, type ValidatedAnswer } from '@mj-biz-apps/forms-entities';
import { triggerMatches } from '../automation/automation-plan.js';
import type { ResponseSubmittedTrigger } from '../work-queue/response-submitted.js';

/** What kind of save this is, for the purpose of the automations it owes. */
export type QueuedSaveKind = 'completion' | 'partial' | 'knockout';

/** The trigger this save's message carries, or `null` when nothing would run for it. */
export function queuedTrigger(
  definition: Pick<PublishedFormDefinition, 'settings' | 'automations'>,
  kind: QueuedSaveKind,
): ResponseSubmittedTrigger | null {
  if (kind === 'knockout') {
    return null;
  }
  const complete = kind === 'completion';
  const dispatch = resolveOnSubmitDispatch(definition);
  if (dispatch.kind === 'legacy') {
    return complete ? 'OnComplete' : null;
  }
  const fires = dispatch.automations.some((automation) => automation.isActive && triggerMatches(automation, complete));
  if (!fires) {
    return null;
  }
  return complete ? 'OnComplete' : 'OnPartial';
}

/**
 * The partial-save key: a hash of the answers this save STORED, in a canonical order.
 *
 * Controller ruling (2026-10-13): a hash of the canonical answers rather than a per-save counter, so
 * an autosave that changed nothing — the widget re-saves on a debounce — is answered `Duplicate` by
 * the topic's deduplication ledger inside its TTL instead of re-running every `OnPartial` step. The
 * cost, accepted with the ruling: saving A, then B, then A again inside the TTL does not re-fire on
 * the third save.
 *
 * Canonical: one entry per answer, keyed on the lower-cased question id, carrying every typed column
 * the row stores, sorted by id — so the order the widget sent them in and a GUID's casing cannot
 * produce two keys for one answer set. SHA-256 hex is 64 characters of `[0-9a-f]`, which is exactly
 * what the message contract admits.
 */
export function partialSaveKey(answers: readonly ValidatedAnswer[]): string {
  const canonical = answers
    .map(({ question, input }) => [
      question.id.toLowerCase(),
      input.textValue ?? null,
      input.numericValue ?? null,
      input.dateValue ?? null,
      input.booleanValue ?? null,
      input.jsonValue ?? null,
      input.fileId ?? null,
    ])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
