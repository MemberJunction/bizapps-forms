/**
 * The respondent submit path and the automation outbox on a login that holds ONLY MJ's three app
 * roles — `cdp_Developer`, `cdp_Integration` and `cdp_UI` (#338).
 *
 * MJ grants those roles `SELECT` on views and `EXECUTE` on stored procedures, never table access. The
 * quota slot, the row locks and the outbox writes used to run raw SQL against the base tables, so on
 * such a host every final submit, partial save and drain was refused ("The UPDATE permission was
 * denied on the object 'FormDistribution'"). A dev box never shows it, because its login is
 * `db_owner`; this spec is what does. Every write here goes through the roles-only login, so a raw
 * base-table statement creeping back into any of these paths turns it red.
 *
 * TWO PROVIDERS. The `.env` login builds the fixture forms and links, reads back what the database
 * holds, and deletes every row it wrote in `afterAll`. The roles-only login is the provider the
 * engine, the outbox store and the staff save run on — and the global provider while the tests run,
 * so a path that falls back to it runs as the roles too.
 *
 * OPT-IN. Skipped unless all three of these are set:
 *  - `FORMS_INTEGRATION_DB` — the repo `.env` names a sandbox database with the Forms migrations;
 *  - `FORMS_INTEGRATION_ROLES_USERNAME` and `FORMS_INTEGRATION_ROLES_PASSWORD` — a SQL login that is a
 *    member of exactly the three roles on that database. Create one from a sysadmin connection:
 *
 *      CREATE LOGIN [Forms_RolesOnly] WITH PASSWORD = '<strong password>', CHECK_POLICY = OFF;
 *      CREATE USER [Forms_RolesOnly] FOR LOGIN [Forms_RolesOnly];
 *      ALTER ROLE [cdp_Developer] ADD MEMBER [Forms_RolesOnly];
 *      ALTER ROLE [cdp_Integration] ADD MEMBER [Forms_RolesOnly];
 *      ALTER ROLE [cdp_UI] ADD MEMBER [Forms_RolesOnly];
 *
 * Then run:
 *
 *   cd packages/CoreEntitiesServer && FORMS_INTEGRATION_DB=1 FORMS_INTEGRATION_ROLES_USERNAME=Forms_RolesOnly \
 *     FORMS_INTEGRATION_ROLES_PASSWORD='<password>' npx vitest run src/engines/__tests__/FormSubmissionEngine.roles-only.integration.spec.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import '../../index.js'; // registers the entity server subclasses the fixture build and the saves rely on
import { SetProvider, UserInfo, type DatabaseProviderBase } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { FormAuthoringEngine } from '../FormAuthoringEngine.js';
import { FormSubmissionEngine } from '../FormSubmissionEngine.js';
import { FormsRateLimiter } from '../../submission/rate-limit.js';
import { replayDeadLetteredEvent, sqlOutboxStore } from '../../automation/outbox/claim.js';
import type { RespondentSaveRequest } from '../../submission/save-request.js';
import { FORMS_ENTITY } from '../../shared/entity-names.js';
import type { mjBizAppsFormsFormDistributionEntity } from '@mj-biz-apps/forms-entities';

const ROLES_USERNAME = process.env.FORMS_INTEGRATION_ROLES_USERNAME;
const ROLES_PASSWORD = process.env.FORMS_INTEGRATION_ROLES_PASSWORD;
const ENABLED = Boolean(process.env.FORMS_INTEGRATION_DB && ROLES_USERNAME && ROLES_PASSWORD);

/** These specs assert what a save WROTE and drive the outbox by hand; the post-commit drain would race them. */
const NO_DRAIN = (): void => undefined;

/** The form-level quota the quota fixture's published snapshot carries. */
const FORM_QUOTA = 5;

interface Fixture {
  formId: string;
  versionId: string;
  questionId: string;
}

interface World {
  /** The `.env` login: fixtures, read-backs and cleanup. */
  admin: DatabaseProviderBase;
  /** The roles-only login: everything under test. */
  roles: DatabaseProviderBase;
  system: UserInfo;
  plain: Fixture;
  quota: Fixture;
  close: () => Promise<void>;
}

let world: World | undefined;

/** A minimal connection-pool surface, so the spec carries no `mssql` types. */
interface Pool {
  connect(): Promise<Pool>;
  close(): Promise<void>;
}

async function openProvider(user: string | undefined, password: string | undefined): Promise<{ provider: DatabaseProviderBase; pool: Pool }> {
  const sql = createRequire(import.meta.url)('mssql') as { ConnectionPool: new (config: object) => Pool };
  const { SQLServerDataProvider, SQLServerProviderConfigData } = await import('@memberjunction/sqlserver-dataprovider');
  const pool = await new sql.ConnectionPool({
    server: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user,
    password,
    database: process.env.DB_DATABASE,
    options: { trustServerCertificate: true, encrypt: false },
    pool: { max: 10 },
  }).connect();
  const provider = new SQLServerDataProvider();
  await provider.Config(new SQLServerProviderConfigData(pool as never, process.env.MJ_CORE_SCHEMA ?? '__mj', 0));
  return { provider, pool };
}

async function buildFixture(admin: DatabaseProviderBase, system: UserInfo, label: string): Promise<Fixture> {
  const built = await FormAuthoringEngine.Instance.BuildFromBlueprint(
    { name: `Roles-only integration fixture ${label} ${randomUUID()}`, pages: [{ questions: [{ type: 'ShortText', prompt: 'Your name', isRequired: true }] }] },
    admin,
    system,
    { publishImmediately: true },
  );
  const version = await admin.RunView<{ ID: string }>(
    { EntityName: FORMS_ENTITY.FormVersion, ExtraFilter: `FormID='${built.formId}' AND Status='Published'`, Fields: ['ID'], ResultType: 'simple' },
    system,
  );
  const question = await admin.RunView<{ ID: string }>(
    { EntityName: FORMS_ENTITY.FormQuestion, ExtraFilter: `FormID='${built.formId}'`, Fields: ['ID'], ResultType: 'simple' },
    system,
  );
  return { formId: built.formId, versionId: version.Results[0].ID, questionId: question.Results[0].ID };
}

async function openWorld(): Promise<World> {
  process.loadEnvFile(fileURLToPath(new URL('../../../../../.env', import.meta.url)));
  const admin = await openProvider(process.env.DB_USERNAME, process.env.DB_PASSWORD);
  SetProvider(admin.provider);
  await UserCache.Instance.Refresh(admin.provider);
  const system = UserCache.Instance.GetSystemUser();
  if (!system) {
    throw new Error(`No system user in ${process.env.DB_DATABASE}; the roles-only spec needs MJ's core data.`);
  }
  const plain = await buildFixture(admin.provider, system, 'plain');
  const quota = await buildFixture(admin.provider, system, 'quota');
  // The submit reads FormSettings from the published snapshot; the blueprint has no quota knob.
  await admin.provider.ExecuteSQL(
    `UPDATE __mj_BizAppsForms.FormVersion SET DefinitionSnapshot = JSON_MODIFY(DefinitionSnapshot, '$.settings.quota', ${FORM_QUOTA}) WHERE ID = '${quota.versionId}'`,
    undefined,
    undefined,
    system,
  );
  const roles = await openProvider(ROLES_USERNAME, ROLES_PASSWORD);
  SetProvider(roles.provider);
  return {
    admin: admin.provider,
    roles: roles.provider,
    system,
    plain,
    quota,
    close: async () => {
      await roles.pool.close();
      await admin.pool.close();
    },
  };
}

/** A new Active link on `fixture`, created by the `.env` login. */
async function issueLink(w: World, fixture: Fixture, maxResponses: number | null): Promise<{ id: string; slug: string }> {
  const link = await w.admin.GetEntityObject<mjBizAppsFormsFormDistributionEntity>(FORMS_ENTITY.FormDistribution, w.system);
  link.NewRecord();
  const slug = `ro-${randomUUID().slice(0, 8)}`;
  link.FormID = fixture.formId;
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
  const role = w.roles.Roles.find((r) => r.Name === 'Form Respondent');
  if (!role) {
    throw new Error('The Form Respondent role is not in this database.');
  }
  const user = new UserInfo(w.roles, { ...w.system, _UserRoles: undefined, UserRoles: [{ UserID: w.system.ID, RoleID: role.ID, RoleName: role.Name }] });
  user.MagicLinkScope = { ResourceID: distributionId };
  user.IsMagicLinkAnonymous = true;
  return user;
}

function finalSave(fixture: Fixture, slug: string, session: string): RespondentSaveRequest {
  return {
    distributionSlug: slug,
    formVersionId: fixture.versionId,
    mode: 'final',
    clientResponseId: randomUUID(),
    answers: [{ questionId: fixture.questionId, textValue: `Respondent ${session}` }],
    caller: { sessionId: session },
  };
}

/** Run a statement as the `.env` login — read-backs and fixture state only, never the path under test. */
async function asAdmin<T>(w: World, sql: string): Promise<T[]> {
  return w.admin.ExecuteSQL<T>(sql, undefined, undefined, w.system);
}

async function responseCount(w: World, distributionId: string): Promise<number> {
  const [row] = await asAdmin<{ ResponseCount: number }>(w, `SELECT ResponseCount FROM __mj_BizAppsForms.FormDistribution WHERE ID='${distributionId}'`);
  return row.ResponseCount;
}

async function eventsOf(w: World, responseId: string): Promise<{ Trigger: string; Status: string }[]> {
  return asAdmin(w, `SELECT [Trigger], Status FROM __mj_BizAppsForms.FormAutomationEvent WHERE FormResponseID = '${responseId}' ORDER BY __mj_CreatedAt, ID`);
}

/** One committed final save on a fresh unlimited link, as the roles-only login; returns its response id. */
async function savedResponse(w: World): Promise<string> {
  FormsRateLimiter.Instance.resetForTests();
  const link = await issueLink(w, w.plain, null);
  const request = finalSave(w.plain, link.slug, `outbox-${randomUUID().slice(0, 8)}`);
  const result = await FormSubmissionEngine.Instance.SaveResponse(request, w.roles, respondentFor(w, link.id), { kick: NO_DRAIN });
  expect(result, JSON.stringify(result.errors)).toMatchObject({ success: true, status: 'Complete' });
  return request.clientResponseId!.toLowerCase();
}

async function deleteEverything(w: World): Promise<void> {
  for (const formId of [w.plain.formId, w.quota.formId]) {
    const statements = [
      `DELETE run FROM __mj_BizAppsForms.FormAutomationRun run JOIN __mj_BizAppsForms.FormResponse r ON r.ID = run.FormResponseID WHERE r.FormID = '${formId}'`,
      `DELETE e FROM __mj_BizAppsForms.FormAutomationEvent e JOIN __mj_BizAppsForms.FormResponse r ON r.ID = e.FormResponseID WHERE r.FormID = '${formId}'`,
      `DELETE a FROM __mj_BizAppsForms.FormResponseAnswer a JOIN __mj_BizAppsForms.FormResponse r ON r.ID = a.ResponseID WHERE r.FormID = '${formId}'`,
      `DELETE FROM __mj_BizAppsForms.FormResponse WHERE FormID = '${formId}'`,
      `DELETE FROM __mj_BizAppsForms.FormDistribution WHERE FormID = '${formId}'`,
      `DELETE FROM __mj_BizAppsForms.FormVersion WHERE FormID = '${formId}'`,
      `DELETE o FROM __mj_BizAppsForms.FormQuestionOption o JOIN __mj_BizAppsForms.FormQuestion q ON q.ID = o.QuestionID WHERE q.FormID = '${formId}'`,
      `DELETE FROM __mj_BizAppsForms.FormQuestion WHERE FormID = '${formId}'`,
      `DELETE FROM __mj_BizAppsForms.FormPage WHERE FormID = '${formId}'`,
      `DELETE FROM __mj_BizAppsForms.FormScreen WHERE FormID = '${formId}'`,
      `DELETE FROM __mj_BizAppsForms.FormAutomation WHERE FormID = '${formId}'`,
      `DELETE FROM __mj_BizAppsForms.Form WHERE ID = '${formId}'`,
    ];
    for (const statement of statements) {
      await asAdmin(w, statement);
    }
  }
}

describe.skipIf(!ENABLED)('the submit path and the outbox on a roles-only login (#338)', () => {
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

  it('a final save takes the slot: ResponseCount becomes 1 and one OnComplete event is queued', async () => {
    const w = world!;
    FormsRateLimiter.Instance.resetForTests();
    const link = await issueLink(w, w.plain, 5);
    const request = finalSave(w.plain, link.slug, 'final');

    const result = await FormSubmissionEngine.Instance.SaveResponse(request, w.roles, respondentFor(w, link.id), { kick: NO_DRAIN });

    expect(result, JSON.stringify(result.errors)).toMatchObject({ success: true, status: 'Complete' });
    expect(await responseCount(w, link.id)).toBe(1);
    expect(await eventsOf(w, request.clientResponseId!)).toEqual([{ Trigger: 'OnComplete', Status: 'Pending' }]);
  }, 60_000);

  it('a partial save, then a final on the same response, promotes it and counts it once', async () => {
    const w = world!;
    FormsRateLimiter.Instance.resetForTests();
    const link = await issueLink(w, w.plain, 5);
    const request = finalSave(w.plain, link.slug, 'promoted');
    const user = respondentFor(w, link.id);

    const draft = await FormSubmissionEngine.Instance.SaveResponse({ ...request, mode: 'partial' }, w.roles, user, { kick: NO_DRAIN });
    expect(draft, JSON.stringify(draft.errors)).toMatchObject({ success: true, status: 'Partial' });
    expect(await responseCount(w, link.id)).toBe(0);

    const final = await FormSubmissionEngine.Instance.SaveResponse(request, w.roles, user, { kick: NO_DRAIN });
    expect(final, JSON.stringify(final.errors)).toMatchObject({ success: true, status: 'Complete' });
    expect(final.responseId?.toLowerCase()).toBe(request.clientResponseId!.toLowerCase());
    expect(await responseCount(w, link.id)).toBe(1);
  }, 60_000);

  it('a final on a form with FormSettings.quota set takes the form lock and completes', async () => {
    const w = world!;
    FormsRateLimiter.Instance.resetForTests();
    const link = await issueLink(w, w.quota, null);
    const request = finalSave(w.quota, link.slug, 'quota');

    const result = await FormSubmissionEngine.Instance.SaveResponse(request, w.roles, respondentFor(w, link.id), { kick: NO_DRAIN });

    expect(result, JSON.stringify(result.errors)).toMatchObject({ success: true, status: 'Complete' });
    expect(await responseCount(w, link.id)).toBe(1);
  }, 60_000);

  it("a staff save of a copy loaded before a submission keeps the count the submission wrote (the locked re-read)", async () => {
    // The locked re-read fails soft: if it is refused, the save writes the copy's stale count back.
    const w = world!;
    FormsRateLimiter.Instance.resetForTests();
    const link = await issueLink(w, w.plain, 5);
    const staffCopy = await w.roles.GetEntityObject<mjBizAppsFormsFormDistributionEntity>(FORMS_ENTITY.FormDistribution, w.system);
    expect(await staffCopy.Load(link.id)).toBe(true);

    const result = await FormSubmissionEngine.Instance.SaveResponse(finalSave(w.plain, link.slug, 'staff'), w.roles, respondentFor(w, link.id), { kick: NO_DRAIN });
    expect(result, JSON.stringify(result.errors)).toMatchObject({ success: true, status: 'Complete' });

    staffCopy.Name = `${link.slug} renamed`;
    expect(await staffCopy.Save(), staffCopy.LatestResult?.CompleteMessage).toBe(true);
    expect(await responseCount(w, link.id)).toBe(1);
  }, 60_000);

  it('claims an event, renews its lease, and settles it Complete', async () => {
    const w = world!;
    const response = await savedResponse(w);
    const store = sqlOutboxStore(w.roles, w.system);

    const [event] = await store.Claim('roles-complete', response);
    expect(event).toMatchObject({ Trigger: 'OnComplete', AttemptCount: 1, IsReplay: false });
    expect(await store.Renew(event.ID, 'roles-complete')).toBe(true);
    expect(await store.Renew(event.ID, 'roles-intruder')).toBe(false);
    expect(await store.Settle(event.ID, 'roles-complete', { status: 'Complete', lastError: null })).toBe(true);

    expect(await eventsOf(w, response)).toEqual([{ Trigger: 'OnComplete', Status: 'Complete' }]);
  }, 60_000);

  it('settles a claimed event Pending with a retry, which is then not due', async () => {
    const w = world!;
    const response = await savedResponse(w);
    const store = sqlOutboxStore(w.roles, w.system);

    const [event] = await store.Claim('roles-retry', response);
    expect(await store.Settle(event.ID, 'roles-retry', { status: 'Pending', retryAfterSeconds: 300, lastError: "it's retryable" })).toBe(true);

    expect(await eventsOf(w, response)).toEqual([{ Trigger: 'OnComplete', Status: 'Pending' }]);
    expect(await store.Claim('roles-other', response)).toEqual([]);
  }, 60_000);

  it('replays a dead-lettered event, which the next claim takes as a replay', async () => {
    const w = world!;
    const response = await savedResponse(w);
    await asAdmin(
      w,
      `UPDATE __mj_BizAppsForms.FormAutomationEvent SET Status = 'DeadLetter', AttemptCount = 5, LastError = 'gave up', CompletedAt = SYSDATETIMEOFFSET() WHERE FormResponseID = '${response}'`,
    );
    const [dead] = await asAdmin<{ ID: string }>(w, `SELECT ID FROM __mj_BizAppsForms.FormAutomationEvent WHERE FormResponseID = '${response}'`);

    expect(await replayDeadLetteredEvent(w.roles, dead.ID, w.system)).toBe(true);
    expect(await replayDeadLetteredEvent(w.roles, dead.ID, w.system)).toBe(false);

    const [claimed] = await sqlOutboxStore(w.roles, w.system).Claim('roles-replay', response);
    expect(claimed).toMatchObject({ ID: dead.ID, AttemptCount: 1, IsReplay: true });
  }, 60_000);
});
