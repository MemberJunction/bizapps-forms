/**
 * `FormPublishingEngine.Publish` against a REAL SQL Server — F9 of the 2026-10-26 smoke test: the
 * publish gate judged rules in the order SQL returned rows (by id), not display order, and refused a
 * rule that reads an EARLIER question as "answered later". A fake provider returns rows in the order
 * the spec wrote them, so it cannot prove what the database's own order does; this file can.
 *
 * The fixture is built so the database order PROVABLY disagrees with display order: a form of six
 * questions is created, then a (source, dependent) pair is picked where the source is displayed first
 * and sorts AFTER the dependent by id — the rule reads the earlier question, and a gate in id order
 * would see it as later.
 *
 * OPT-IN. Skipped unless `FORMS_INTEGRATION_DB` is set; run it ONLY against a sandbox database the
 * repo `.env` names (connection from that file), never the shared dev database. It is one of the
 * release checklist's opt-in specs (`docs/database-operations.md`) and runs with the others there:
 *
 *   cd packages/CoreEntitiesServer && FORMS_INTEGRATION_DB=1 npx vitest run src/engines/__tests__/FormPublishingEngine.integration.spec.ts
 *
 * Every fixture form it builds is deleted in `afterAll`, whether the tests passed or not.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import '../../index.js'; // registers the entity server subclasses the engine saves through
import { SetProvider, type DatabaseProviderBase, type UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { FormAuthoringEngine } from '../FormAuthoringEngine.js';
import { FormPublishingEngine } from '../FormPublishingEngine.js';

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

const QUESTION_COUNT = 6;

/** Attempts at drawing ids where some earlier-displayed question sorts after a later one. */
const MAX_FIXTURE_ATTEMPTS = 20;

interface QuestionOrder {
  ID: string;
  DisplayOrder: number;
}

/** Build a draft whose id order disagrees with display order; returns an (earlier, later) pair. */
async function buildDisagreeingDraft(w: World): Promise<{ formId: string; sourceId: string; dependentId: string }> {
  for (let attempt = 1; attempt <= MAX_FIXTURE_ATTEMPTS; attempt++) {
    const built = await FormAuthoringEngine.Instance.BuildFromBlueprint(
      {
        name: `Task 8 publish order ${randomUUID()}`,
        pages: [{ title: 'One', questions: Array.from({ length: QUESTION_COUNT }, (_, i) => ({ type: 'ShortText' as const, prompt: `Q${i}` })) }],
      },
      w.provider,
      w.system,
    );
    w.formIds.push(built.formId);
    const rows = await w.provider.ExecuteSQL<QuestionOrder>(
      `SELECT ID, DisplayOrder FROM __mj_BizAppsForms.FormQuestion WHERE FormID = '${built.formId}'`,
      undefined,
      undefined,
      w.system,
    );
    // Ranked by the database's own uniqueidentifier order, which is what an unordered keyed read returns.
    const ranked = await w.provider.ExecuteSQL<{ ID: string }>(
      `SELECT ID FROM __mj_BizAppsForms.FormQuestion WHERE FormID = '${built.formId}' ORDER BY ID`,
      undefined,
      undefined,
      w.system,
    );
    const idRank = new Map(ranked.map((r, i) => [r.ID.toLowerCase(), i]));
    const rank = (id: string): number => idRank.get(id.toLowerCase()) ?? 0;
    const byDisplay = [...rows].sort((a, b) => a.DisplayOrder - b.DisplayOrder);
    for (let d = 1; d < byDisplay.length; d++) {
      for (let s = 0; s < d; s++) {
        if (rank(byDisplay[s].ID) > rank(byDisplay[d].ID)) {
          return { formId: built.formId, sourceId: byDisplay[s].ID, dependentId: byDisplay[d].ID };
        }
      }
    }
  }
  throw new Error(`Could not draw question ids that sort against display order in ${MAX_FIXTURE_ATTEMPTS} attempts.`);
}

describe.skipIf(!ENABLED)('FormPublishingEngine on SQL Server (F9: rules are judged in display order)', () => {
  beforeAll(async () => {
    world = await openWorld();
  }, 120_000);

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

  it('publishes a draft whose ids sort against display order, with the rule reading an earlier question', async () => {
    const w = world!;
    const { formId, sourceId, dependentId } = await buildDisagreeingDraft(w);
    const rule = JSON.stringify({ show: { all: [{ questionId: sourceId, op: 'equals', value: 'x' }] } });
    await w.provider.ExecuteSQL(
      `UPDATE __mj_BizAppsForms.FormQuestion SET ConditionalRule = '${rule}' WHERE ID = '${dependentId}'`,
      undefined,
      undefined,
      w.system,
    );

    const published = await FormPublishingEngine.Instance.Publish(formId, w.provider, w.system);

    const ids = published.definition.pages[0].questions.map((q) => q.id.toLowerCase());
    expect(published.versionNumber).toBe(1);
    expect(ids.indexOf(sourceId.toLowerCase())).toBeLessThan(ids.indexOf(dependentId.toLowerCase()));
  }, 60_000);
});
