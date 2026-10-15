/**
 * The on-submit automations a save OWES, from the submit path (#303 Task 8, spec §5/§12).
 *
 * This spec used to pin the inline run (`FormAutomationEngine.RunForResponse` on an isolated
 * provider, as the automation principal, best-effort after the write). That path is deleted: the save
 * now commits a `forms.response-submitted` message in the SAME transaction as the response, and the
 * `Forms.RunAutomations` handler runs the steps (its behaviour is specced in
 * `FormAutomationEngine.run.spec.ts` and `RunAutomationsHandler.spec.ts`). What this pins is the
 * submit side of that contract: which saves owe a message, what it carries, that it is published
 * inside the transaction, and that a save whose work cannot be queued stores nothing.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { PublishedFormAutomation, PublishedFormDefinition } from '@mj-biz-apps/forms-entities';
import { recordingQueue, saveThroughEngine, type EngineSaveContext, type EngineSaveSubmission, type RecordingQueue } from './harness.js';
import { SUBMIT_FAILED_MESSAGE } from '../../FormSubmissionEngine.js';
import { resetPublicSubmitConfigForTests } from '../../../submission/config.js';
import { FormsRateLimiter } from '../../../submission/rate-limit.js';
import {
  makeContextUser,
  makeDefinition,
  makeDistribution,
  makeFakeProvider,
  makeVersion,
  respondentPermissions,
  type FakeProvider,
} from '../../../testing/index.js';

const FORM_RESPONSE_ENTITY = 'MJ_BizApps_Forms: Form Responses';
const ELEVATED = { ID: 'elevated-1', Name: 'System' } as unknown as UserInfo;

function automation(overrides: Partial<PublishedFormAutomation> = {}): PublishedFormAutomation {
  return {
    id: 'auto-1',
    name: 'Followup',
    targetType: 'Action',
    actionId: 'action-1',
    trigger: 'OnComplete',
    executionMode: 'Sync',
    displayOrder: 0,
    continueOnError: true,
    isActive: true,
    ...overrides,
  };
}

function submission(overrides: Partial<EngineSaveSubmission> = {}): EngineSaveSubmission {
  return {
    distributionSlug: 'public-1',
    formVersionId: 'ver-1',
    clientResponseId: '11111111-2222-4333-8444-555555555555',
    answers: [{ questionId: 'q-name', textValue: 'Ada Lovelace' }],
    ...overrides,
  };
}

/** A configured form with the given steps; the queue records what the save published. */
function build(
  automations: PublishedFormAutomation[],
  overrides: Partial<PublishedFormDefinition> = {},
): { ctx: EngineSaveContext; fake: FakeProvider; queue: RecordingQueue } {
  const definition = makeDefinition({
    settings: { anonymousAllowed: true, captchaRequired: false, confirmationMessage: 'Thanks!', onSubmitMode: 'Configured' },
    automations,
    ...overrides,
  });
  const fake = makeFakeProvider({
    distribution: makeDistribution({ CaptchaRequired: false, MaxResponses: null, ResponseCount: 0 }),
    version: makeVersion(definition),
    createPermissions: respondentPermissions(),
  });
  const queue = recordingQueue();
  const ctx: EngineSaveContext = { provider: fake.provider, contextUser: makeContextUser(), elevatedUser: ELEVATED, sessionId: 'sess-abc', queue };
  return { ctx, fake, queue };
}

beforeEach(() => {
  delete process.env.FORMS_TURNSTILE_SECRET;
  resetPublicSubmitConfigForTests();
  FormsRateLimiter.Instance.resetForTests();
});

describe('the Work Queue message a final submit owes', () => {
  it('publishes ONE OnComplete message inside the save transaction — and runs nothing inline', async () => {
    const { ctx, fake, queue } = build([automation()]);

    const result = await saveThroughEngine(ctx, submission());

    expect(result.success).toBe(true);
    expect(queue.published).toEqual([
      { ResponseID: result.responseId, FormVersionID: 'ver-1', FormDistributionID: 'dist-1', Trigger: 'OnComplete', PartialSaveKey: null },
    ]);
    // Published at depth 1: inside the transaction that wrote the response, so the two commit
    // together. The transaction committed once, with nothing nested left open.
    expect(queue.depths).toEqual([1]);
    expect(fake.transactions).toEqual(['begin', 'commit']);
  });

  it('owes nothing when no active step fires on completion', async () => {
    const { ctx, queue } = build([automation({ trigger: 'OnPartial' }), automation({ id: 'auto-2', isActive: false })]);

    const result = await saveThroughEngine(ctx, submission());

    expect(result.success).toBe(true);
    expect(queue.published).toEqual([]);
  });

  it('owes nothing for a knockout: a screened-out respondent fires no automations', async () => {
    const { ctx, queue } = build([automation({ trigger: 'OnCompleteOrPartial' })], {
      endScreens: [{ id: 'screen-no', screenType: 'Ending', title: 'Sorry', displayOrder: 1, isDisqualification: true }],
      pages: [
        {
          id: 'page-1',
          displayOrder: 1,
          conditionalRule: { jump: [{ when: { all: [{ questionId: 'q-name', op: 'equals', value: 'no' }] }, target: { kind: 'ending', id: 'screen-no' } }] },
          questions: [{ id: 'q-name', type: 'ShortText', prompt: 'Name', isRequired: true, displayOrder: 1, options: [] }],
        },
      ],
    });

    const result = await saveThroughEngine(ctx, submission({ answers: [{ questionId: 'q-name', textValue: 'no' }] }));

    expect(result.status).toBe('Disqualified');
    expect(queue.published).toEqual([]);
  });

  it('stores NOTHING when the publish is rejected — the response and its message are one unit', async () => {
    const { ctx, fake, queue } = build([automation()]);
    queue.failNextWith = 'the work queue rejected the message (TransportUnavailable)';

    const result = await saveThroughEngine(ctx, submission());

    expect(result.success).toBe(false);
    expect(result.errors[0].message).toBe(SUBMIT_FAILED_MESSAGE);
    expect(JSON.stringify(result)).not.toContain('TransportUnavailable');
    expect(fake.saved.map((r) => r.entityName)).not.toContain(FORM_RESPONSE_ENTITY);
    expect(fake.statements.some((s) => /UPDATE/.test(s.sql) && s.inTransaction)).toBe(true); // the slot was taken…
    expect(fake.transactions).toEqual(['begin', 'rollback']); // …and rolled back with the rest
  });

  it('refuses the save, storing nothing, when this host cannot queue the work it owes', async () => {
    const { ctx, fake, queue } = build([automation()]);
    queue.ready = false;

    const result = await saveThroughEngine(ctx, submission());

    expect(result.success).toBe(false);
    expect(result.errors[0].message).toBe(SUBMIT_FAILED_MESSAGE);
    expect(fake.saved).toHaveLength(0);
    expect(fake.transactions).toEqual([]);
  });
});

describe('the Work Queue message a partial save owes (spec §12)', () => {
  it('publishes an OnPartial message keyed by a hash of the stored answers', async () => {
    const { ctx, queue } = build([automation({ trigger: 'OnPartial' })]);

    const result = await saveThroughEngine(ctx, submission({ partial: true }));

    expect(result.status).toBe('Partial');
    expect(result.outcome).toBe('continue');
    expect(queue.published).toHaveLength(1);
    expect(queue.published[0]).toMatchObject({ ResponseID: result.responseId, Trigger: 'OnPartial' });
    expect(queue.published[0].PartialSaveKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it('gives an identical re-save the SAME key (so the topic answers it Duplicate) and a changed one a new key', async () => {
    const { ctx, queue } = build([automation({ trigger: 'OnCompleteOrPartial' })]);

    await saveThroughEngine(ctx, submission({ partial: true }));
    await saveThroughEngine(ctx, submission({ partial: true }));
    await saveThroughEngine(ctx, submission({ partial: true, answers: [{ questionId: 'q-name', textValue: 'Grace Hopper' }] }));

    const keys = queue.published.map((m) => m.PartialSaveKey);
    expect(keys).toHaveLength(3);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it('owes nothing for a partial save when no step fires on a partial, and nothing for the legacy hooks', async () => {
    const configured = build([automation({ trigger: 'OnComplete' })]);
    const legacy = build([], { settings: { anonymousAllowed: true, captchaRequired: false, confirmationMessage: 'Thanks!' } });

    await saveThroughEngine(configured.ctx, submission({ partial: true }));
    await saveThroughEngine(legacy.ctx, submission({ partial: true }));

    expect(configured.queue.published).toEqual([]);
    expect(legacy.queue.published).toEqual([]);
  });
});
