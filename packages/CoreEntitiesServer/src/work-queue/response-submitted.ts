/**
 * The `forms.response-submitted` message — the ONE definition of what the submit path publishes and
 * what the `Forms.RunAutomations` handler reads (spec #303 §5, §12).
 *
 * The publisher (`FormSubmissionEngine`, #303 Task 8) and the handler (`RunAutomationsHandler`) both
 * import from here, so the payload shape, the deduplication key and the names cannot drift between
 * the two ends of the queue. The topic and subscription rows themselves ship as metadata
 * (`metadata/work-queue-topics/`, `metadata/work-queue-subscriptions/`); these constants name them.
 *
 * Two kinds of message, told apart by `Trigger`:
 *  - `OnComplete` — one per final submission. Its deduplication key is the response id, so a
 *    re-published final submit inside the topic's TTL is answered `Duplicate`.
 *  - `OnPartial` — one per partial save of a version that has OnPartial automations (§12). An
 *    OnPartial step legitimately runs once per partial save, so each save needs its own key:
 *    `<responseId>:partial:<PartialSaveKey>`, where the publisher picks the key — a per-save counter
 *    (every save fires) or a hash of the saved answers (a save that changed nothing does not fire
 *    again within the TTL). Re-publishing the SAME save is what the key suppresses.
 *
 * The payload is ids only: a claim check, never the answers (the guide's §1, and the answers are a
 * respondent's personal data, which the queue copies into its own tables).
 */
import type { PublishRequest, WorkJson } from '@memberjunction/work-queue-core';

/** The topic the submit path publishes to. */
export const RESPONSE_SUBMITTED_TOPIC = 'forms.response-submitted';

/** The subscription that runs a submitted response's automations. */
export const RUN_AUTOMATIONS_SUBSCRIPTION = 'forms.run-automations';

/** The `HandlerKey` the subscription names and the handler registers under. */
export const RUN_AUTOMATIONS_HANDLER_KEY = 'Forms.RunAutomations';

/** Which save a message announces — and so which automations its handler runs. */
export type ResponseSubmittedTrigger = 'OnComplete' | 'OnPartial';

const TRIGGERS: readonly ResponseSubmittedTrigger[] = ['OnComplete', 'OnPartial'];

/** The message payload. Field names are PascalCase, like every other MJ wire shape. */
export interface ResponseSubmittedPayload {
  [key: string]: WorkJson;
  ResponseID: string;
  FormVersionID: string;
  FormDistributionID: string;
  Trigger: ResponseSubmittedTrigger;
  /** Required on an `OnPartial` message, refused on an `OnComplete` one; see the header. */
  PartialSaveKey: string | null;
}

/**
 * The work queue's own cap on a deduplication key (`MAX_DEDUPLICATION_KEY_LENGTH` in
 * `@memberjunction/work-queue-core`); restated so a key that would be refused at publish is refused
 * here, by name, before any transaction work.
 */
const MAX_DEDUPLICATION_KEY_LENGTH = 200;

/** A partial save's key: short, and free of the separator the deduplication key is built with. */
const PARTIAL_SAVE_KEY = /^[A-Za-z0-9_-]{1,64}$/;

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Why `payload` is not a valid `forms.response-submitted` payload, or `null` when it is. */
export function responseSubmittedPayloadRefusal(payload: WorkJson | undefined): string | null {
  if (payload === null || payload === undefined || typeof payload !== 'object' || Array.isArray(payload)) {
    return 'the payload is not an object';
  }
  for (const field of ['ResponseID', 'FormVersionID', 'FormDistributionID'] as const) {
    const value = payload[field];
    if (typeof value !== 'string' || !GUID.test(value)) {
      return `${field} is not an id`;
    }
  }
  const trigger = payload.Trigger;
  if (!TRIGGERS.some((t) => t === trigger)) {
    return `Trigger must be one of ${TRIGGERS.join(', ')}`;
  }
  const key = payload.PartialSaveKey ?? null;
  if (trigger === 'OnPartial' && (typeof key !== 'string' || !PARTIAL_SAVE_KEY.test(key))) {
    return 'an OnPartial message needs a PartialSaveKey of 1-64 letters, digits, "-" or "_"';
  }
  if (trigger === 'OnComplete' && key !== null) {
    return 'an OnComplete message carries no PartialSaveKey: a response completes once';
  }
  return null;
}

/** `payload` as a typed payload, or a throw naming what is wrong with it. */
export function readResponseSubmittedPayload(payload: WorkJson | undefined): ResponseSubmittedPayload {
  const refusal = responseSubmittedPayloadRefusal(payload);
  if (refusal) {
    throw new Error(`Not a ${RESPONSE_SUBMITTED_TOPIC} payload: ${refusal}.`);
  }
  return payload as ResponseSubmittedPayload;
}

/**
 * The deduplication key: the response id for a final submit, `<responseId>:partial:<key>` for a
 * partial save. Lower-cased, so the same response read back from SQL Server (upper-case GUIDs) and
 * minted by a client (lower-case) cannot produce two keys for one save.
 */
export function responseSubmittedDeduplicationKey(payload: ResponseSubmittedPayload): string {
  const responseId = payload.ResponseID.toLowerCase();
  const key = payload.Trigger === 'OnComplete' ? responseId : `${responseId}:partial:${payload.PartialSaveKey}`;
  if (key.length > MAX_DEDUPLICATION_KEY_LENGTH) {
    throw new Error(`The deduplication key for response ${responseId} is longer than ${MAX_DEDUPLICATION_KEY_LENGTH} characters.`);
  }
  return key;
}

/**
 * The publish request for one save: the validated payload, its deduplication key, a `trigger`
 * attribute (attributes are what subscription filters see — a host that wants only final submits
 * can filter on it), and the response id as PARTITION KEY. The `forms.run-automations` subscription
 * is `Ordered`, so one response's messages are handled in the order they were published — a partial
 * save's run never overtakes the final submit's. Built here so a publisher cannot forget the key.
 * Throws, before anything is published, on a payload the handler would refuse.
 */
export function responseSubmittedRequest(payload: ResponseSubmittedPayload): PublishRequest<ResponseSubmittedPayload> {
  const valid = readResponseSubmittedPayload(payload);
  return {
    Payload: valid,
    PartitionKey: valid.ResponseID.toLowerCase(),
    DeduplicationKey: responseSubmittedDeduplicationKey(valid),
    Attributes: { trigger: valid.Trigger },
  };
}
