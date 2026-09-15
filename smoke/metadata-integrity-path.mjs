/**
 * Smoke test for the CORE METADATA this app owns — the input CodeGen reads, checked in the database
 * rather than in the files CodeGen produced last time.
 *
 * WHY THIS CANNOT BE A UNIT TEST, which is the whole reason it exists. Issue #66 was a duplicate
 * `EntityRelationship` row: CodeGen emits one `@FieldResolver` per row, so two rows made the next
 * regeneration emit `mjBizAppsFormsFormScreens_FormIDArray` twice and `forms-server` stopped
 * compiling (TS2300 / TS2393). Nothing in this repo could see it. The unit suites run against
 * hand-written source, `pnpm run build` compiles the CHECKED-IN generated files — which predate the
 * duplicate and are fine — and the smoke suites exercise the running server. Every gate was green
 * for six days while the defect sat in the one place none of them look: `__mj`. It surfaced only
 * when somebody regenerated, on a branch that had nothing to do with it.
 *
 * WHAT MAKES THE DUPLICATES POSSIBLE. Of the tables below, `EntityFieldValue`, `EntityRelationship`,
 * `EntitySetting` and `EntityPermission` carry NO unique constraint on their natural key upstream —
 * only a primary key on `ID`. Every writer therefore owns idempotency by convention, and a migration
 * that guards its insert on `IF NOT EXISTS (… WHERE [ID] = '<guid>')` is asking whether that ROW was
 * inserted before rather than whether the THING it describes already exists. That is issue #64, and
 * it is why `V202608252300` had repair work to do. (`scripts/check-distribution-seed.mjs` CHECK 4
 * now refuses that guard shape at authoring time; this script is the other half — it rules on the
 * database rather than on the SQL, and catches a duplicate whatever wrote it.)
 *
 * DELIBERATELY NOT CHECKED: `EntityField (EntityID, Name)` and `ApplicationEntity (ApplicationID,
 * EntityID)`. Both DO carry unique constraints upstream — `UQ_EntityField_EntityID_Name` and
 * `UQ_ApplicationEntity_ApplicationID_EntityID` — so asserting them here would be a tautology that
 * passes by construction on every input while reading like protection. (It is also why `V202608191300`
 * got its `EntityField` guards right and its `EntityFieldValue` guards wrong: an ID-only guard on
 * `EntityField` would have FAILED loudly on the constraint, so that class could never have shipped
 * broken. The tables with no constraint are the tables where the mistake is survivable, and
 * therefore the tables where it happened.)
 *
 * SCOPED TO THIS APP'S ENTITIES, NEVER CORE-WIDE. `__mj` is shared with MJ itself and with every
 * sibling Open App; a duplicate in someone else's metadata is not ours to fail on, and a core-wide
 * version of this script would go red next to an app that has one.
 *
 * Prerequisites: `.env` only. This one needs NO server — it reads the database directly, so it is
 * runnable at any point in a migration cycle, including before MJAPI can start.
 *   set -a && . ./.env && set +a && node smoke/metadata-integrity-path.mjs
 */
import { requireDbEnv, sql } from './lib/sqlcmd.mjs';

requireDbEnv('metadata-integrity-path.mjs');

/**
 * This app's schema, as `mj.config.cjs` defines it. Hardcoded like the entity names in the sibling
 * smoke scripts: a host that renamed it is not a host these scripts run against.
 */
const FORMS_SCHEMA = '__mj_BizAppsForms';

let failures = 0;
const pass = (m) => console.log(`  ok    ${m}`);
const fail = (m, d) => { failures++; console.error(`  FAIL  ${m}${d ? `\n          ${d}` : ''}`); };
const check = (cond, m, d) => (cond ? pass(m) : fail(m, d));

/** Non-empty output lines from a query, trimmed. `sql()` returns '' for an empty result set. */
function rows(query) {
  const out = sql(query);
  return out ? out.split('\n').map((line) => line.trim()).filter(Boolean) : [];
}

/**
 * Assert that a natural key holds no duplicate group among this app's entities.
 *
 * `detail` is selected rather than counted so a failure NAMES the offending rows: a bare count tells
 * you something is wrong and leaves you to write this query again by hand, which is the moment
 * somebody decides the check is more trouble than the bug.
 */
function noDuplicates(label, detailSelect) {
  const found = rows(detailSelect);
  check(found.length === 0, label, found.length ? found.join('\n          ') : undefined);
}

console.log('\nCore metadata integrity — the input CodeGen reads\n');

// 1. Picklist values. Two rows for one (field, value) make CodeGen emit the same union member twice.
noDuplicates(
  'no duplicate EntityFieldValue rows on a Forms entity',
  `SELECT ISNULL(e.Name,'?') + '.' + ISNULL(ef.Name,'?') + ' = ''' + ISNULL(efv.Value,'?') + ''' (' + CAST(COUNT(*) AS NVARCHAR(10)) + ' rows)'
   FROM __mj.EntityFieldValue efv
   JOIN __mj.EntityField ef ON ef.ID = efv.EntityFieldID
   JOIN __mj.Entity e ON e.ID = ef.EntityID
   WHERE e.SchemaName = '${FORMS_SCHEMA}'
   GROUP BY e.Name, ef.Name, efv.EntityFieldID, efv.Value HAVING COUNT(*) > 1`,
);

// 2. Issue #66's exact mechanism. The generated member name is built from the related entity and the
//    join field, so that pair — NOT the pair plus Type — is the key that collides. Two rows
//    differing only in `Type` still produce one duplicated identifier, and a check keyed on Type
//    would report health on precisely that shape.
noDuplicates(
  'no EntityRelationship rows that would collide as one generated resolver',
  `SELECT ISNULL(e.Name,'?') + ' -> ' + ISNULL(re.Name,'?') + ' on ' + ISNULL(er.RelatedEntityJoinField,'?') + ' (' + CAST(COUNT(*) AS NVARCHAR(10)) + ' rows)'
   FROM __mj.EntityRelationship er
   JOIN __mj.Entity e ON e.ID = er.EntityID
   JOIN __mj.Entity re ON re.ID = er.RelatedEntityID
   WHERE e.SchemaName = '${FORMS_SCHEMA}'
   GROUP BY e.Name, re.Name, er.EntityID, er.RelatedEntityID, er.RelatedEntityJoinField HAVING COUNT(*) > 1`,
);

// 3. Which copy MJ reads for a duplicated (EntityID, Name) is unspecified, so the Explorer form
//    designer's field layout becomes whichever row the planner happens to return first.
noDuplicates(
  'no duplicate EntitySetting rows on a Forms entity',
  `SELECT ISNULL(e.Name,'?') + '.' + ISNULL(es.Name,'?') + ' (' + CAST(COUNT(*) AS NVARCHAR(10)) + ' rows)'
   FROM __mj.EntitySetting es
   JOIN __mj.Entity e ON e.ID = es.EntityID
   WHERE e.SchemaName = '${FORMS_SCHEMA}'
   GROUP BY e.Name, es.EntityID, es.Name HAVING COUNT(*) > 1`,
);

// 4. Clean today — this is the tripwire. A duplicate (EntityID, RoleID) is how `V202608131600`'s
//    hardening can be satisfied on one row while an unfiltered twin sits beside it, and
//    `UserExemptFromRowLevelSecurity` returns TRUE on the FIRST unfiltered row it finds.
noDuplicates(
  'no duplicate EntityPermission rows on a Forms entity',
  `SELECT ISNULL(e.Name,'?') + ' / ' + ISNULL(r.Name,'?') + ' (' + CAST(COUNT(*) AS NVARCHAR(10)) + ' rows)'
   FROM __mj.EntityPermission ep
   JOIN __mj.Entity e ON e.ID = ep.EntityID
   JOIN __mj.Role r ON r.ID = ep.RoleID
   WHERE e.SchemaName = '${FORMS_SCHEMA}'
   GROUP BY e.Name, r.Name, ep.EntityID, ep.RoleID HAVING COUNT(*) > 1`,
);

// 5. The specific row #66 was about, pinned by identity rather than by shape. Check 2 would catch a
//    recurrence, but only as one anonymous group among any others; this says which relationship is
//    supposed to exist and how many times, so a regression reports the actual regression.
//    Matched on BaseTable, not entity name, so the `MJ_BizApps_Forms: ` prefix is not load-bearing.
const screenRelCount = sql(
  `SELECT COUNT(*) FROM __mj.EntityRelationship er
   JOIN __mj.Entity e ON e.ID = er.EntityID
   JOIN __mj.Entity re ON re.ID = er.RelatedEntityID
   WHERE e.SchemaName = '${FORMS_SCHEMA}' AND e.BaseTable = 'Form'
     AND re.SchemaName = '${FORMS_SCHEMA}' AND re.BaseTable = 'FormScreen'`,
).trim();
check(
  screenRelCount === '1',
  'exactly one Forms -> Form Screens relationship',
  screenRelCount === '1' ? undefined
    : `found ${screenRelCount}. Two rows is issue #66 exactly: the next \`mj codegen\` emits ` +
      '`mjBizAppsFormsFormScreens_FormIDArray` twice and forms-server stops compiling. Zero means ' +
      'the relationship was removed and the generated `FormScreensArray` field has silently vanished.',
);

console.log(failures === 0
  ? '\nPASS — the metadata CodeGen reads is converged; a regeneration will not collide.'
  : `\nFAIL — ${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
