/**
 * The owner notice of a final submit's dead letter (#311): who it goes to, what it says, and that it
 * is best-effort — a missing owner, a missing response, a send that throws or one that RETURNS a
 * failure (the type is not seeded on a host before the release ships it) is logged and never
 * thrown. The two MJ effects are stood in for through the seams; the default owner read is run once
 * against the fake provider's tables.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import type { SendNotificationParams } from '@memberjunction/notifications';
import { makeFakeProvider, type FakeProviderConfig } from '../../../testing/index.js';
import { FORMS_ENTITY } from '../../../shared/entity-names.js';

const logged = vi.hoisted(() => ({ errors: [] as string[], statuses: [] as string[] }));
vi.mock('@memberjunction/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/core')>()),
  LogError: (m: string) => logged.errors.push(m),
  LogStatus: (m: string) => logged.statuses.push(m),
}));

const { sendDeadLetterNotice, DEAD_LETTER_NOTIFICATION_TYPE } = await import('../dead-letter-notice.js');
type Notice = Parameters<typeof sendDeadLetterNotice>[0];

const SYSTEM = { ID: 'system-1', Name: 'System' } as unknown as UserInfo;
const RESPONSE = '11111111-1111-4111-8111-111111111111';
const EVENT = 'EEEEEEEE-0000-4000-8000-00000000000E';
const FORM = 'FFFFFFFF-0000-4000-8000-00000000000F';
const OWNER = '0000000A-0000-4000-8000-00000000000A';

function notice(overrides: Partial<Notice> = {}): Notice {
  return {
    responseId: RESPONSE,
    eventId: EVENT,
    trigger: 'OnComplete',
    reason: 'Gave up after 5 attempts: Step(s) "Send email" failed in a way another attempt may fix.',
    stepsClosed: ['step-a', 'step-b'],
    ...overrides,
  };
}

/** A provider able to hand out isolated instances, as `drain.spec.ts`'s `source()`. */
function source(config: FakeProviderConfig = {}) {
  const db = makeFakeProvider(config);
  const instances: unknown[] = [];
  Object.assign(db.provider, {
    CreateIndependentInstance: async () => {
      const own = Object.create(db.provider) as DatabaseProviderBase;
      Object.assign(own, { ReleaseIndependentInstance: async () => undefined });
      instances.push(own);
      return own;
    },
  });
  return { ...db, instances };
}

function recordingSend(result: { success: boolean; errors?: string[] } = { success: true }) {
  const calls: { params: SendNotificationParams; user: UserInfo }[] = [];
  const send = async (params: SendNotificationParams, user: UserInfo) => {
    calls.push({ params, user });
    return result;
  };
  return { send, calls };
}

beforeEach(() => {
  logged.errors.length = 0;
  logged.statuses.length = 0;
});

describe('a final dead letter with an owner', () => {
  it('sends the owner one notice of the Form Automation Failed type, as the drain user, naming the form, the reason and the steps', async () => {
    const src = source();
    const owners: { responseId: string; provider: unknown; user: unknown }[] = [];
    const { send, calls } = recordingSend();

    await sendDeadLetterNotice(notice(), SYSTEM, src.provider, {
      findOwner: async (responseId, provider, user) => {
        owners.push({ responseId, provider, user });
        return { formName: 'Intake', ownerUserId: OWNER };
      },
      send,
    });

    expect(owners).toHaveLength(1);
    expect(owners[0].responseId).toBe(RESPONSE);
    expect(owners[0].user).toBe(SYSTEM);
    expect(src.instances).toContain(owners[0].provider);
    expect(calls).toHaveLength(1);
    expect(calls[0].user).toBe(SYSTEM);
    const params = calls[0].params;
    expect(params).toMatchObject({
      userId: OWNER,
      typeNameOrId: 'Form Automation Failed',
      resourceConfiguration: { FormResponseID: RESPONSE, FormAutomationEventID: EVENT },
    });
    expect(DEAD_LETTER_NOTIFICATION_TYPE).toBe('Form Automation Failed');
    expect(params.title).toContain('Intake');
    expect(params.message).toContain(notice().reason);
    expect(params.message).toContain('step-a, step-b');
    expect(params.resourceTypeId).toBeUndefined();
    expect(logged.errors).toEqual([]);
  });
});

describe('nobody to notify', () => {
  it('a form with no owner sends nothing and logs one status line with the response', async () => {
    const { send, calls } = recordingSend();

    await sendDeadLetterNotice(notice(), SYSTEM, source().provider, { findOwner: async () => ({ formName: 'Intake', ownerUserId: null }), send });

    expect(calls).toEqual([]);
    expect(logged.statuses).toHaveLength(1);
    expect(logged.statuses[0]).toContain(RESPONSE);
    expect(logged.errors).toEqual([]);
  });

  it('a response that no longer exists sends nothing and logs one status line with the response', async () => {
    const { send, calls } = recordingSend();

    await sendDeadLetterNotice(notice(), SYSTEM, source().provider, { findOwner: async () => null, send });

    expect(calls).toEqual([]);
    expect(logged.statuses).toHaveLength(1);
    expect(logged.statuses[0]).toContain(RESPONSE);
  });
});

describe('best-effort', () => {
  it('a send that throws resolves, with one error line naming the response', async () => {
    await expect(
      sendDeadLetterNotice(notice(), SYSTEM, source().provider, {
        findOwner: async () => ({ formName: 'Intake', ownerUserId: OWNER }),
        send: async () => {
          throw new Error('SMTP down');
        },
      }),
    ).resolves.toBeUndefined();

    expect(logged.errors).toHaveLength(1);
    expect(logged.errors[0]).toContain(RESPONSE);
    expect(logged.errors[0]).toContain('SMTP down');
  });

  it('a send that RETURNS a failure (the type is not seeded yet) is logged as a failure with the response and the error — never as sent', async () => {
    const { send } = recordingSend({ success: false, errors: ['Notification type not found: Form Automation Failed'] });

    await sendDeadLetterNotice(notice(), SYSTEM, source().provider, { findOwner: async () => ({ formName: 'Intake', ownerUserId: OWNER }), send });

    expect(logged.errors).toHaveLength(1);
    expect(logged.errors[0]).toContain(RESPONSE);
    expect(logged.errors[0]).toContain('Notification type not found: Form Automation Failed');
    expect(logged.statuses).toEqual([]);
  });

  it('an owner read that throws resolves, with one error line naming the response, and sends nothing', async () => {
    const { send, calls } = recordingSend();

    await expect(
      sendDeadLetterNotice(notice(), SYSTEM, source().provider, {
        findOwner: async () => {
          throw new Error('could not read the response');
        },
        send,
      }),
    ).resolves.toBeUndefined();

    expect(calls).toEqual([]);
    expect(logged.errors).toHaveLength(1);
    expect(logged.errors[0]).toContain(RESPONSE);
  });

  it('no isolated instance to read on resolves, with one error line naming the response', async () => {
    const { send, calls } = recordingSend();

    await sendDeadLetterNotice(notice(), SYSTEM, null, { findOwner: async () => ({ formName: 'Intake', ownerUserId: OWNER }), send });

    expect(calls).toEqual([]);
    expect(logged.errors.filter((l) => l.includes(RESPONSE))).toHaveLength(1);
  });
});

describe('the default owner read', () => {
  const tables = {
    [FORMS_ENTITY.FormResponse]: [{ ID: RESPONSE, FormID: FORM }],
    [FORMS_ENTITY.Form]: [{ ID: FORM, Name: 'Intake', OwnerUserID: OWNER }],
  };

  it('reads the response\'s form, then its name and owner, as simple rows on the isolated instance', async () => {
    const src = source({ tables });
    const { send, calls } = recordingSend();

    await sendDeadLetterNotice(notice(), SYSTEM, src.provider, { send });

    expect(calls).toHaveLength(1);
    expect(calls[0].params).toMatchObject({ userId: OWNER });
    expect(calls[0].params.title).toContain('Intake');
    expect(src.viewCalls.map((c) => [c.params.EntityName, c.params.ResultType, c.user])).toEqual([
      [FORMS_ENTITY.FormResponse, 'simple', SYSTEM],
      [FORMS_ENTITY.Form, 'simple', SYSTEM],
    ]);
  });

  it('a response row that cannot be found sends nothing and logs one status line', async () => {
    const src = source({ tables: { ...tables, [FORMS_ENTITY.FormResponse]: [] } });
    const { send, calls } = recordingSend();

    await sendDeadLetterNotice(notice(), SYSTEM, src.provider, { send });

    expect(calls).toEqual([]);
    expect(logged.statuses).toHaveLength(1);
    expect(logged.statuses[0]).toContain(RESPONSE);
  });

  it('a failed read is logged as an error with the response, and sends nothing', async () => {
    const src = source({ tables, failRunViewFor: FORMS_ENTITY.Form });
    const { send, calls } = recordingSend();

    await sendDeadLetterNotice(notice(), SYSTEM, src.provider, { send });

    expect(calls).toEqual([]);
    expect(logged.errors).toHaveLength(1);
    expect(logged.errors[0]).toContain(RESPONSE);
  });
});
