/**
 * The response-submitted event — the ONE definition of what a respondent save owes the automation
 * outbox (#303). The submit path writes it (`enqueue.ts`) and the drain reads it back from the
 * `FormAutomationEvent` row it became (`claim.ts`), so the shape cannot drift between the two ends.
 *
 * Two kinds of event, told apart by `Trigger`:
 *  - `OnComplete` — one per final submission (the table's filtered unique index enforces it).
 *  - `OnPartial` — one per partial save of a version that has OnPartial automations. Its
 *    `PartialSaveKey` is a hash of the answers that save stored, so an autosave that changed nothing
 *    since the response's previous partial event queues no second run.
 *
 * Ids only: the event is a claim check, never the answers (a respondent's personal data).
 */
import { isGuid } from '../../shared/guid.js';

/** Which save an event announces — and so which automations its drain runs. */
export type ResponseSubmittedTrigger = 'OnComplete' | 'OnPartial';

const TRIGGERS: readonly ResponseSubmittedTrigger[] = ['OnComplete', 'OnPartial'];

/** What a save owes the outbox. PascalCase, like every other MJ wire shape. */
export interface ResponseSubmittedPayload {
  ResponseID: string;
  FormVersionID: string;
  FormDistributionID: string;
  Trigger: ResponseSubmittedTrigger;
  /** Required on an `OnPartial` event, refused on an `OnComplete` one; see the header. */
  PartialSaveKey: string | null;
}

/** A partial save's key: short, and fits `FormAutomationEvent.PartialSaveKey` (NVARCHAR(64)). */
const PARTIAL_SAVE_KEY = /^[A-Za-z0-9_-]{1,64}$/;

/** Why `payload` is not a valid event, or `null` when it is. */
export function responseSubmittedPayloadRefusal(payload: ResponseSubmittedPayload): string | null {
  for (const field of ['ResponseID', 'FormVersionID', 'FormDistributionID'] as const) {
    if (!isGuid(payload[field])) {
      return `${field} is not an id`;
    }
  }
  const trigger = payload.Trigger;
  if (!TRIGGERS.some((t) => t === trigger)) {
    return `Trigger must be one of ${TRIGGERS.join(', ')}`;
  }
  const key = payload.PartialSaveKey ?? null;
  if (trigger === 'OnPartial' && (typeof key !== 'string' || !PARTIAL_SAVE_KEY.test(key))) {
    return 'an OnPartial event needs a PartialSaveKey of 1-64 letters, digits, "-" or "_"';
  }
  if (trigger === 'OnComplete' && key !== null) {
    return 'an OnComplete event carries no PartialSaveKey: a response completes once';
  }
  return null;
}
