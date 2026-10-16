/**
 * The response-submitted event contract (#303): what the submit path writes into the automation
 * outbox. Checked before any write, so a malformed event never reaches the table.
 */
import { describe, expect, it } from 'vitest';
import { responseSubmittedPayloadRefusal, type ResponseSubmittedPayload } from '../response-submitted-event.js';

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

describe('the event is checked before it is written', () => {
  it('accepts a final submit and a partial save', () => {
    expect(responseSubmittedPayloadRefusal(finalPayload())).toBeNull();
    expect(responseSubmittedPayloadRefusal(finalPayload({ Trigger: 'OnPartial', PartialSaveKey: 'h-3f9a' }))).toBeNull();
  });

  it.each([
    ['a response id that is not an id', { ...finalPayload(), ResponseID: 'x' }, /ResponseID is not an id/],
    ['a missing version id', { ...finalPayload(), FormVersionID: null }, /FormVersionID is not an id/],
    ['an unknown trigger', { ...finalPayload(), Trigger: 'OnSomething' }, /Trigger must be one of/],
    ['a partial save without its key', { ...finalPayload(), Trigger: 'OnPartial', PartialSaveKey: null }, /needs a PartialSaveKey/],
    ['a partial key carrying the separator', { ...finalPayload(), Trigger: 'OnPartial', PartialSaveKey: 'a:b' }, /needs a PartialSaveKey/],
    ['a final submit WITH a partial key', { ...finalPayload(), PartialSaveKey: '1' }, /carries no PartialSaveKey/],
  ])('refuses %s', (_label, payload, reason) => {
    expect(responseSubmittedPayloadRefusal(payload as never)).toMatch(reason);
  });
});
