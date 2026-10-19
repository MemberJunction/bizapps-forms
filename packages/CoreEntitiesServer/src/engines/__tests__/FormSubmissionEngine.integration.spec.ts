/**
 * `FormSubmissionEngine` against a REAL SQL Server provider — DW9 and DW10 of spec #303, which a fake
 * cannot prove because both are claims about what the database does:
 *  - DW9: two concurrent final saves on a link with `MaxResponses = 1` yield one success and one
 *    quota refusal, and `ResponseCount` ends at 1 — and the refusal comes from the conditional
 *    UPDATE: the second save is held until it is BLOCKED by the first's open transaction, by which
 *    time it has already read `ResponseCount` 0 (READ_COMMITTED_SNAPSHOT) and passed the read-time
 *    pre-check — so the only thing left that can refuse it is the UPDATE. (Where it first blocks is
 *    the database's business — its response INSERT's foreign-key check on the link row the first
 *    save holds — not necessarily the UPDATE itself.);
 *  - promotion of ONE draft by two concurrent finals (review finding 2) takes ONE slot and queues ONE
 *    message: the second waits on the draft row's update lock and finds it sealed;
 *  - DW10: a final save writes the response and its `FormAutomationEvent` in ONE transaction — a
 *    forced failure AFTER the event is written leaves neither the response nor the event;
 *  - final review I2: a distribution copy loaded BEFORE a submission (the builder's), saved after it,
 *    leaves `ResponseCount` where the atomic UPDATE put it — whether the copy's count is merely stale
 *    or the client set it, as the GraphQL update path's `SetMany` does.
 *
 * OPT-IN. Skipped unless `FORMS_INTEGRATION_DB` is set, because it needs the sandbox database
 * (connection from the repo `.env`) with the Forms migrations applied, the `FormAutomationEvent`
 * outbox included. Run it with:
 *
 *   cd packages/CoreEntitiesServer && FORMS_INTEGRATION_DB=1 npx vitest run src/engines/__tests__/FormSubmissionEngine.integration.spec.ts
 *
 * It builds its own fixture form (published, one Active link) and deletes every row it wrote —
 * responses, answers, outbox events, the link, the versions and the
 * form graph — in `afterAll`, whether the tests passed or not.
 *
 * The driver and the provider are loaded inside the opt-in branch: `mssql` is not a dependency of
 * this package (it arrives with MJ's SQL Server provider, untyped, so it is `require`d), and a normal
 * test run must neither need it nor pay for loading the provider.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import '../../index.js'; // registers the entity server subclasses the fixture build and the save rely on
import { SetProvider, UserInfo, type DatabaseProviderBase } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { FormAuthoringEngine } from '../FormAuthoringEngine.js';
import { FormSubmissionEngine, QUOTA_REACHED_MESSAGE, SUBMIT_FAILED_MESSAGE } from '../FormSubmissionEngine.js';
import { FormsRateLimiter } from '../../submission/rate-limit.js';
import { OUTBOX_RESPONSE_SUBMITTED, type ResponseSubmittedQueue } from '../../automation/outbox/enqueue.js';
import { sqlOutboxStore } from '../../automation/outbox/claim.js';
import type { RespondentSaveRequest } from '../../submission/save-request.js';
import { FORMS_ENTITY } from '../../shared/entity-names.js';
import type { mjBizAppsFormsFormAutomationRunEntity, mjBizAppsFormsFormDistributionEntity } from '@mj-biz-apps/forms-entities';

const ENABLED = Boolean(process.env.FORMS_INTEGRATION_DB);

/** How many times to look for the second save blocked on the first's row lock before giving up. */
const MAX_BLOCK_POLLS = 50;
const BLOCK_POLL_MS = 100;

/** These specs assert what a save WROTE; the post-commit drain would go on to run the events. */
const NO_DRAIN = (): void => undefined;

interface World {
  provider: DatabaseProviderBase;
  system: UserInfo;
  formId: string;
  versionId: string;
  questionId: string;
  close: () => Promise<void>;
}

let world: World | undefined;

/** A minimal connection-pool surface, so the spec carries no `mssql` types. */
interface Pool {
  connect(): Promise<Pool>;
  close(): Promise<void>;
  request(): { query<T>(sql: string): Promise<{ recordset: T[] }> };
}

async function openWorld(): Promise<World> {
  process.loadEnvFile(fileURLToPath(new URL('../../../../../.env', import.meta.url)));
  const sql = createRequire(import.meta.url)('mssql') as { ConnectionPool: new (config: object) => Pool };
  const { SQLServerDataProvider, SQLServerProviderConfigData } = await import('@memberjunction/sqlserver-dataprovider');
  const pool = await new sql.ConnectionPool({
    server: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    options: { trustServerCertificate: true, encrypt: false },
    pool: { max: 10 },
  }).connect();
  const provider = new SQLServerDataProvider();
  await provider.Config(new SQLServerProviderConfigData(pool as never, process.env.MJ_CORE_SCHEMA ?? '__mj', 0));
  SetProvider(provider);
  await UserCache.Instance.Refresh(provider);
  const system = UserCache.Instance.GetSystemUser();
  if (!system) {
    throw new Error(`No system user in ${process.env.DB_DATABASE}; the integration spec needs MJ's core data.`);
  }
  const built = await FormAuthoringEngine.Instance.BuildFromBlueprint(
    { name: `Task 8 integration fixture ${randomUUID()}`, pages: [{ questions: [{ type: 'ShortText', prompt: 'Your name', isRequired: true }] }] },
    provider,
    system,
    { publishImmediately: true },
  );
  const version = await provider.RunView<{ ID: string }>(
    { EntityName: FORMS_ENTITY.FormVersion, ExtraFilter: `FormID='${built.formId}' AND Status='Published'`, Fields: ['ID'], ResultType: 'simple' },
    system,
  );
  const question = await provider.RunView<{ ID: string }>(
    { EntityName: FORMS_ENTITY.FormQuestion, ExtraFilter: `FormID='${built.formId}'`, Fields: ['ID'], ResultType: 'simple' },
    system,
  );
  return {
    provider,
    system,
    formId: built.formId,
    versionId: version.Results[0].ID,
    questionId: question.Results[0].ID,
    close: () => pool.close(),
  };
}

/** A new Active link on the fixture form, capped at `maxResponses`. */
async function issueLink(w: World, maxResponses: number | null): Promise<{ id: string; slug: string }> {
  const link = await w.provider.GetEntityObject<mjBizAppsFormsFormDistributionEntity>(FORMS_ENTITY.FormDistribution, w.system);
  link.NewRecord();
  const slug = `t8-${randomUUID().slice(0, 8)}`;
  link.FormID = w.formId;
  link.Name = slug;
  link.Slug = slug;
  link.ChannelType = 'PublicLink';
  link.Status = 'Active';
  link.IsActive = true;
  link.MaxResponses = maxResponses;
  if (!(await link.Save())) {
    throw new Error(`Could not create the fixture link: ${link.LatestResult?.CompleteMessage}`);
  }
  return { id: link.ID, slug };
}

/** The anonymous respondent session MJ synthesizes for a redeemed public link (MJServer `buildMagicLinkSessionUser`). */
function respondentFor(w: World, distributionId: string): UserInfo {
  const role = w.provider.Roles.find((r) => r.Name === 'Form Respondent');
  if (!role) {
    throw new Error('The Form Respondent role is not in this database.');
  }
  const user = new UserInfo(w.provider, { ...w.system, _UserRoles: undefined, UserRoles: [{ UserID: w.system.ID, RoleID: role.ID, RoleName: role.Name }] });
  user.MagicLinkScope = { ResourceID: distributionId };
  user.IsMagicLinkAnonymous = true;
  return user;
}

function finalSave(w: World, slug: string, session: string): RespondentSaveRequest {
  const responseId = randomUUID();
  return {
    distributionSlug: slug,
    formVersionId: w.versionId,
    mode: 'final',
    clientResponseId: responseId,
    answers: [{ questionId: w.questionId, textValue: `Respondent ${session}` }],
    caller: { sessionId: session },
  };
}

async function scalar<T>(w: World, sql: string): Promise<T[]> {
  return w.provider.ExecuteSQL<T>(sql, undefined, undefined, w.system);
}

async function responseCount(w: World, distributionId: string): Promise<number> {
  const [row] = await scalar<{ ResponseCount: number }>(w, `SELECT ResponseCount FROM __mj_BizAppsForms.FormDistribution WHERE ID='${distributionId}'`);
  return row.ResponseCount;
}

/** The outbox events queued for `responseId`. */
async function messagesFor(w: World, responseId: string): Promise<number> {
  const rows = await scalar<{ n: number }>(
    w,
    `SELECT COUNT(*) AS n FROM __mj_BizAppsForms.FormAutomationEvent WHERE FormResponseID = '${responseId}'`,
  );
  return rows[0].n;
}

async function responsesWithId(w: World, responseId: string): Promise<number> {
  const rows = await scalar<{ n: number }>(w, `SELECT COUNT(*) AS n FROM __mj_BizAppsForms.FormResponse WHERE ID='${responseId}'`);
  return rows[0].n;
}

/**
 * A queue that publishes for real, then waits for `gate` before letting its transaction commit —
 * reporting the session id its transaction runs on, so a probe can look for requests IT blocks.
 */
function heldQueue(gate: Promise<void>, reached: (spid: number) => void): ResponseSubmittedQueue {
  return {
    Publish: async (payload, provider, user) => {
      await OUTBOX_RESPONSE_SUBMITTED.Publish(payload, provider, user);
      const [row] = await provider.ExecuteSQL<{ spid: number }>('SELECT @@SPID AS spid', undefined, undefined, user);
      reached(row.spid);
      await gate;
    },
  };
}

/**
 * Wait until a request is blocked by session `holder` — the held save's transaction, so a request
 * blocked by anything else in a shared sandbox cannot satisfy it — or fail, by name.
 */
async function waitForBlockedRequest(w: World, holder: number): Promise<void> {
  for (let attempt = 1; attempt <= MAX_BLOCK_POLLS; attempt++) {
    const blocked = await scalar<{ n: number }>(
      w,
      `SELECT COUNT(*) AS n FROM sys.dm_exec_requests WHERE blocking_session_id = ${Number(holder)} AND database_id = DB_ID()`,
    );
    if (blocked[0].n > 0) {
      return;
    }
    await new Promise((r) => setTimeout(r, BLOCK_POLL_MS));
  }
  throw new Error(`The second save never blocked on the first's row lock within ${MAX_BLOCK_POLLS * BLOCK_POLL_MS}ms.`);
}

async function deleteEverything(w: World): Promise<void> {
  const statements = [
    `DELETE run FROM __mj_BizAppsForms.FormAutomationRun run JOIN __mj_BizAppsForms.FormResponse r ON r.ID = run.FormResponseID WHERE r.FormID = '${w.formId}'`,
    `DELETE e FROM __mj_BizAppsForms.FormAutomationEvent e JOIN __mj_BizAppsForms.FormResponse r ON r.ID = e.FormResponseID WHERE r.FormID = '${w.formId}'`,
    `DELETE a FROM __mj_BizAppsForms.FormResponseAnswer a JOIN __mj_BizAppsForms.FormResponse r ON r.ID = a.ResponseID WHERE r.FormID = '${w.formId}'`,
    `DELETE FROM __mj_BizAppsForms.FormResponse WHERE FormID = '${w.formId}'`,
    `DELETE FROM __mj_BizAppsForms.FormDistribution WHERE FormID = '${w.formId}'`,
    `DELETE FROM __mj_BizAppsForms.FormVersion WHERE FormID = '${w.formId}'`,
    `DELETE o FROM __mj_BizAppsForms.FormQuestionOption o JOIN __mj_BizAppsForms.FormQuestion q ON q.ID = o.QuestionID WHERE q.FormID = '${w.formId}'`,
    `DELETE FROM __mj_BizAppsForms.FormQuestion WHERE FormID = '${w.formId}'`,
    `DELETE FROM __mj_BizAppsForms.FormPage WHERE FormID = '${w.formId}'`,
    `DELETE FROM __mj_BizAppsForms.FormScreen WHERE FormID = '${w.formId}'`,
    `DELETE FROM __mj_BizAppsForms.FormAutomation WHERE FormID = '${w.formId}'`,
    `DELETE FROM __mj_BizAppsForms.Form WHERE ID = '${w.formId}'`,
  ];
  for (const statement of statements) {
    await scalar(w, statement);
  }
}

describe.skipIf(!ENABLED)('FormSubmissionEngine on SQL Server (DW9, DW10)', () => {
  beforeAll(async () => {
    world = await openWorld();
  }, 120_000);

  afterAll(async () => {
    if (!world) {
      return;
    }
    try {
      await deleteEverything(world);
    } finally {
      await world.close();
      world = undefined;
    }
  }, 60_000);

  it('DW9: two concurrent final saves on the last slot — one Complete, one quota refusal from the UPDATE, ResponseCount 1', async () => {
    const w = world!;
    FormsRateLimiter.Instance.resetForTests();
    const link = await issueLink(w, 1);
    const user = respondentFor(w, link.id);
    const [first, second] = await Promise.all([w.provider.CreateIndependentInstance(), w.provider.CreateIndependentInstance()]);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let firstReachedPublish!: (spid: number) => void;
    const reached = new Promise<number>((r) => (firstReachedPublish = r));
    try {
      const requestA = finalSave(w, link.slug, 'session-a');
      const requestB = finalSave(w, link.slug, 'session-b');
      // A takes the slot and holds its transaction open at the publish.
      const a = FormSubmissionEngine.Instance.SaveResponse(requestA, first, user, { queue: heldQueue(gate, firstReachedPublish), kick: NO_DRAIN });
      const holder = await reached;
      // B reads ResponseCount 0 (A has not committed; READ_COMMITTED_SNAPSHOT) and passes the
      // pre-check; inside its transaction it then blocks on a lock A holds. From there only the
      // conditional UPDATE can refuse it.
      const b = FormSubmissionEngine.Instance.SaveResponse(requestB, second, user, { kick: NO_DRAIN });
      await waitForBlockedRequest(w, holder);
      release();
      const [resultA, resultB] = await Promise.all([a, b]);

      expect(resultA).toMatchObject({ success: true, status: 'Complete' });
      expect(resultB.success).toBe(false);
      expect(resultB.errors[0].message).toBe(QUOTA_REACHED_MESSAGE);
      expect(await responseCount(w, link.id)).toBe(1);
      expect(await responsesWithId(w, requestA.clientResponseId!)).toBe(1);
      expect(await responsesWithId(w, requestB.clientResponseId!)).toBe(0); // rolled back with its refusal
      expect(await messagesFor(w, requestA.clientResponseId!)).toBe(1);
      expect(await messagesFor(w, requestB.clientResponseId!)).toBe(0);
    } finally {
      release();
      await Promise.all([first.ReleaseIndependentInstance(), second.ReleaseIndependentInstance()]);
    }
  }, 60_000);

  it('DW9: a free-for-all of concurrent finals on a cap of 1 never exceeds it', async () => {
    const w = world!;
    FormsRateLimiter.Instance.resetForTests();
    const link = await issueLink(w, 1);
    const user = respondentFor(w, link.id);
    const instances = await Promise.all([0, 1, 2, 3].map(() => w.provider.CreateIndependentInstance()));
    try {
      const results = await Promise.all(
        instances.map((instance, i) => FormSubmissionEngine.Instance.SaveResponse(finalSave(w, link.slug, `racer-${i}`), instance, user, { kick: NO_DRAIN })),
      );
      expect(results.filter((r) => r.success)).toHaveLength(1);
      expect(results.filter((r) => !r.success).every((r) => r.errors[0].message === QUOTA_REACHED_MESSAGE)).toBe(true);
      expect(await responseCount(w, link.id)).toBe(1);
    } finally {
      await Promise.all(instances.map((instance) => instance.ReleaseIndependentInstance()));
    }
  }, 60_000);

  it('promoting ONE draft from two concurrent finals takes one slot and queues one message (review finding 2)', async () => {
    const w = world!;
    FormsRateLimiter.Instance.resetForTests();
    const link = await issueLink(w, 5);
    const user = respondentFor(w, link.id);
    // The respondent's draft, banked by an autosave.
    const draft = finalSave(w, link.slug, 'promoter');
    const banked = await FormSubmissionEngine.Instance.SaveResponse({ ...draft, mode: 'partial' }, w.provider, user, { kick: NO_DRAIN });
    expect(banked.status).toBe('Partial');
    const [first, second] = await Promise.all([w.provider.CreateIndependentInstance(), w.provider.CreateIndependentInstance()]);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let firstReachedPublish!: (spid: number) => void;
    const reached = new Promise<number>((r) => (firstReachedPublish = r));
    try {
      // A promotes the draft and holds its transaction open at the publish; B — a retry of the same
      // submit — reads the draft as Partial under READ_COMMITTED_SNAPSHOT and must not promote it too.
      const a = FormSubmissionEngine.Instance.SaveResponse(draft, first, user, { queue: heldQueue(gate, firstReachedPublish), kick: NO_DRAIN });
      const holder = await reached;
      const b = FormSubmissionEngine.Instance.SaveResponse(draft, second, user, { kick: NO_DRAIN });
      await waitForBlockedRequest(w, holder);
      release();
      const [resultA, resultB] = await Promise.all([a, b]);

      for (const result of [resultA, resultB]) {
        expect(result).toMatchObject({ success: true, status: 'Complete' });
        expect(result.responseId?.toLowerCase()).toBe(draft.clientResponseId!.toLowerCase());
      }
      expect(await responseCount(w, link.id)).toBe(1);
      expect(await messagesFor(w, draft.clientResponseId!)).toBe(1);
    } finally {
      release();
      await Promise.all([first.ReleaseIndependentInstance(), second.ReleaseIndependentInstance()]);
    }
  }, 60_000);

  it('I2: a stale builder save after an atomic increment leaves ResponseCount where the UPDATE put it', async () => {
    const w = world!;
    FormsRateLimiter.Instance.resetForTests();
    const link = await issueLink(w, 5);
    // The builder's copy, loaded before anyone answered.
    const builderCopy = await w.provider.GetEntityObject<mjBizAppsFormsFormDistributionEntity>(FORMS_ENTITY.FormDistribution, w.system);
    expect(await builderCopy.Load(link.id)).toBe(true);
    expect(builderCopy.ResponseCount).toBe(0);

    const instance = await w.provider.CreateIndependentInstance();
    try {
      const result = await FormSubmissionEngine.Instance.SaveResponse(finalSave(w, link.slug, 'counted'), instance, respondentFor(w, link.id), { kick: NO_DRAIN });
      expect(result).toMatchObject({ success: true, status: 'Complete' });
    } finally {
      await instance.ReleaseIndependentInstance();
    }
    expect(await responseCount(w, link.id)).toBe(1);

    // An ordinary settings save from the stale copy: its count is clean but behind the store.
    builderCopy.Name = `${link.slug} renamed`;
    expect(await builderCopy.Save()).toBe(true);
    expect(await responseCount(w, link.id)).toBe(1);

    // The GraphQL update path SetMany()s every field the client sent, so the stale 0 arrives DIRTY.
    const wireCopy = await w.provider.GetEntityObject<mjBizAppsFormsFormDistributionEntity>(FORMS_ENTITY.FormDistribution, w.system);
    expect(await wireCopy.Load(link.id)).toBe(true);
    wireCopy.SetMany({ ResponseCount: 0, Name: `${link.slug} again` });
    expect(await wireCopy.Save()).toBe(true);
    expect(await responseCount(w, link.id)).toBe(1);
  }, 60_000);

  it('DW10 (control): a final save commits the response AND its message', async () => {
    const w = world!;
    FormsRateLimiter.Instance.resetForTests();
    const link = await issueLink(w, null);
    const instance = await w.provider.CreateIndependentInstance();
    try {
      const request = finalSave(w, link.slug, 'control');
      const result = await FormSubmissionEngine.Instance.SaveResponse(request, instance, respondentFor(w, link.id), { kick: NO_DRAIN });

      expect(result).toMatchObject({ success: true, status: 'Complete', outcome: 'ended' });
      expect(await responsesWithId(w, request.clientResponseId!)).toBe(1);
      expect(await messagesFor(w, request.clientResponseId!)).toBe(1);
      expect(await responseCount(w, link.id)).toBe(1);
    } finally {
      await instance.ReleaseIndependentInstance();
    }
  }, 60_000);

  it('DW10: a forced failure AFTER the publish leaves neither the response nor the message', async () => {
    const w = world!;
    FormsRateLimiter.Instance.resetForTests();
    const link = await issueLink(w, null);
    const instance = await w.provider.CreateIndependentInstance();
    const failingAfterPublish: ResponseSubmittedQueue = {
        Publish: async (payload, provider, user) => {
        await OUTBOX_RESPONSE_SUBMITTED.Publish(payload, provider, user);
        throw new Error('forced failure after the publish');
      },
    };
    try {
      const request = finalSave(w, link.slug, 'doomed');
      const result = await FormSubmissionEngine.Instance.SaveResponse(request, instance, respondentFor(w, link.id), { queue: failingAfterPublish, kick: NO_DRAIN });

      expect(result.success).toBe(false);
      expect(result.errors[0].message).toBe(SUBMIT_FAILED_MESSAGE);
      expect(await responsesWithId(w, request.clientResponseId!)).toBe(0);
      expect(await messagesFor(w, request.clientResponseId!)).toBe(0);
      expect(await responseCount(w, link.id)).toBe(0);
    } finally {
      await instance.ReleaseIndependentInstance();
    }
  }, 60_000);
});

describe.skipIf(!ENABLED)('the automation outbox claim on SQL Server (#303)', () => {
  beforeAll(async () => {
    world = world ?? (await openWorld());
  }, 120_000);

  afterAll(async () => {
    if (!world) {
      return;
    }
    try {
      await deleteEverything(world);
    } finally {
      await world.close();
      world = undefined;
    }
  }, 60_000);

  /** `count` committed final saves on a fresh link; returns their response ids (each owes one event). */
  async function savedResponses(w: World, count: number): Promise<string[]> {
    FormsRateLimiter.Instance.resetForTests();
    const link = await issueLink(w, null);
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const request = finalSave(w, link.slug, `outbox-${randomUUID().slice(0, 8)}`);
      const result = await FormSubmissionEngine.Instance.SaveResponse(request, w.provider, respondentFor(w, link.id), { kick: NO_DRAIN });
      expect(result.success).toBe(true);
      ids.push(request.clientResponseId!.toLowerCase());
    }
    return ids;
  }

  async function eventsOf(w: World, responseIds: string[]): Promise<{ ID: string; FormResponseID: string; Status: string }[]> {
    const list = responseIds.map((id) => `'${id}'`).join(',');
    return scalar(w, `SELECT ID, LOWER(CONVERT(NVARCHAR(36), FormResponseID)) AS FormResponseID, Status FROM __mj_BizAppsForms.FormAutomationEvent WHERE FormResponseID IN (${list})`);
  }

  it('two drains claiming at once take disjoint events, and between them every due one', async () => {
    const w = world!;
    const responses = await savedResponses(w, 10);
    const [a, b] = await Promise.all([w.provider.CreateIndependentInstance(), w.provider.CreateIndependentInstance()]);
    try {
      const mine = new Set(responses);
      const taken: string[][] = [[], []];
      for (let round = 0; round < 6; round++) {
        const [fromA, fromB] = await Promise.all([sqlOutboxStore(a, w.system).Claim('spec-a'), sqlOutboxStore(b, w.system).Claim('spec-b')]);
        taken[0].push(...fromA.filter((e) => mine.has(e.FormResponseID.toLowerCase())).map((e) => e.ID));
        taken[1].push(...fromB.filter((e) => mine.has(e.FormResponseID.toLowerCase())).map((e) => e.ID));
      }
      expect(taken[0].filter((id) => taken[1].includes(id))).toEqual([]);
      expect(new Set([...taken[0], ...taken[1]]).size).toBe(10);
      expect((await eventsOf(w, responses)).every((e) => e.Status === 'Running')).toBe(true);
    } finally {
      await Promise.all([a.ReleaseIndependentInstance(), b.ReleaseIndependentInstance()]);
    }
  }, 120_000);

  it('a retried event is not claimed before its NextAttemptAt, and only its own drain may settle it', async () => {
    const w = world!;
    const [response] = await savedResponses(w, 1);
    const store = sqlOutboxStore(w.provider, w.system);
    const [event] = (await store.Claim('spec-owner', response));
    expect(event.FormResponseID.toLowerCase()).toBe(response);

    expect(await store.Settle(event.ID, 'spec-intruder', { status: 'Complete', lastError: null })).toBe(false);
    expect(await store.Settle(event.ID, 'spec-owner', { status: 'Pending', retryAfterSeconds: 300, lastError: 'try later' })).toBe(true);
    expect(await store.Claim('spec-other', response)).toEqual([]);
  }, 120_000);

  it('a final submit brings an older partial in backoff forward, so the post-commit drain can clear it and run the final', async () => {
    const w = world!;
    FormsRateLimiter.Instance.resetForTests();
    const link = await issueLink(w, null);
    const request = finalSave(w, link.slug, `outbox-${randomUUID().slice(0, 8)}`);
    const draft = await FormSubmissionEngine.Instance.SaveResponse({ ...request, mode: 'partial' }, w.provider, respondentFor(w, link.id), { kick: NO_DRAIN });
    expect(draft.success).toBe(true);
    const response = request.clientResponseId!.toLowerCase();
    await scalar(
      w,
      `INSERT INTO __mj_BizAppsForms.FormAutomationEvent (FormResponseID, [Trigger], PartialSaveKey, Status, AttemptCount, NextAttemptAt, __mj_CreatedAt, __mj_UpdatedAt)
       VALUES ('${response}', 'OnPartial', 'backoff', 'Pending', 1, DATEADD(MINUTE, 5, SYSDATETIMEOFFSET()), DATEADD(MINUTE, -1, GETUTCDATE()), GETUTCDATE())`,
    );

    const final = await FormSubmissionEngine.Instance.SaveResponse(request, w.provider, respondentFor(w, link.id), { kick: NO_DRAIN });
    expect(final.success).toBe(true);

    const claimed = await sqlOutboxStore(w.provider, w.system).Claim('spec-pull', response);
    expect(claimed.map((e) => e.Trigger)).toEqual(['OnPartial']);
  }, 120_000);

  it('a final saved by an API host whose clock runs ahead of the database is claimable at once', async () => {
    // BaseEntity.NewRecord() turns the column's SYSDATETIMEOFFSET() default into the PROCESS's time,
    // so the event's NextAttemptAt is the API host's clock — which the claim compares with the
    // database's. With the scheduler off, the post-commit drain is the only one that ever runs.
    const w = world!;
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 60_000, shouldAdvanceTime: true });
    let response: string;
    try {
      [response] = await savedResponses(w, 1);
    } finally {
      vi.useRealTimers();
    }

    const claimed = await sqlOutboxStore(w.provider, w.system).Claim('spec-skew', response);
    expect(claimed.map((e) => e.Trigger)).toEqual(['OnComplete']);
  }, 120_000);

  it('a run row stamped with its event saves through the real procedures, whatever migration defined them last', async () => {
    // spCreate/spUpdateFormAutomationRun are redefined by more than one migration; the LAST one to
    // run must still take @FormAutomationEventID, or every save of a run row fails "too many arguments".
    const w = world!;
    const [response] = await savedResponses(w, 1);
    const [event] = await scalar<{ ID: string }>(w, `SELECT ID FROM __mj_BizAppsForms.FormAutomationEvent WHERE FormResponseID = '${response}'`);
    const automationId = randomUUID();
    await scalar(
      w,
      `INSERT INTO __mj_BizAppsForms.FormAutomation (ID, FormID, Name, TargetType, ActionID)
       SELECT TOP 1 '${automationId}', '${w.formId}', 'spec run-row step', 'Action', ID FROM __mj.Action`,
    );

    const run = await w.provider.GetEntityObject<mjBizAppsFormsFormAutomationRunEntity>(FORMS_ENTITY.FormAutomationRun, w.system);
    run.NewRecord();
    run.FormAutomationID = automationId;
    run.FormResponseID = response;
    run.FormAutomationEventID = event.ID;
    run.Status = 'Running';
    expect(await run.Save(), run.LatestResult?.CompleteMessage).toBe(true);
    run.Status = 'Succeeded';
    expect(await run.Save(), run.LatestResult?.CompleteMessage).toBe(true);

    const [stored] = await scalar<{ Status: string; EventID: string }>(
      w,
      `SELECT Status, LOWER(CONVERT(NVARCHAR(36), FormAutomationEventID)) AS EventID FROM __mj_BizAppsForms.FormAutomationRun WHERE ID = '${run.ID}'`,
    );
    expect(stored).toEqual({ Status: 'Succeeded', EventID: event.ID.toLowerCase() });
  }, 120_000);

  it('renews a held lease, and refuses to renew one it does not hold', async () => {
    const w = world!;
    const [response] = await savedResponses(w, 1);
    const store = sqlOutboxStore(w.provider, w.system);
    const [event] = await store.Claim('spec-renew', response);

    expect(await store.Renew(event.ID, 'spec-renew')).toBe(true);
    expect(await store.Renew(event.ID, 'spec-intruder')).toBe(false);
  }, 120_000);

  it('a final is not claimed while an older event of the same response is still Running under a live lease', async () => {
    const w = world!;
    const [response] = await savedResponses(w, 1);
    await scalar(
      w,
      `INSERT INTO __mj_BizAppsForms.FormAutomationEvent (FormResponseID, [Trigger], PartialSaveKey, Status, LockedBy, LockedUntil, __mj_CreatedAt, __mj_UpdatedAt)
       VALUES ('${response}', 'OnPartial', 'older', 'Running', 'spec-elsewhere', DATEADD(MINUTE, 5, SYSDATETIMEOFFSET()), DATEADD(MINUTE, -5, GETUTCDATE()), GETUTCDATE())`,
    );

    expect(await sqlOutboxStore(w.provider, w.system).Claim('spec-ordered', response)).toEqual([]);

    await scalar(w, `UPDATE __mj_BizAppsForms.FormAutomationEvent SET LockedUntil = DATEADD(MINUTE, -1, SYSDATETIMEOFFSET()) WHERE FormResponseID = '${response}' AND [Trigger] = 'OnPartial'`);
    const reclaimed = await sqlOutboxStore(w.provider, w.system).Claim('spec-ordered', response);
    expect(reclaimed.map((e) => e.Trigger)).toEqual(['OnPartial']);
    expect(reclaimed[0].AttemptCount).toBe(1);
  }, 120_000);
});
