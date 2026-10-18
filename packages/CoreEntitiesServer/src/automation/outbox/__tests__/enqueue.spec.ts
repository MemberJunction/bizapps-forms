/**
 * The submit path's half of the automation outbox (#303): what one save writes into
 * `FormAutomationEvent`, inside the caller's transaction.
 */
import { describe, expect, it } from 'vitest';
import { makeContextUser, makeFakeProvider, type FakeRow } from '../../../testing/index.js';
import { OUTBOX_RESPONSE_SUBMITTED } from '../enqueue.js';
import type { ResponseSubmittedPayload } from '../response-submitted-event.js';

const EVENTS = 'MJ_BizApps_Forms: Form Automation Events';
const RESPONSE = 'AAAAAAAA-1111-4111-8111-000000000001';
const VERSION = 'bbbbbbbb-2222-4222-8222-000000000002';
const DISTRIBUTION = 'cccccccc-3333-4333-8333-000000000003';

function payload(overrides: Partial<ResponseSubmittedPayload> = {}): ResponseSubmittedPayload {
  return { ResponseID: RESPONSE, FormVersionID: VERSION, FormDistributionID: DISTRIBUTION, Trigger: 'OnComplete', PartialSaveKey: null, ...overrides };
}

function world(events: FakeRow[] = [], failSave?: string) {
  return makeFakeProvider({ tables: { [EVENTS]: events }, failSaveWhen: failSave ? (name) => (name === EVENTS ? failSave : false) : undefined });
}

describe('OUTBOX_RESPONSE_SUBMITTED.Publish', () => {
  it('inserts one Pending OnComplete event with no PartialSaveKey', async () => {
    const db = world();

    await OUTBOX_RESPONSE_SUBMITTED.Publish(payload(), db.provider, makeContextUser());

    expect(db.tables[EVENTS]).toHaveLength(1);
    expect(db.tables[EVENTS][0]).toMatchObject({ FormResponseID: RESPONSE, Trigger: 'OnComplete', PartialSaveKey: null, Status: 'Pending' });
  });

  it('skips a partial whose key equals the latest partial\'s', async () => {
    const db = world([
      { ID: 'e1', FormResponseID: RESPONSE, Trigger: 'OnPartial', PartialSaveKey: 'old', Status: 'Complete', __mj_CreatedAt: '2026-10-16T10:00:00Z' },
      { ID: 'e2', FormResponseID: RESPONSE, Trigger: 'OnPartial', PartialSaveKey: 'same', Status: 'Pending', __mj_CreatedAt: '2026-10-16T10:01:00Z' },
    ]);

    await OUTBOX_RESPONSE_SUBMITTED.Publish(payload({ Trigger: 'OnPartial', PartialSaveKey: 'same' }), db.provider, makeContextUser());

    expect(db.tables[EVENTS]).toHaveLength(2);
    // The drain writes this table with raw SQL, which fires no entity event, so a cached read could be stale.
    expect(db.viewCalls.find((c) => c.params.EntityName === EVENTS)?.params.BypassCache).toBe(true);
  });

  it('inserts a partial whose key differs from the latest partial\'s, even if an older one matches', async () => {
    const db = world([
      { ID: 'e1', FormResponseID: RESPONSE, Trigger: 'OnPartial', PartialSaveKey: 'a', Status: 'Complete', __mj_CreatedAt: '2026-10-16T10:00:00Z' },
      { ID: 'e2', FormResponseID: RESPONSE, Trigger: 'OnPartial', PartialSaveKey: 'b', Status: 'Complete', __mj_CreatedAt: '2026-10-16T10:01:00Z' },
    ]);

    await OUTBOX_RESPONSE_SUBMITTED.Publish(payload({ Trigger: 'OnPartial', PartialSaveKey: 'a' }), db.provider, makeContextUser());

    expect(db.tables[EVENTS]).toHaveLength(3);
    expect(db.tables[EVENTS][2]).toMatchObject({ Trigger: 'OnPartial', PartialSaveKey: 'a', Status: 'Pending' });
  });

  it('brings the response\'s waiting partial events forward when it completes, so a partial in backoff cannot hold the final back', async () => {
    const db = world();

    await OUTBOX_RESPONSE_SUBMITTED.Publish(payload(), db.provider, makeContextUser());

    const pull = db.statements.find((st) => /UPDATE/.test(st.sql));
    expect(pull?.sql).toMatch(/SET \[NextAttemptAt\] = SYSDATETIMEOFFSET\(\)/);
    expect(pull?.sql).toMatch(new RegExp(`\\[FormResponseID\\] = '${RESPONSE}' AND \\[Trigger\\] = 'OnPartial' AND \\[Status\\] = 'Pending'`));
    // Only rows still waiting: one already due keeps its NextAttemptAt, so it keeps its place.
    expect(pull?.sql).toMatch(/AND \[NextAttemptAt\] > SYSDATETIMEOFFSET\(\)$/);
  });

  it('pulls nothing forward for a partial save', async () => {
    const db = world();

    await OUTBOX_RESPONSE_SUBMITTED.Publish(payload({ Trigger: 'OnPartial', PartialSaveKey: 'k' }), db.provider, makeContextUser());

    expect(db.statements.filter((st) => /UPDATE/.test(st.sql))).toEqual([]);
  });

  it('throws naming the response when the save fails, so the save\'s transaction rolls back', async () => {
    const db = world([], 'Violation of UNIQUE KEY constraint');

    await expect(OUTBOX_RESPONSE_SUBMITTED.Publish(payload(), db.provider, makeContextUser())).rejects.toThrow(
      new RegExp(`${RESPONSE}.*Violation of UNIQUE KEY constraint`),
    );
  });

  it('refuses an OnComplete payload carrying a PartialSaveKey before any write', async () => {
    const db = world();

    await expect(OUTBOX_RESPONSE_SUBMITTED.Publish(payload({ PartialSaveKey: 'x' }), db.provider, makeContextUser())).rejects.toThrow(
      /carries no PartialSaveKey/,
    );
    expect(db.tables[EVENTS]).toHaveLength(0);
  });
});
