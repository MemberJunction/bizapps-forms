/**
 * Regression test for bizapps-forms#111 / PR #205.
 *
 * WHAT BROKE. `V202608182130__v0.11.x__Metadata_Sync_Designer_Taxonomy.sql` wrote TWO records: the
 * Designer's `TemplateContent` prompt text, and its parent `Template.Description`, which until then
 * still said the prompt was "validated against the Phase-1 question taxonomy". The v0.12
 * consolidated seed folded in the first and dropped the second, because BOTH inputs to
 * `mj sync push` were stale: the generation database was built from the chain *minus* that delta
 * (so it held the original text), and `metadata/` had never been updated when the delta corrected
 * the database. Two equal stale sides produce no diff, and a push emits nothing for a record it
 * sees no difference on. Deleting the delta then removed the only writer of the corrected text, so
 * every fresh install ended with a Template whose Description advertised the Phase-1 taxonomy while
 * the prompt body it owns enumerated the full 25-type one, `Doodle` included.
 *
 * WHY A TEST RATHER THAN A GATE. `migrations/README.md` states plainly that no repo-side check can
 * catch this class in general — coverage compares ids, cadence counts files — and that it is "a
 * discipline to hold yourself to, not a gate that will catch you". This file does not try to be
 * that gate. It pins the ONE record the class actually cost us, so the specific correction cannot
 * be silently dropped again by a future regeneration.
 *
 * WHY IT ASSERTS BOTH SIDES. Asserting only that the declared text appears in shipped SQL would
 * have passed while the bug was live: `metadata/` said "Phase-1" and `V202608081700` wrote
 * "Phase-1", so the two agreed — on the wrong value. The test therefore pins the corrected string
 * explicitly, and only then requires the two sides to agree.
 *
 * Dependency-free `node --test`, matching the other scripts/*.spec.mjs here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE_JSON = join(REPO_ROOT, 'metadata/templates/.forms-form-designer-template.json');
const MIGRATIONS_DIR = join(REPO_ROOT, 'migrations');

/** The text V202608182130 corrected the Description TO, before it was retired. */
const CORRECTED = 'validated against the full question taxonomy';
/** The text it corrected FROM. Shipping this again is the regression. */
const SUPERSEDED = 'validated against the Phase-1 question taxonomy';

const readDeclaredDescription = () => {
    const declared = JSON.parse(readFileSync(TEMPLATE_JSON, 'utf8'));
    const root = Array.isArray(declared) ? declared[0] : declared;
    return root.fields.Description;
};

const readShippedSql = () =>
    readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith('.sql'))
        .map((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf8'))
        .join('\n');

/**
 * T-SQL escapes a literal apostrophe by doubling it, so the declared Description -- which contains
 * 'Forms: Form Designer' -- is never byte-identical to its own shipped form. Compare on the
 * un-escaped text, or this test fails on the escaping rather than on the value.
 */
const unescapeSqlLiterals = (sql) => sql.replaceAll("''", "'");

test('metadata declares the Designer Template description the taxonomy rename corrected it to', () => {
    const description = readDeclaredDescription();
    assert.ok(
        description.includes(CORRECTED),
        `metadata/templates/.forms-form-designer-template.json declares a Description that does not ` +
            `carry "${CORRECTED}". The prompt body this Template owns enumerates the full 25-type ` +
            `taxonomy including Doodle, so a Description naming the Phase-1 taxonomy contradicts it.\n` +
            `  declared: ${description}`,
    );
    assert.ok(
        !description.includes(SUPERSEDED),
        `metadata/ still declares the superseded "${SUPERSEDED}" text (#97 renamed the type; ` +
            `V202608301200 installs a CHECK constraint that rejects the old spelling).`,
    );
});

test('the shipped migration chain writes that corrected description to a host', () => {
    const sql = readShippedSql();
    assert.ok(
        sql.includes(CORRECTED),
        `No file under migrations/ writes "${CORRECTED}". V202608182130 used to, and PR #205 ` +
            `retired it — so unless the consolidated seed carries the correction forward, every ` +
            `fresh install gets the superseded Description with nothing left in the chain to fix it.`,
    );
});

test('what the chain writes and what metadata declares are the same string', () => {
    const description = readDeclaredDescription();
    const sql = unescapeSqlLiterals(readShippedSql());
    assert.ok(
        sql.includes(description),
        `migrations/ does not write the exact Description metadata/ declares, so the next ` +
            `regeneration will emit a diff for a record that should already be settled.\n` +
            `  declared: ${description}`,
    );
});
