/**
 * `Forms.ReplayAutomationEvent` through `ExecuteServer` — `Authorize`, then `InternalExecute`,
 * wrapped into a `RemoteOpResult` — over the emulated database (#311 Task 7).
 *
 * The store write (`replayDeadLetteredEvent`, pinned against SQL in `claim.spec.ts`) and the drain are module mocks:
 * this pins the wire — who may ask, what is read, what is refused, and that a refusal drains nothing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { FormsReplayAutomationEventInput } from '@mj-biz-apps/forms-entities';
import { AUTHOR, AUTOMATION_EVENTS, FORMS, automationEventRow, draftTables, formRow, formsWorld, type ServerSubclasses } from '../../testing/forms-world.js';

vi.mock('@memberjunction/global', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/global')>('@memberjunction/global');
  return { ...actual, RegisterClass: () => () => undefined };
});

vi.mock('@memberjunction/core', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
  return { ...actual, LogError: vi.fn(), LogStatus: vi.fn() };
});

vi.mock('@mj-biz-apps/forms-entities', async () => {
  const actual = await vi.importActual<typeof import('@mj-biz-apps/forms-entities')>('@mj-biz-apps/forms-entities');
  const { WriteThroughEntityBase } = await import('../../testing/write-through-entity.js');
  return { ...actual, mjBizAppsFormsFormEntity: WriteThroughEntityBase, mjBizAppsFormsFormVersionEntity: WriteThroughEntityBase };
});

const SYSTEM = { ID: 'system-1', Name: 'System' } as unknown as UserInfo;
vi.mock('@memberjunction/generic-database-provider', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/generic-database-provider')>('@memberjunction/generic-database-provider');
  return { ...actual, UserCache: { Instance: { GetSystemUser: () => ({ ID: 'system-1', Name: 'System' }) } } };
});

// The module mocks are the seam to the outbox: keep the real module, replace the two calls.
vi.mock('../../automation/outbox/claim.js', async () => {
  const actual = await vi.importActual<typeof import('../../automation/outbox/claim.js')>('../../automation/outbox/claim.js');
  return { ...actual, replayDeadLetteredEvent: vi.fn() };
});
vi.mock('../../automation/outbox/drain.js', async () => {
  const actual = await vi.importActual<typeof import('../../automation/outbox/drain.js')>('../../automation/outbox/drain.js');
  return { ...actual, drainAutomationOutbox: vi.fn() };
});

const { ReplayAutomationEventServerOperation, LoadReplayAutomationEventOperation } = await import('../ReplayAutomationEventServerOperation.js');
const { replayDeadLetteredEvent } = await import('../../automation/outbox/claim.js');
const { drainAutomationOutbox } = await import('../../automation/outbox/drain.js');
const { LogError } = await import('@memberjunction/core');
const { FormEntityServer } = await import('../../entities/FormEntityServer.js');
const { FormVersionEntityServer } = await import('../../entities/FormVersionEntityServer.js');

const SUBCLASSES = { FormEntityServer, FormVersionEntityServer } as unknown as ServerSubclasses;
const EVENT = '5c1f6a52-71c4-4b8e-9a3e-0f2f6f0a2222';
const RESPONSE = 'a8d1a6a4-0a53-4d52-9b62-0d5d0f6f1111';
const replay = vi.mocked(replayDeadLetteredEvent);
const drain = vi.mocked(drainAutomationOutbox);

function world(grants: { forms?: boolean } = {}, eventStatus = 'DeadLetter') {
  const db = formsWorld(
    SUBCLASSES,
    {
      ...draftTables(),
      [FORMS]: [formRow()],
      [AUTOMATION_EVENTS]: [automationEventRow({ ID: EVENT, FormResponseID: RESPONSE, Status: eventStatus })],
    },
    { updatePermissions: { [FORMS]: grants.forms ?? true } },
  );
  // `Authorize` receives no provider, so it reads permissions from the process metadata.
  Metadata.Provider = db.provider;
  return db;
}

function run(db: ReturnType<typeof world>, input: unknown, user: UserInfo = AUTHOR) {
  return new ReplayAutomationEventServerOperation().ExecuteServer(input as FormsReplayAutomationEventInput, {
    provider: db.provider as IMetadataProvider,
    user,
    emitProgress: () => undefined,
  });
}

let original: IMetadataProvider | undefined;
beforeEach(() => {
  replay.mockReset();
  drain.mockReset();
  vi.mocked(LogError).mockClear();
  try {
    original = Metadata.Provider;
  } catch {
    original = undefined;
  }
});
afterEach(() => {
  Metadata.Provider = original as IMetadataProvider;
});

describe('Forms.ReplayAutomationEvent', () => {
  it('is registered under its operation key, with the forms:write scope and an anchor the bootstrap calls', () => {
    const operation = new ReplayAutomationEventServerOperation();
    expect(operation.OperationKey).toBe('Forms.ReplayAutomationEvent');
    expect(operation.RequiredScope).toBe('forms:write');
    expect(LoadReplayAutomationEventOperation()).toBeUndefined();
  });

  it('re-queues a dead letter and drains its response once, returning Pending', async () => {
    const db = world();
    replay.mockResolvedValue(true);
    drain.mockResolvedValue({ claimed: 1, completed: 1, retried: 0, deadLettered: 0, abandoned: 0, roundsCapped: false });

    const result = await run(db, { FormAutomationEventID: EVENT });

    expect(result.ResultCode).toBe('SUCCESS');
    expect(result.Output).toEqual({ FormAutomationEventID: EVENT, Status: 'Pending' });
    expect(replay).toHaveBeenCalledTimes(1);
    expect(replay.mock.calls[0]?.[1]).toBe(EVENT);
    expect(drain).toHaveBeenCalledTimes(1);
    expect(drain.mock.calls[0]?.[0]).toEqual({ reason: 'replay', responseId: RESPONSE });
    // The author may not hold the grants the drain's planning reads need: it runs as the system user.
    expect(drain.mock.calls[0]?.[1]).toMatchObject({ ID: SYSTEM.ID });
  });

  it('still reports Pending when the drain fails: the event is queued and the sweep will run it', async () => {
    const db = world();
    replay.mockResolvedValue(true);
    drain.mockRejectedValue(new Error('outbox unreadable'));

    const result = await run(db, { FormAutomationEventID: EVENT });

    expect(result.ResultCode).toBe('SUCCESS');
    expect(result.Output).toEqual({ FormAutomationEventID: EVENT, Status: 'Pending' });
    expect(LogError).toHaveBeenCalledWith(expect.stringContaining(EVENT));
  });

  it('refuses an event that is no longer dead-lettered, naming it, and drains nothing', async () => {
    const db = world({}, 'Complete');
    replay.mockResolvedValue(false);

    const result = await run(db, { FormAutomationEventID: EVENT });

    expect(result.Success).toBe(false);
    expect(result.ErrorMessage).toContain(EVENT);
    expect(result.ErrorMessage).toContain('not dead-lettered');
    expect(result.ErrorMessage).toContain('Complete');
    expect(drain).not.toHaveBeenCalled();
  });

  it('refuses an unknown event, naming it, and neither replays nor drains', async () => {
    const db = world();
    const unknown = '9e0b7d3a-3f43-4f07-8d6b-2b2f0f0a3333';

    const result = await run(db, { FormAutomationEventID: unknown });

    expect(result.Success).toBe(false);
    expect(result.ErrorMessage).toContain(unknown);
    expect(result.ErrorMessage).toContain('was not found');
    expect(replay).not.toHaveBeenCalled();
    expect(drain).not.toHaveBeenCalled();
  });

  it('refuses a request with no event id', async () => {
    const db = world();

    const result = await run(db, {});

    expect(result.Success).toBe(false);
    expect(result.ErrorMessage).toMatch(/Forms\.ReplayAutomationEvent: FormAutomationEventID is required/);
    expect(replay).not.toHaveBeenCalled();
    expect(drain).not.toHaveBeenCalled();
  });

  it('refuses an anonymous magic-link session at Authorize', async () => {
    const db = world();
    const anonymous = { ...AUTHOR, IsMagicLinkAnonymous: true } as unknown as UserInfo;

    expect((await run(db, { FormAutomationEventID: EVENT }, anonymous)).ResultCode).toBe('FORBIDDEN');
    expect(replay).not.toHaveBeenCalled();
    expect(drain).not.toHaveBeenCalled();
  });

  it("refuses a respondent's magic-link scope at Authorize", async () => {
    const db = world();
    const scoped = { ...AUTHOR, MagicLinkScope: { ResourceID: 'd1', ResourceType: 'Form Distribution' } } as unknown as UserInfo;

    expect((await run(db, { FormAutomationEventID: EVENT }, scoped)).ResultCode).toBe('FORBIDDEN');
    expect(replay).not.toHaveBeenCalled();
    expect(drain).not.toHaveBeenCalled();
  });

  it('refuses a user without Update on Forms at Authorize', async () => {
    const db = world({ forms: false });

    expect((await run(db, { FormAutomationEventID: EVENT })).ResultCode).toBe('FORBIDDEN');
    expect(replay).not.toHaveBeenCalled();
    expect(drain).not.toHaveBeenCalled();
  });
});
