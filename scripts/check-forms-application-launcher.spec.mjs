/**
 * Regression test for bizapps-forms#212.
 *
 * WHAT BROKE. `metadata/applications/.applications.json` declared the curated `Forms` application
 * `DefaultForNewUser: false`, so `V202608081700`'s `spCreateApplication` shipped `0` to every host.
 * `__mj.Application.DefaultForNewUser` is what decides whether an app is added to a user's
 * `__mj.UserApplication` list, and that list is what the Explorer launcher renders — so on a
 * textbook install the Forms admin UI (builder, both dashboards, seven browsable entities) was
 * reachable by nobody, and the only Forms-shaped entry an operator could find was the
 * auto-generated `__mj_BizAppsForms` schema shell. Both siblings declare `true`; Forms was the only
 * one of the three that did not.
 *
 * WHY THIS IS A LIVE REGRESSION RISK RATHER THAN A CLOSED BUG. The shared dev database this repo
 * regenerates metadata against still holds `DefaultForNewUser = 0` for Forms, so a `mj sync pull`
 * writes `false` back into the JSON without anyone typing it. Nothing else in the repo reads this
 * field: the build, the unit suites and the checked-in generated files are all identical either
 * way, which is why the defect shipped through four releases unnoticed.
 *
 * WHY IT IS PHRASED OVER EVERY DECLARED APPLICATION rather than pinned to the Forms record. The
 * class is "this repo ships a curated application that no host user can reach", and it applies to
 * the next application this repo declares just as much as to this one. A test pinned to one file
 * would go green the moment a second curated application ships as its own sibling file — which is
 * exactly how bizapps-common and bizapps-tasks each name theirs
 * (`.common-application.json`, `.tasks-application.json`) — so this reads every file
 * `metadata/applications/.mj-sync.json`'s own `"filePattern": "**\/.*.json"` matches, not one
 * hardcoded name.
 *
 * Dependency-free `node --test`, matching the other scripts/*.spec.mjs here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readMigrations } from './check-migration-order.mjs';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const APPLICATIONS_DIR = join(REPO_ROOT, 'metadata/applications');
export const MIGRATIONS_DIR = join(REPO_ROOT, 'migrations');

/** The curated Forms application, minted by this repo in V202608081700. */
export const FORMS_APP_ID = 'BFB97C57-4552-4643-8933-A0B2D76544D8';

/**
 * Every application-record file mj sync reads under `metadata/applications/`, matching
 * `.mj-sync.json`'s own `"filePattern": "**\/.*.json"` — every dotfile ending `.json`,
 * recursively, except the sync config itself.
 */
function findApplicationFiles(dir = APPLICATIONS_DIR) {
    const files = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            files.push(...findApplicationFiles(join(dir, entry.name)));
        } else if (entry.name !== '.mj-sync.json' && /^\..*\.json$/.test(entry.name)) {
            files.push(join(dir, entry.name));
        }
    }
    return files;
}

/**
 * Every application this repo declares, as `{ file, Name, DefaultForNewUser, ... }`, across every
 * file `findApplicationFiles` finds. Throws rather than returning an empty list when the directory
 * has no application file at all — an empty glob passing silently would be this same bug (a
 * declared application no test can see) in a new place.
 */
export const readDeclaredApplications = () => {
    const files = findApplicationFiles();
    if (files.length === 0) {
        throw new Error(
            `No application files found under ${APPLICATIONS_DIR} (expected files matching ` +
                `.mj-sync.json's own "**/.*.json" pattern, excluding .mj-sync.json itself).`,
        );
    }
    return files.flatMap((file) => {
        const declared = JSON.parse(readFileSync(file, 'utf8'));
        return (Array.isArray(declared) ? declared : [declared]).map((a) => ({ file, ...a.fields }));
    });
};

/** Every shipped migration, concatenated. `migrations/` is flat — there are no era subfolders. */
export const readShippedSql = () =>
    readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith('.sql'))
        .map((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf8'))
        .join('\n');

test('every application this repo declares is reachable from a host user launcher', () => {
    const applications = readDeclaredApplications();
    assert.ok(applications.length > 0, `No applications declared under ${APPLICATIONS_DIR}`);

    for (const app of applications) {
        assert.equal(
            app.DefaultForNewUser,
            true,
            `${app.file} declares the "${app.Name}" application with ` +
                `DefaultForNewUser: ${JSON.stringify(app.DefaultForNewUser)}. That flag is what puts an ` +
                `application into a new user's __mj.UserApplication list, which is the list the Explorer ` +
                `app launcher renders — so a curated application declaring anything but true ships ` +
                `unreachable by every user on the host (#212). Both sibling apps declare true.`,
        );
    }
});

/**
 * The Forms application's DefaultForNewUser writes, across the whole migration chain, in the
 * Flyway apply order `readMigrations` establishes (baseline first, then `V…` in version order —
 * the same helper `check-migration-order.mjs` uses, so this gate cannot silently disagree with
 * that one about what "shipped order" means).
 *
 * A migration can bind a variable to the Forms application's id in one of two shapes this repo
 * actually ships:
 *   - direct (this repo's own repair migrations): `DECLARE @x UNIQUEIDENTIFIER = '<id>'` followed
 *     by `UPDATE [Application] SET DefaultForNewUser = n WHERE ID = @x`.
 *   - generated seed (mj sync's own `spCreateApplication`/`spUpdateApplication` output, e.g.
 *     V202608081700:2452-2530): `SET @ID_<suffix> = '<id>'` followed by
 *     `SET @DefaultForNewUser_<suffix> = n`, passed into the stored proc call as
 *     `@DefaultForNewUser = @DefaultForNewUser_<suffix>`.
 *
 * A binding that associates the Forms id with a `DefaultForNewUser` write in neither exact shape
 * is UNRECOGNIZED, and this throws rather than skip it — a gate that silently ignores a write
 * shape it does not understand is the defect being fixed (#212 shipped invisibly through four
 * releases precisely because nothing checked this at all).
 */
function findFormsDefaultForNewUserWrites(migrations) {
    const writes = [];
    for (const { file, sql } of migrations) {
        const bindings = [
            ...[...sql.matchAll(new RegExp(`DECLARE\\s+@(\\w+)\\s+UNIQUEIDENTIFIER\\s*=\\s*'${FORMS_APP_ID}'`, 'gi'))].map(
                (m) => ({ kind: 'direct', name: m[1] }),
            ),
            ...[...sql.matchAll(new RegExp(`@ID_(\\w+)\\s*=\\s*'${FORMS_APP_ID}'`, 'gi'))].map((m) => ({
                kind: 'generated',
                name: m[1],
            })),
        ];

        for (const { kind, name } of bindings) {
            if (!isAssociatedWithDefaultForNewUser(sql, kind, name)) {
                continue; // this binding is unrelated to the flag -- e.g. an ApplicationEntity row.
            }

            const value = kind === 'direct' ? directWriteValue(sql, name) : generatedSeedWriteValue(sql, name);
            if (value === undefined) {
                throw new Error(
                    `${file} associates the Forms application (${FORMS_APP_ID}) with a DefaultForNewUser ` +
                        `write this gate does not recognize (binding "@${kind === 'direct' ? name : `ID_${name}`}"). ` +
                        `Recognized shapes: a direct "UPDATE [Application] SET DefaultForNewUser = n WHERE ID = @var" ` +
                        `or a generated seed's "@DefaultForNewUser_<suffix> = n" passed into ` +
                        `spCreateApplication/spUpdateApplication as "@DefaultForNewUser = @DefaultForNewUser_<suffix>". ` +
                        `Extend the matcher in scripts/check-forms-application-launcher.spec.mjs rather than letting ` +
                        `an unrecognized write pass unseen.`,
                );
            }
            writes.push({ file, value });
        }
    }
    // A repair migration that redeclares @FormsAppID once per GO batch (this repo's own idiom --
    // see V202609131200) binds the same name several times in one file, and the unscoped matchers
    // above resolve every one of those bindings to the same statement. Collapsing consecutive
    // same-file/same-value entries keeps the reported write order one line per actual write
    // without weakening detection: a file that genuinely writes two different values in sequence
    // still reports both.
    return writes.filter((w, i) => i === 0 || w.file !== writes[i - 1].file || w.value !== writes[i - 1].value);
}

/** Whether `sql` mentions DefaultForNewUser tied to this binding at all (loosely, before the strict parse). */
function isAssociatedWithDefaultForNewUser(sql, kind, name) {
    return kind === 'direct'
        ? new RegExp(
              `@${name}\\b[\\s\\S]{0,400}?SET\\s+DefaultForNewUser|DefaultForNewUser[\\s\\S]{0,400}?@${name}\\b`,
              'i',
          ).test(sql)
        : new RegExp(`DefaultForNewUser_${name}\\b`, 'i').test(sql);
}

/** The boolean a direct `UPDATE [Application] SET DefaultForNewUser = n WHERE ID = @varName` writes, or undefined. */
function directWriteValue(sql, varName) {
    const m = sql.match(
        new RegExp(
            `UPDATE\\s+\\[\\$\\{mjSchema\\}\\]\\.\\[Application\\][\\s\\S]{0,150}?SET\\s+DefaultForNewUser\\s*=\\s*(0|1)` +
                `[\\s\\S]{0,200}?WHERE\\s+\\[?ID\\]?\\s*=\\s*@${varName}\\b`,
            'i',
        ),
    );
    return m ? m[1] === '1' : undefined;
}

/** The boolean a generated seed's `@DefaultForNewUser_<suffix>` writes into sp{Create,Update}Application, or undefined. */
function generatedSeedWriteValue(sql, suffix) {
    const valueMatch = sql.match(new RegExp(`@DefaultForNewUser_${suffix}\\s*=\\s*(0|1)\\b`, 'i'));
    if (!valueMatch) {
        return undefined;
    }
    const applied = new RegExp(
        `EXEC\\s+\\[\\$\\{mjSchema\\}\\]\\.sp(?:Create|Update)Application[\\s\\S]{0,4000}?` +
            `@DefaultForNewUser\\s*=\\s*@DefaultForNewUser_${suffix}\\b`,
        'i',
    ).test(sql);
    return applied ? valueMatch[1] === '1' : undefined;
}

/**
 * The metadata declaration above is necessary and not sufficient, and the issue that reported this
 * proposed only the declaration.
 *
 * `Application.DefaultForNewUser` is read by three MJ paths, not two: two are new-user-only
 * (`MJServer/src/auth/newUsers.ts`, inside new-User-row creation, and the Explorer client self-heal
 * in `base-application/src/lib/application-manager.ts`, gated on `if (userApps.length === 0)`), and
 * the third -- `MJApplicationEntityServer.Save()`'s `CreateUserApplicationsForAllUsers()`, with no
 * zero-row exclusion -- fires for every existing user on any false→true flip through
 * `BaseEntity.Save()`, a path this migration's raw `UPDATE` never enters. So on a host that already
 * exists, every user who has ever opened Explorer holds a non-empty list that is never reconsidered
 * by either new-user-only path. Measured on the upgrade-path rehearsal database: setting the flag
 * alone moved nobody -- `System` (7 rows) and `Anonymous` (2 rows) both stayed without Forms.
 *
 * Shipping the flag with no backfill is therefore the mirror image of the mistake
 * bizapps-caliber's V202609021000 documents: correct for users created later, invisible forever to
 * everyone who exists now. This test refuses that half-fix.
 *
 * It is a text assertion over shipped SQL, like the designer-template spec, and it claims no more
 * than it can see: that a migration writes the flag and a migration backfills the subscription
 * table. Whether the backfill's predicate is right is settled by running it against a host-shaped
 * database, which Step 4 does.
 *
 * WHY THE FLAG ASSERTION LOOKS AT THE LAST WRITE, NOT "SOME WRITE" (the #111 class). A bare "some
 * shipped migration sets it to 1" goes green even when a LATER migration re-emits 0 — exactly what
 * happens when a future release's consolidated Metadata_Sync is generated against a database that
 * still holds 0 for Forms (the shared dev DB lags migrations for this very reason, per the module
 * docblock above) and that new seed sorts after this repair migration in the Flyway chain. The
 * metadata declaration would still say `true` and a migration would still set `1` somewhere in the
 * middle of the chain, so both the other checks here would stay green while the regression
 * re-shipped. Reading every write in apply order and asserting the FINAL one is `1` is the only
 * form of this check a consolidated-seed regeneration cannot quietly defeat.
 */
test('a shipped migration repairs hosts that already ran the v0.8 seed', () => {
    const sql = readShippedSql();

    const writes = findFormsDefaultForNewUserWrites(readMigrations(REPO_ROOT));
    assert.ok(
        writes.length > 0,
        `No shipped migration sets Application.DefaultForNewUser for the Forms application ` +
            `(${FORMS_APP_ID}). The metadata declaration alone never leaves a dev database, so ` +
            `every host that already ran V202608081700 keeps the 0 that seed wrote (#212).`,
    );

    const last = writes[writes.length - 1];
    assert.equal(
        last.value,
        true,
        `${last.file} is the LAST shipped write to the Forms application's DefaultForNewUser flag ` +
            `in Flyway apply order, and it sets it to 0. A future release's consolidated Metadata_Sync ` +
            `generated against a database that still holds 0 for Forms (the shared dev DB used to ` +
            `regenerate metadata lags migrations for exactly this reason) sorts after this repair ` +
            `migration and re-emits 0, silently re-shipping #212 even though the metadata declaration ` +
            `still says true and some earlier migration still sets 1 -- this is the #111 class. ` +
            `Full write order found: ${writes.map((w) => `${w.file}=${w.value ? 1 : 0}`).join(' -> ')}. ` +
            `Fix: this migration must set DefaultForNewUser back to 1, or must not exist.`,
    );

    assert.match(
        sql,
        new RegExp(`INSERT\\s+INTO\\s+\\[\\$\\{mjSchema\\}\\]\\.\\[UserApplication\\]`, 'i'),
        `No shipped migration backfills __mj.UserApplication. Flipping DefaultForNewUser repairs ` +
            `only users whose application list is EMPTY -- MJ's two provisioning paths are both ` +
            `new-user-only, and the Explorer self-heal is gated on userApps.length === 0. Without ` +
            `the backfill the fix is invisible to everyone who already uses the host (#212).`,
    );

    assert.ok(
        sql.includes(FORMS_APP_ID),
        `Shipped SQL does not mention the Forms application id ${FORMS_APP_ID}.`,
    );
});
