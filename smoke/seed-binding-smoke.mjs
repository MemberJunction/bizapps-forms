/**
 * Seed a live entity binding so the respondent smoke test exercises it end to end.
 *
 * Creates (idempotently): the automation service principal and its role assignment, a
 * FormEntityBinding from the Contact-us form onto MJ_BizApps_Common: People, a FormAutomation
 * pointing at it, and a republished FormVersion whose snapshot carries that automation — because
 * automations execute from the snapshot, not from the live rows.
 *
 * Run against a local dev database only. It writes real rows.
 */
import { spawnSync } from 'node:child_process';
import { AUTHORED_AUTOMATION_FIELDS, buildPublishedAutomations } from '@mj-biz-apps/forms-entities';

// Credentials come from the process environment, not from parsing .env here: a password may
// legitimately contain the characters a naive .env parser treats as syntax. Run this via
//   set -a && . ./.env && set +a && node smoke/seed-binding-smoke.mjs
const env = process.env;
if (!env.DB_PASSWORD || !env.DB_DATABASE) {
  console.error('Source .env first: set -a && . ./.env && set +a && node smoke/seed-binding-smoke.mjs');
  process.exit(1);
}

const SLUG = process.argv[2] || 'contact-us-e2e';

function sql(query) {
  const res = spawnSync(
    'docker',
    ['exec', 'forms-sql', '/opt/mssql-tools18/bin/sqlcmd', '-S', 'localhost', '-d', env.DB_DATABASE,
      '-U', env.DB_USERNAME, '-P', env.DB_PASSWORD, '-C', '-b', '-h', '-1', '-W', '-Q', query],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (res.status !== 0) {
    throw new Error(`sqlcmd failed: ${res.stderr || res.stdout}`);
  }
  return res.stdout.trim();
}

/**
 * Read one authored automation exactly as publish reads it.
 *
 * The column list IS `AUTHORED_AUTOMATION_FIELDS`, so a field the mapper reads but publish never
 * requests fails here rather than publishing as `undefined`. `FOR JSON` is what makes the types
 * survive the trip — bits come back as booleans and ints as numbers, where a text-mode sqlcmd read
 * would hand every column back as a string and quietly publish `"1"` where `true` belongs.
 */
function readAuthoredAutomationRow(automationId) {
  const columns = AUTHORED_AUTOMATION_FIELDS.map((f) => (f === 'Trigger' ? '[Trigger]' : f)).join(', ');
  const json = sqlWide(
    `SET NOCOUNT ON; SELECT ${columns} FROM __mj_BizAppsForms.FormAutomation ` +
      `WHERE ID='${automationId}' FOR JSON PATH, INCLUDE_NULL_VALUES;`,
  ).trim();
  const [row] = JSON.parse(json || '[]');
  if (!row) {
    throw new Error(`automation ${automationId} was not written; cannot build a snapshot from it`);
  }
  return row;
}

/**
 * Run a query whose single column may exceed sqlcmd's 256-character default.
 *
 * `-y 0` lifts that truncation but is mutually exclusive with both `-W` and `-h`, so this is a
 * separate invocation rather than a flag on {@link sql}, and the header row it therefore prints is
 * stripped here. Truncation is the nastiest kind of failure to leave in: the output still looks
 * like JSON, it is just half a document.
 */
function sqlWide(query) {
  const res = spawnSync(
    'docker',
    ['exec', 'forms-sql', '/opt/mssql-tools18/bin/sqlcmd', '-S', 'localhost', '-d', env.DB_DATABASE,
      '-U', env.DB_USERNAME, '-P', env.DB_PASSWORD, '-C', '-b', '-y', '0', '-Q', query],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (res.status !== 0) {
    throw new Error(`sqlcmd failed: ${res.stderr || res.stdout}`);
  }
  // Drop sqlcmd's column header and its dashed rule; keep the payload lines.
  return res.stdout
    .split('\n')
    .filter((line) => !/^JSON_/.test(line) && !/^-+$/.test(line.trim()) && line.trim() !== '')
    .join('')
    .trim();
}

const BINDING_ID = '11111111-2222-4333-8444-555555555001';
const AUTOMATION_ID = '11111111-2222-4333-8444-555555555002';
// The principal and its role SHIP in V202608081700__v0.8.x__Metadata_Sync.sql, so these GUIDs must
// be the seed's GUIDs — this fixture may only adopt them, never mint its own. It used to invent
// `11111111-…-003`/`-004`, which is fine while nothing else creates that identity and fatal the
// moment something does: `Role.Name` is UNIQUE, so a database that had run this script could no
// longer apply the seed migration at all ("Cannot insert duplicate key … (Forms Automation
// Runner)"). Found by rehearsing the migration set from zero against a database this script had
// touched. The IF NOT EXISTS guards below are kept so the fixture still stands alone on a database
// where the migrations have not run.
const PRINCIPAL_ID = '9F2B7C41-6E8D-4A53-B1F0-3C7D5E9A2B84';
const PRINCIPAL_ROLE_ID = '5154187D-0AB9-4C75-A444-CFC3D10E1BC0';
const Q_EMAIL = 'AE1FF634-ADE2-4AE9-9B16-1A417CC73AE8';
const Q_NAME = '17B03D45-7C90-4CA5-AB78-C98404D2C7EC';

const fieldMappings = JSON.stringify({
  version: 1,
  fields: [
    { targetField: 'Email', source: { kind: 'question', questionId: Q_EMAIL }, required: true },
    { targetField: 'FirstName', source: { kind: 'question', questionId: Q_NAME } },
    // Person.LastName is NOT NULL, so a mapping that omits it can merge into an existing row but
    // can never create one — the binding correctly reports a candidate failure carrying the
    // database's own message. A static source both satisfies the column and exercises that kind.
    { targetField: 'LastName', source: { kind: 'static', value: '(smoke)' } },
  ],
}).replace(/'/g, "''");

const identityRule = JSON.stringify({
  mode: 'MatchThenCreate',
  match: [{ targetField: 'Email', normalize: 'LowerCaseTrim' }],
}).replace(/'/g, "''");

const mergePolicy = JSON.stringify({ default: 'neverBlank' }).replace(/'/g, "''");

console.log('--- seeding binding smoke fixtures ---');

// 1. Service principal + the role the automations run under.
sql(`
IF NOT EXISTS (SELECT 1 FROM __mj.[User] WHERE Name='Forms Automation Service')
  INSERT INTO __mj.[User] (ID, Name, FirstName, LastName, Email, Type, IsActive)
  VALUES ('${PRINCIPAL_ID}', 'Forms Automation Service', 'Forms', 'Automation Service', 'forms-automation@localhost.invalid', 'User', 1);

-- Guarded on NAME, not ID, because Role.Name is the UNIQUE column — an ID check would pass on a
-- database that already has the role under a different GUID and then fail on the insert.
DECLARE @RoleID UNIQUEIDENTIFIER = (SELECT ID FROM __mj.Role WHERE Name='Forms Automation Runner');
IF @RoleID IS NULL
BEGIN
  SET @RoleID = '${PRINCIPAL_ROLE_ID}';
  INSERT INTO __mj.Role (ID, Name, Description) VALUES (@RoleID, 'Forms Automation Runner', 'Runs on-submit automations and entity bindings.');
END
IF NOT EXISTS (SELECT 1 FROM __mj.UserRole WHERE UserID='${PRINCIPAL_ID}' AND RoleID=@RoleID)
  INSERT INTO __mj.UserRole (ID, UserID, RoleID) VALUES (NEWID(), '${PRINCIPAL_ID}', @RoleID);
`);
console.log('  ok    service principal + role');

// The principal needs real grants on what it touches. Granting on the target entity here is the
// deployment decision the executor's allow-list keeps honest; for the smoke run we grant exactly
// the entities this binding uses and nothing else.
sql(`
DECLARE @RoleID UNIQUEIDENTIFIER = (SELECT ID FROM __mj.Role WHERE Name='Forms Automation Runner');
DECLARE @Entities TABLE (Name NVARCHAR(255), C BIT, R BIT, U BIT);
INSERT INTO @Entities VALUES
  ('MJ_BizApps_Common: People', 1, 1, 1),
  ('MJ_BizApps_Forms: Form Responses', 0, 1, 1),
  ('MJ_BizApps_Forms: Form Response Answers', 0, 1, 0),
  ('MJ_BizApps_Forms: Form Questions', 0, 1, 0),
  ('MJ_BizApps_Forms: Forms', 0, 1, 0),
  ('MJ_BizApps_Forms: Form Automations', 0, 1, 0),
  ('MJ_BizApps_Forms: Form Entity Bindings', 0, 1, 0),
  ('MJ_BizApps_Forms: Form Automation Runs', 1, 1, 1),
  ('MJ_BizApps_Forms: Form Entity Binding Records', 1, 1, 1);

-- UPSERT, not insert-if-missing. Most of these grants now SHIP in the metadata seed, so a
-- plain "insert what is absent" silently no-ops against the shipped row and leaves whatever
-- flags it carries -- which is how this fixture passed while the run it set up failed on
-- 'Does NOT have permission to Read MJ_BizApps_Forms: Forms'. A fixture must establish its
-- preconditions, not hope they already hold.
MERGE __mj.EntityPermission AS tgt
USING (SELECT e.ID AS EntityID, x.C, x.R, x.U FROM @Entities x JOIN __mj.Entity e ON e.Name = x.Name) AS src
   ON tgt.EntityID = src.EntityID AND tgt.RoleID = @RoleID
WHEN MATCHED AND (tgt.CanCreate <> src.C OR tgt.CanRead <> src.R OR tgt.CanUpdate <> src.U)
  THEN UPDATE SET CanCreate = src.C, CanRead = src.R, CanUpdate = src.U
WHEN NOT MATCHED BY TARGET
  THEN INSERT (ID, EntityID, RoleID, CanCreate, CanRead, CanUpdate, CanDelete)
       VALUES (NEWID(), src.EntityID, @RoleID, src.C, src.R, src.U, 0);
`);
console.log('  ok    entity permissions for the principal');

// 2. The binding + the automation that runs it.
const formId = sql(`SET NOCOUNT ON; SELECT TOP 1 CAST(f.ID AS varchar(40)) FROM __mj_BizAppsForms.Form f JOIN __mj_BizAppsForms.FormDistribution d ON d.FormID=f.ID WHERE d.Slug='${SLUG}';`).trim();
const peopleEntityId = sql(`SET NOCOUNT ON; SELECT CAST(ID AS varchar(40)) FROM __mj.Entity WHERE Name='MJ_BizApps_Common: People';`).trim();

sql(`
IF EXISTS (SELECT 1 FROM __mj_BizAppsForms.FormEntityBinding WHERE ID='${BINDING_ID}')
  UPDATE __mj_BizAppsForms.FormEntityBinding
    SET FieldMappings='${fieldMappings}', IdentityRule='${identityRule}', MergePolicy='${mergePolicy}', Status='Active'
    WHERE ID='${BINDING_ID}';
ELSE
  INSERT INTO __mj_BizAppsForms.FormEntityBinding
    (ID, FormID, Name, TargetEntityID, TargetEntityName, FieldMappings, IdentityRule, MergePolicy, Status)
  VALUES ('${BINDING_ID}', '${formId}', 'Smoke: bind respondent to Person', '${peopleEntityId}',
          'MJ_BizApps_Common: People', '${fieldMappings}', '${identityRule}', '${mergePolicy}', 'Active');

IF NOT EXISTS (SELECT 1 FROM __mj_BizAppsForms.FormAutomation WHERE ID='${AUTOMATION_ID}')
  INSERT INTO __mj_BizAppsForms.FormAutomation
    (ID, FormID, Name, TargetType, BindingID, [Trigger], ExecutionMode, DisplayOrder, ContinueOnError, IsActive)
  VALUES ('${AUTOMATION_ID}', '${formId}', 'Smoke: create Person', 'EntityBinding', '${BINDING_ID}',
          'OnComplete', 'Sync', 1, 1, 1);
`);
console.log('  ok    binding + automation rows');

// 3. Republish: put the automation INTO the snapshot, which is what actually executes.
//
// The snapshot is built by the SAME `buildPublishedAutomations` that publish uses, reading the row
// that was just written, rather than by hand-writing the JSON here. Hand-writing it is what let a
// real bug survive a green smoke run: publish emitted a hardcoded empty array for months, and this
// script's own literal made the snapshot look correct anyway, so the suite asserted the contents
// while stepping around the code meant to produce them. Anything the mapper gets wrong — a field
// name, an omitted id, the sort — now fails here too.
const authored = readAuthoredAutomationRow(AUTOMATION_ID);
const automationJson = JSON.stringify(buildPublishedAutomations([authored])).replace(/'/g, "''");
console.log(`  ok    snapshot automations built by the real mapper (${AUTHORED_AUTOMATION_FIELDS.length} columns read)`);

sql(`
DECLARE @VerID UNIQUEIDENTIFIER = (
  SELECT TOP 1 v.ID FROM __mj_BizAppsForms.FormVersion v
  JOIN __mj_BizAppsForms.FormDistribution d ON d.FormID=v.FormID
  WHERE d.Slug='${SLUG}' AND v.Status='Published' ORDER BY v.VersionNumber DESC);
DECLARE @Snap NVARCHAR(MAX) = (SELECT DefinitionSnapshot FROM __mj_BizAppsForms.FormVersion WHERE ID=@VerID);
-- Splice the automations array in as a sibling of "pages"; JSON_MODIFY keeps the rest byte-identical.
SET @Snap = JSON_MODIFY(@Snap, '$.automations', JSON_QUERY('${automationJson}'));
UPDATE __mj_BizAppsForms.FormVersion SET DefinitionSnapshot=@Snap WHERE ID=@VerID;
SELECT 'snapshot automations=' + CAST(ISNULL((SELECT COUNT(*) FROM OPENJSON(@Snap, '$.automations')),0) AS varchar);
`);
console.log('  ok    published snapshot now carries the automation');
console.log('--- seeded ---');
