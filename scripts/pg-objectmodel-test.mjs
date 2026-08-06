// Functional test of the Forms object model on PostgreSQL.
//
// Proves the converted migrations produce a WORKING model, not merely objects that exist:
// the write path (CodeGen CRUD functions), the read path (FK-join base views), the
// self-referencing category tree (ParentID + the derived RootParentID), the cross-app link
// to bizapps-common (FormResponse.RespondentPersonID -> Person.ID), the CHECK constraints
// and unique keys the migrations add, the __mj_UpdatedAt triggers, and a full CRUD
// round-trip. Self-cleaning.
//
// Run with the PG stack up and the env from migrations-pg/docs/PG_INSTALL_VERIFICATION.md:
//   node scripts/pg-objectmodel-test.mjs
import { Pool } from 'pg';

const S = process.env.FORMS_PG_SCHEMA ?? '__mj_bizappsforms';
const COMMON = '__mj_bizappscommon';
const pool = new Pool({
  host: process.env.DB_HOST ?? 'localhost',
  port: +(process.env.DB_PORT ?? 5436),
  user: process.env.DB_USERNAME ?? 'mj_admin',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE ?? 'FORMS_Test',
});
const q = (sql, p) => pool.query(sql, p);

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log(`  ✓ ${n}`); };
const bad = (n, d) => { fail++; console.log(`  ✗ ${n} — ${d}`); };
const check = (n, cond, d) => (cond ? ok(n) : bad(n, d));

// Reverse-dependency order: unshift on create, delete front-to-back.
const created = [];

async function createRow(table, fn, args) {
  const keys = Object.keys(args);
  const sql = `SELECT "ID" FROM ${S}."${fn}"(${keys.map((k, i) => `${k} := $${i + 1}`).join(', ')})`;
  const id = (await q(sql, Object.values(args))).rows[0].ID;
  created.unshift({ table, id });
  return id;
}

/** Asserts a statement is REJECTED by the database, and by the expected constraint. */
async function expectReject(name, sql, params, wantFragment) {
  try {
    await q(sql, params);
    bad(name, 'statement succeeded but should have been rejected');
  } catch (e) {
    check(name, e.message.includes(wantFragment), `rejected, but with "${e.message}"`);
  }
}

async function main() {
  const stamp = `PGTEST-${process.pid}`;

  console.log('\n1. CRUD functions write through');
  const rootCat = await createRow('FormCategory', 'spCreateFormCategory', {
    p_name: `${stamp} Root`, p_description: 'Throwaway category', p_displayrank: 1, p_isactive: true,
  });
  const childCat = await createRow('FormCategory', 'spCreateFormCategory', {
    p_name: `${stamp} Child`, p_parentid: rootCat, p_displayrank: 2, p_isactive: true,
  });
  const style = await createRow('FormStyle', 'spCreateFormStyle', { p_name: `${stamp} Style` });
  const form = await createRow('Form', 'spCreateForm', {
    p_name: `${stamp} Form`, p_categoryid: childCat, p_styleid: style,
    p_status: 'Draft', p_rendermode: 'Scroll',
  });
  check('spCreateForm returned a row', !!form, 'no ID returned');
  const version = await createRow('FormVersion', 'spCreateFormVersion', {
    p_formid: form, p_versionnumber: 1, p_status: 'Draft',
  });
  const page = await createRow('FormPage', 'spCreateFormPage', { p_formid: form, p_displayorder: 1 });
  const question = await createRow('FormQuestion', 'spCreateFormQuestion', {
    p_formid: form, p_pageid: page, p_questiontype: 'ShortText',
    p_prompt: 'What is your name?', p_isrequired: true, p_displayorder: 1,
  });
  const option = await createRow('FormQuestionOption', 'spCreateFormQuestionOption', {
    p_questionid: question, p_label: 'Option A', p_displayorder: 1,
  });
  check('child rows created across the whole tree', !!(version && page && question && option), 'missing IDs');

  console.log('\n2. Base views resolve their FK joins');
  const vForm = (await q(`SELECT * FROM ${S}."vwForms" WHERE "ID" = $1`, [form])).rows[0];
  check('vwForms row exists', !!vForm, 'not found');
  check('vwForms.Category resolves the category name', vForm?.Category === `${stamp} Child`, `got ${vForm?.Category}`);
  check('vwForms.Style resolves the style name', vForm?.Style === `${stamp} Style`, `got ${vForm?.Style}`);

  const vCat = (await q(`SELECT * FROM ${S}."vwFormCategories" WHERE "ID" = $1`, [childCat])).rows[0];
  check('vwFormCategories.Parent resolves the parent name', vCat?.Parent === `${stamp} Root`, `got ${vCat?.Parent}`);
  check('vwFormCategories.RootParentID walks the tree to the root',
    vCat?.RootParentID === rootCat, `got ${vCat?.RootParentID}, wanted ${rootCat}`);

  console.log('\n3. Cross-app link into bizapps-common');
  const person = (await q(
    `INSERT INTO ${COMMON}."Person" ("ID","FirstName","LastName") VALUES (gen_random_uuid(), $1, $2) RETURNING "ID"`,
    [stamp, 'Respondent'])).rows[0].ID;
  created.unshift({ table: `${COMMON}.Person`, id: person, schema: COMMON });
  const response = await createRow('FormResponse', 'spCreateFormResponse', {
    p_formid: form, p_formversionid: version, p_status: 'Partial', p_respondentpersonid: person,
  });
  const vResp = (await q(`SELECT * FROM ${S}."vwFormResponses" WHERE "ID" = $1`, [response])).rows[0];
  check('vwFormResponses.RespondentPerson resolves across schemas',
    typeof vResp?.RespondentPerson === 'string' && vResp.RespondentPerson.includes(stamp),
    `got ${vResp?.RespondentPerson}`);
  await expectReject('FK rejects a respondent who is not a Person',
    `SELECT ${S}."spCreateFormResponse"(p_formid := $1, p_formversionid := $2, p_status := 'Partial', p_respondentpersonid := gen_random_uuid())`,
    [form, version], 'FK_FormResponse_RespondentPerson');

  const answer = await createRow('FormResponseAnswer', 'spCreateFormResponseAnswer', {
    p_responseid: response, p_questionid: question, p_textvalue: 'Ada Lovelace',
  });
  check('answer links response to question', !!answer, 'no ID returned');

  console.log('\n4. Constraints the migrations declare are enforced');
  await expectReject('CK_Form_Status rejects an unknown status',
    `SELECT ${S}."spCreateForm"(p_name := $1, p_status := 'Nonsense', p_rendermode := 'Scroll')`,
    [`${stamp} Bad`], 'CK_Form_Status');
  await expectReject('CK_FormQuestion_QuestionType rejects an unknown type',
    `SELECT ${S}."spCreateFormQuestion"(p_formid := $1, p_questiontype := 'Telepathy', p_prompt := 'x')`,
    [form], 'CK_FormQuestion_QuestionType');
  await expectReject('UQ_FormVersion_Form_VersionNumber rejects a duplicate version',
    `SELECT ${S}."spCreateFormVersion"(p_formid := $1, p_versionnumber := 1, p_status := 'Draft')`,
    [form], 'UQ_FormVersion_Form_VersionNumber');
  await expectReject('UQ_FormStyle_Name rejects a duplicate style name',
    `SELECT ${S}."spCreateFormStyle"(p_name := $1)`, [`${stamp} Style`], 'UQ_FormStyle_Name');
  await expectReject('NOT NULL rejects a form with no name',
    `SELECT ${S}."spCreateForm"(p_status := 'Draft', p_rendermode := 'Scroll')`, [], 'null value');

  console.log('\n5. Update path and the __mj_UpdatedAt trigger');
  const before = (await q(`SELECT "__mj_UpdatedAt" FROM ${S}."Form" WHERE "ID" = $1`, [form])).rows[0].__mj_UpdatedAt;
  await q(`SELECT ${S}."spUpdateForm"(p_id := $1, p_name := $2, p_status := 'Published', p_rendermode := 'OneQuestion')`,
    [form, `${stamp} Form (renamed)`]);
  const after = (await q(`SELECT * FROM ${S}."Form" WHERE "ID" = $1`, [form])).rows[0];
  check('spUpdateForm persists the change', after.Name === `${stamp} Form (renamed)`, `got ${after.Name}`);
  check('spUpdateForm persists a second column', after.Status === 'Published', `got ${after.Status}`);
  check('the update trigger moved __mj_UpdatedAt forward',
    new Date(after.__mj_UpdatedAt) > new Date(before), `${before} -> ${after.__mj_UpdatedAt}`);

  console.log('\n6. Delete path');
  await q(`SELECT ${S}."spDeleteFormResponseAnswer"(p_id := $1)`, [answer]);
  const gone = (await q(`SELECT count(*)::int AS n FROM ${S}."FormResponseAnswer" WHERE "ID" = $1`, [answer])).rows[0].n;
  check('spDeleteFormResponseAnswer removes the row', gone === 0, `${gone} row(s) remain`);
  created.splice(created.findIndex((c) => c.id === answer), 1);
}

async function cleanup() {
  for (const { table, id, schema } of created) {
    const target = schema ? `${schema}."${table.split('.').pop()}"` : `${S}."${table}"`;
    try {
      await q(`DELETE FROM ${target} WHERE "ID" = $1`, [id]);
    } catch (e) {
      // Report rather than swallow: leftovers make the next run's uniqueness checks lie.
      console.log(`  ! cleanup failed for ${target} ${id}: ${e.message}`);
    }
  }
}

try {
  await main();
} catch (e) {
  fail++;
  console.log(`\n✗ unhandled error: ${e.message}`);
} finally {
  await cleanup();
  await pool.end();
}
console.log(`\n${fail === 0 ? '✓ PASS' : '✗ FAIL'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
