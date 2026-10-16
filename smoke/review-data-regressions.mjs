/**
 * PR 304 regressions in shipped SQL. Runs the real query/migration bodies against session-local
 * temporary fixtures; only source object names and template parameters are substituted. No host
 * data is modified. Run: node --env-file=.env smoke/review-data-regressions.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { requireDbEnv, sql } from './lib/sqlcmd.mjs';

requireDbEnv('review-data-regressions.mjs');
const root = new URL('../', import.meta.url);

function checkValueKinds() {
  const query = readFileSync(new URL('metadata/queries/SQL/forms-question-answer-value-counts.sql', root), 'utf8')
    .replaceAll('[__mj_BizAppsForms].[vwFormResponses]', '#Responses')
    .replaceAll('[__mj_BizAppsForms].[vwFormResponseAnswers]', '#Answers')
    .replace('{{ FormID | sqlString }}', "N'form'")
    .replace(/{% if FormVersionID %}[\s\S]*?{% endif %}/g, '');
  const fixture = `
    CREATE TABLE #Responses (ID nvarchar(20), FormID nvarchar(20), Status nvarchar(20));
    CREATE TABLE #Answers (QuestionID nvarchar(20), ResponseID nvarchar(20), TextValue nvarchar(max),
      NumericValue decimal(18,4), BooleanValue bit, DateValue datetime2, JSONValue nvarchar(max));
    INSERT #Responses VALUES ('old', 'form', 'Complete'), ('new', 'form', 'Complete'), ('partial', 'form', 'Partial');
    INSERT #Answers VALUES
      ('q', 'old', 'historical text', NULL, NULL, NULL, NULL),
      ('q', 'new', NULL, 5, NULL, NULL, '["a","b"]'),
      ('q', 'partial', 'ignore me', 10, NULL, NULL, NULL);
  `;
  const rows = sql(fixture + query).split('\n').map((line) => line.trim().split('|'));
  const numeric = rows.find((row) => row[2] === 'Numeric');
  assert.equal(numeric?.[1], '1', 'Numeric answered responses must exclude historical Text responses');
  assert.equal(rows.filter((row) => row[2] === 'Text').length, 3);
  for (const row of rows.filter((row) => row[2] === 'Text')) {
    assert.equal(row[1], '2', 'multi-select choices must count their response only once');
  }
  console.log('PASS value counts: answered responses partitioned by kind; multi-select distinct; partial excluded');
}

function checkRetirement() {
  const migration = readFileSync(new URL('migrations/V202610132000__v0.16.x__Retire_Respondent_Form_Version_Read.sql', root), 'utf8')
    .replaceAll('[${mjSchema}].[EntityPermission]', '#Permissions')
    .replaceAll('[${mjSchema}].[Entity]', '#Entities')
    .replaceAll('[${mjSchema}].[Role]', '#Roles')
    .replaceAll('[${mjSchema}].[RowLevelSecurityFilter]', '#Filters')
    .replaceAll('${flyway:defaultSchema}', 'forms_fixture');
  const fixture = `
    CREATE TABLE #Entities (ID int, Name nvarchar(100), SchemaName nvarchar(100), BaseTable nvarchar(100));
    CREATE TABLE #Roles (ID int, Name nvarchar(100));
    CREATE TABLE #Filters (ID uniqueidentifier);
    CREATE TABLE #Permissions (EntityID int, RoleID int, ReadRLSFilterID uniqueidentifier,
      CreateRLSFilterID uniqueidentifier, UpdateRLSFilterID uniqueidentifier, DeleteRLSFilterID uniqueidentifier);
    INSERT #Entities VALUES (1, 'Host Custom Versions', 'forms_fixture', 'FormVersion'),
      (2, 'Other Versions', 'other_schema', 'FormVersion');
    INSERT #Roles VALUES (1, 'Form Respondent');
    INSERT #Permissions (EntityID, RoleID) VALUES (1, 1), (1, 1), (2, 1);
    INSERT #Filters VALUES ('7F0E0003-A1B2-4C3D-8E4F-000000000003');
    GO
  `;
  const checks = `
    IF EXISTS (SELECT 1 FROM #Permissions WHERE EntityID = 1)
      THROW 51190, 'Renamed FormVersion still has respondent grants', 1;
    IF (SELECT COUNT(*) FROM #Permissions WHERE EntityID = 2) <> 1
      THROW 51191, 'Unrelated schema permission was removed', 1;
    IF EXISTS (SELECT 1 FROM #Filters)
      THROW 51192, 'Unused Forms filter was retained', 1;
    PRINT 'PASS retirement: renamed entity, duplicate grants, unrelated schema preserved, idempotent';
  `;
  console.log(sql(fixture + migration + '\n' + migration + '\n' + checks));
  assert.throws(
    () => sql(fixture + 'DELETE FROM #Entities WHERE ID = 1;\nGO\n' + migration),
    /FormVersion entity is missing/,
    'Missing entity metadata must refuse to report successful permission retirement',
  );
  console.log('PASS retirement: missing entity fails closed');
}

function checkPullFilters() {
  const fixture = `
    CREATE TABLE #Categories (ID int, Name nvarchar(100));
    INSERT #Categories VALUES (1, 'Forms'), (2, 'Other App');
    CREATE TABLE #Records (ID int, CategoryID int, Name nvarchar(100), SchemaName nvarchar(100));
    INSERT #Records VALUES (1, 1, 'Forms', '__mj_BizAppsForms'), (2, 2, 'Other App', '__mj_BizAppsOther');
  `;
  for (const directory of ['queries', 'remote-operations', 'remote-operation-categories', 'entities']) {
    const config = JSON.parse(readFileSync(new URL(`metadata/${directory}/.mj-sync.json`, root), 'utf8'));
    const filter = config.pull.filter
      .replaceAll('[__mj].vwQueryCategories', '#Categories')
      .replaceAll('[__mj].vwRemoteOperationCategories', '#Categories');
    assert.equal(sql(fixture + `SELECT ID FROM #Records WHERE ${filter}`), '1', `${directory} pull must exclude other apps`);
  }
  console.log('PASS pull filters: only Forms queries, operations, categories and entities selected');
}

let failed = false;
for (const check of [checkValueKinds, checkRetirement, checkPullFilters]) {
  try { check(); } catch (error) { failed = true; console.error(error); }
}
process.exitCode = failed ? 1 : 0;
