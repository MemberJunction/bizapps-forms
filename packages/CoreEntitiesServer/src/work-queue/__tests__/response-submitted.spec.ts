/**
 * The `forms.response-submitted` message contract — what the submit path publishes and the
 * `Forms.RunAutomations` handler reads (spec #303 §5, §12). One module, both ends.
 */
import { describe, expect, it } from 'vitest';
import {
  readResponseSubmittedPayload,
  responseSubmittedDeduplicationKey,
  responseSubmittedPayloadRefusal,
  responseSubmittedRequest,
  type ResponseSubmittedPayload,
} from '../response-submitted.js';

const RESPONSE = 'AAAAAAAA-1111-4111-8111-000000000001';
const VERSION = 'bbbbbbbb-2222-4222-8222-000000000002';
const DISTRIBUTION = 'cccccccc-3333-4333-8333-000000000003';

function finalPayload(overrides: Partial<ResponseSubmittedPayload> = {}): ResponseSubmittedPayload {
  return {
    ResponseID: RESPONSE,
    FormVersionID: VERSION,
    FormDistributionID: DISTRIBUTION,
    Trigger: 'OnComplete',
    PartialSaveKey: null,
    ...overrides,
  };
}

describe('the deduplication key', () => {
  it('is the response id for a final submit — one completion per response', () => {
    expect(responseSubmittedDeduplicationKey(finalPayload())).toBe(RESPONSE.toLowerCase());
  });

  it('is <response>:partial:<key> for a partial save, so each save is its own message', () => {
    const first = responseSubmittedDeduplicationKey(finalPayload({ Trigger: 'OnPartial', PartialSaveKey: '1' }));
    const second = responseSubmittedDeduplicationKey(finalPayload({ Trigger: 'OnPartial', PartialSaveKey: '2' }));

    expect(first).toBe(`${RESPONSE.toLowerCase()}:partial:1`);
    expect(second).not.toBe(first);
  });

  it('folds the response id, so an upper-case read-back and a lower-case client id are one key', () => {
    const upper = responseSubmittedDeduplicationKey(finalPayload({ ResponseID: RESPONSE.toUpperCase() }));
    const lower = responseSubmittedDeduplicationKey(finalPayload({ ResponseID: RESPONSE.toLowerCase() }));

    expect(upper).toBe(lower);
  });
});

describe('the payload is checked at BOTH ends', () => {
  it('accepts a final submit and a partial save', () => {
    expect(responseSubmittedPayloadRefusal(finalPayload())).toBeNull();
    expect(responseSubmittedPayloadRefusal(finalPayload({ Trigger: 'OnPartial', PartialSaveKey: 'h-3f9a' }))).toBeNull();
  });

  it.each([
    ['no payload', undefined, /not an object/],
    ['an array', [], /not an object/],
    ['a response id that is not an id', { ...finalPayload(), ResponseID: 'x' }, /ResponseID is not an id/],
    ['a missing version id', { ...finalPayload(), FormVersionID: null }, /FormVersionID is not an id/],
    ['an unknown trigger', { ...finalPayload(), Trigger: 'OnSomething' }, /Trigger must be one of/],
    ['a partial save without its key', { ...finalPayload(), Trigger: 'OnPartial', PartialSaveKey: null }, /needs a PartialSaveKey/],
    ['a partial key carrying the separator', { ...finalPayload(), Trigger: 'OnPartial', PartialSaveKey: 'a:b' }, /needs a PartialSaveKey/],
    ['a final submit WITH a partial key', { ...finalPayload(), PartialSaveKey: '1' }, /carries no PartialSaveKey/],
  ])('refuses %s', (_label, payload, reason) => {
    expect(responseSubmittedPayloadRefusal(payload as never)).toMatch(reason);
    expect(() => readResponseSubmittedPayload(payload as never)).toThrow(/Not a forms\.response-submitted payload/);
  });
});

describe('the publish request', () => {
  it('carries the payload, its key and a trigger attribute a subscription can filter on', () => {
    const request = responseSubmittedRequest(finalPayload({ Trigger: 'OnPartial', PartialSaveKey: '7' }));

    expect(request.Payload?.ResponseID).toBe(RESPONSE);
    expect(request.DeduplicationKey).toBe(`${RESPONSE.toLowerCase()}:partial:7`);
    expect(request.Attributes).toEqual({ trigger: 'OnPartial' });
  });

  it('is partitioned by the response, so one response\'s messages are handled in publish order (Ordered subscription)', () => {
    const partial = responseSubmittedRequest(finalPayload({ Trigger: 'OnPartial', PartialSaveKey: '1', ResponseID: RESPONSE.toUpperCase() }));
    const final = responseSubmittedRequest(finalPayload({ ResponseID: RESPONSE.toLowerCase() }));

    expect(partial.PartitionKey).toBe(RESPONSE.toLowerCase());
    expect(final.PartitionKey).toBe(partial.PartitionKey);
  });

  it('is refused before publishing when the handler would refuse the payload', () => {
    expect(() => responseSubmittedRequest(finalPayload({ Trigger: 'OnPartial', PartialSaveKey: null }))).toThrow(/PartialSaveKey/);
  });
});
