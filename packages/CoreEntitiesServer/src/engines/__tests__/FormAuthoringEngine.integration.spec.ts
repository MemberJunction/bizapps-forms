/**
 * `FormAuthoringEngine`'s all-or-nothing claims, against a REAL SQL Server — DW14 of spec #303,
 * authoring half, and the Task 4/5 carries that were proven on the fake provider only:
 *  - `Clone` with a child save forced to fail leaves no `Form` row, no page, no question: the copy
 *    runs in one transaction and the failure rolls back every row it had already written;
 *  - `CreateFromTemplate` (the starter path, `BuildFromBlueprint`) the same;
 *  - `BuildFromBlueprint` with `publishImmediately` publishes INSIDE the build's transaction, so the
 *    publish's reads see the uncommitted pages and questions (read-your-writes on the nested
 *    savepoint) and the result is version 1 — no Draft version row first.
 *
 * Archive closing a form's links in the same unit is proven on the :4141 harness through
 * `Forms.ArchiveForm` instead (Task 11 report): issuing a link needs the magic-link minter, which
 * forms-server registers and this package cannot load.
 *
 * The failure is forced IN PROCESS, by making one `MJ_BizApps_Forms: Form Question Options` save
 * throw — the transaction, the rows already written and the rollback are all the database's. A fake
 * provider cannot prove the rollback; that is the whole reason this file exists.
 *
 * OPT-IN. Skipped unless `FORMS_INTEGRATION_DB` is set; needs the sandbox database
 * (`MJ_Forms303_Edge`; connection from the repo `.env`). Run it with:
 *
 *   cd packages/CoreEntitiesServer && FORMS_INTEGRATION_DB=1 npx vitest run src/engines/__tests__/FormAuthoringEngine.integration.spec.ts
 *
 * Every fixture form it builds is deleted in `afterAll`, whether the tests passed or not.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import '../../index.js'; // registers the entity server subclasses the engine saves through
import { BaseEntity, SetProvider, type DatabaseProviderBase, type UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { FormAuthoringEngine } from '../FormAuthoringEngine.js';
import { FORMS_ENTITY } from '../../shared/entity-names.js';

const ENABLED = Boolean(process.env.FORMS_INTEGRATION_DB);

interface Pool {
  connect(): Promise<Pool>;
  close(): Promise<void>;
}

interface World {
  provider: DatabaseProviderBase;
  system: UserInfo;
  formIds: string[];
  close: () => Promise<void>;
}

let world: World | undefined;

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
    pool: { max: 5 },
  }).connect();
  const provider = new SQLServerDataProvider();
  await provider.Config(new SQLServerProviderConfigData(pool as never, process.env.MJ_CORE_SCHEMA ?? '__mj', 0));
  SetProvider(provider);
  await UserCache.Instance.Refresh(provider);
  const system = UserCache.Instance.GetSystemUser();
  if (!system) {
    throw new Error(`No system user in ${process.env.DB_DATABASE}; the integration spec needs MJ's core data.`);
  }
  return { provider, system, formIds: [], close: () => pool.close() };
}

async function count(w: World, sql: string): Promise<number> {
  const [row] = await w.provider.ExecuteSQL<{ n: number }>(sql, undefined, undefined, w.system);
  return row.n;
}

/** Every row a form named `name` owns, by table — all zero means nothing was left behind. */
async function footprintByName(w: World, name: string): Promise<{ forms: number; pages: number; questions: number; versions: number }> {
  const quoted = name.replace(/'/g, "''");
  const ofForm = (table: string) =>
    `SELECT COUNT(*) AS n FROM __mj_BizAppsForms.${table} t JOIN __mj_BizAppsForms.Form f ON f.ID = t.FormID WHERE f.Name = '${quoted}'`;
  return {
    forms: await count(w, `SELECT COUNT(*) AS n FROM __mj_BizAppsForms.Form WHERE Name = '${quoted}'`),
    pages: await count(w, ofForm('FormPage')),
    questions: await count(w, ofForm('FormQuestion')),
    versions: await count(w, ofForm('FormVersion')),
  };
}

const NOTHING = { forms: 0, pages: 0, questions: 0, versions: 0 };

/**
 * Make the next save of a question option throw, as a database refusal deep in the copy would.
 * Every other save goes through, so the form, its pages and its questions are written FIRST and the
 * rollback has real rows to undo.
 *
 * Returns the footprint read at the moment of the failure, INSIDE the open transaction (the same
 * provider instance carries it, so its reads see the uncommitted rows). Asserting it is non-empty
 * is what makes an empty footprint afterwards mean "rolled back" rather than "never written".
 */
function failTheFirstOptionSave(w: World, name: string): { atFailure?: Awaited<ReturnType<typeof footprintByName>> } {
  const realSave = BaseEntity.prototype.Save;
  const seen: { atFailure?: Awaited<ReturnType<typeof footprintByName>> } = {};
  vi.spyOn(BaseEntity.prototype, 'Save').mockImplementation(async function (this: BaseEntity, ...args: Parameters<BaseEntity['Save']>) {
    if (!seen.atFailure && this.EntityInfo?.Name === FORMS_ENTITY.FormQuestionOption) {
      seen.atFailure = await footprintByName(w, name);
      throw new Error('forced child failure (integration spec)');
    }
    return realSave.apply(this, args);
  });
  return seen;
}

const choiceBlueprint = (name: string) => ({
  name,
  pages: [
    { title: 'One', questions: [{ type: 'ShortText' as const, prompt: 'Name' }] },
    {
      title: 'Two',
      questions: [{ type: 'SingleChoice' as const, prompt: 'Colour', options: [{ label: 'Red' }, { label: 'Blue' }] }],
    },
  ],
});

describe.skipIf(!ENABLED)('FormAuthoringEngine on SQL Server (DW14, Task 4/5 carries)', () => {
  beforeAll(async () => {
    world = await openWorld();
  }, 120_000);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    if (!world) {
      return;
    }
    try {
      for (const formId of world.formIds) {
        for (const statement of [
          `DELETE o FROM __mj_BizAppsForms.FormQuestionOption o JOIN __mj_BizAppsForms.FormQuestion q ON q.ID = o.QuestionID WHERE q.FormID = '${formId}'`,
          `DELETE FROM __mj_BizAppsForms.FormQuestion WHERE FormID = '${formId}'`,
          `DELETE FROM __mj_BizAppsForms.FormPage WHERE FormID = '${formId}'`,
          `DELETE FROM __mj_BizAppsForms.FormScreen WHERE FormID = '${formId}'`,
          `DELETE FROM __mj_BizAppsForms.FormDistribution WHERE FormID = '${formId}'`,
          `DELETE FROM __mj_BizAppsForms.FormVersion WHERE FormID = '${formId}'`,
          `DELETE FROM __mj_BizAppsForms.Form WHERE ID = '${formId}'`,
        ]) {
          await world.provider.ExecuteSQL(statement, undefined, undefined, world.system);
        }
      }
    } finally {
      await world.close();
    }
  }, 60_000);

  it('a Clone whose option save fails leaves no form, page or question behind', async () => {
    const w = world!;
    const source = await FormAuthoringEngine.Instance.BuildFromBlueprint(choiceBlueprint(`#303 clone source ${randomUUID()}`), w.provider, w.system);
    w.formIds.push(source.formId);
    const copyName = `#303 doomed clone ${randomUUID()}`;

    const seen = failTheFirstOptionSave(w, copyName);
    // A fixed sentence since 14d73c5: provider text (the forced failure) goes to the log only.
    await expect(
      FormAuthoringEngine.Instance.Clone(source.formId, w.provider, w.system, { asTemplate: false, name: copyName }),
    ).rejects.toThrow('The form change failed on the server; the server log has the detail.');

    expect(seen.atFailure?.forms).toBe(1);
    expect(seen.atFailure?.questions).toBeGreaterThan(0);
    expect(await footprintByName(w, copyName)).toEqual(NOTHING);
  }, 60_000);

  it('the same Clone, unforced, writes the whole copy (control)', async () => {
    const w = world!;
    const source = await FormAuthoringEngine.Instance.BuildFromBlueprint(choiceBlueprint(`#303 clone source ${randomUUID()}`), w.provider, w.system);
    w.formIds.push(source.formId);
    const copyName = `#303 clone ${randomUUID()}`;

    const copy = await FormAuthoringEngine.Instance.Clone(source.formId, w.provider, w.system, { asTemplate: false, name: copyName });
    w.formIds.push(copy.formId);

    expect(await footprintByName(w, copyName)).toEqual({ forms: 1, pages: 2, questions: 2, versions: 0 });
    expect(await count(w, `SELECT COUNT(*) AS n FROM __mj_BizAppsForms.FormQuestionOption o JOIN __mj_BizAppsForms.FormQuestion q ON q.ID = o.QuestionID WHERE q.FormID = '${copy.formId}'`)).toBe(2);
  }, 60_000);

  it('a starter CreateFromTemplate whose option save fails leaves nothing behind', async () => {
    const w = world!;
    const name = `#303 doomed starter ${randomUUID()}`;

    const seen = failTheFirstOptionSave(w, name);
    // `rsvp` carries choice questions, so its build reaches an option save.
    await expect(FormAuthoringEngine.Instance.CreateFromTemplate({ templateKey: 'rsvp' }, w.provider, w.system, { name })).rejects.toThrow();

    expect(seen.atFailure?.forms).toBe(1);
    expect(await footprintByName(w, name)).toEqual(NOTHING);
  }, 60_000);

  it('publishImmediately publishes what the open transaction just wrote, as version 1', async () => {
    const w = world!;
    const name = `#303 publish-immediately ${randomUUID()}`;

    const built = await FormAuthoringEngine.Instance.BuildFromBlueprint(choiceBlueprint(name), w.provider, w.system, { publishImmediately: true });
    w.formIds.push(built.formId);

    const [version] = await w.provider.ExecuteSQL<{ VersionNumber: number; Status: string; Questions: number }>(
      `SELECT v.VersionNumber, v.Status,
              (SELECT COUNT(*) FROM OPENJSON(v.DefinitionSnapshot, '$.pages') p CROSS APPLY OPENJSON(p.value, '$.questions')) AS Questions
       FROM __mj_BizAppsForms.FormVersion v WHERE v.FormID = '${built.formId}'`,
      undefined,
      undefined,
      w.system,
    );
    expect(version).toEqual({ VersionNumber: 1, Status: 'Published', Questions: 2 });
    expect(await count(w, `SELECT COUNT(*) AS n FROM __mj_BizAppsForms.FormVersion WHERE FormID = '${built.formId}'`)).toBe(1);
    expect(await count(w, `SELECT COUNT(*) AS n FROM __mj_BizAppsForms.Form WHERE ID = '${built.formId}' AND Status = 'Published'`)).toBe(1);
  }, 60_000);

  it('a publishImmediately whose option save fails leaves neither the form nor a version', async () => {
    const w = world!;
    const name = `#303 doomed publish-immediately ${randomUUID()}`;

    const seen = failTheFirstOptionSave(w, name);
    await expect(
      FormAuthoringEngine.Instance.BuildFromBlueprint(choiceBlueprint(name), w.provider, w.system, { publishImmediately: true }),
    ).rejects.toThrow();

    expect(seen.atFailure?.forms).toBe(1);
    expect(await footprintByName(w, name)).toEqual(NOTHING);
  }, 60_000);
});
