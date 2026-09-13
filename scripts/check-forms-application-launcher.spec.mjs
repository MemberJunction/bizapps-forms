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
 * the next application this repo declares just as much as to this one. A test pinned to one id
 * would go green on the second.
 *
 * Dependency-free `node --test`, matching the other scripts/*.spec.mjs here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const APPLICATIONS_JSON = join(REPO_ROOT, 'metadata/applications/.applications.json');
export const MIGRATIONS_DIR = join(REPO_ROOT, 'migrations');

/** The curated Forms application, minted by this repo in V202608081700. */
export const FORMS_APP_ID = 'BFB97C57-4552-4643-8933-A0B2D76544D8';

/** Every application this repo declares, as `{ Name, DefaultForNewUser }`. */
export const readDeclaredApplications = () => {
    const declared = JSON.parse(readFileSync(APPLICATIONS_JSON, 'utf8'));
    return (Array.isArray(declared) ? declared : [declared]).map((a) => a.fields);
};

/** Every shipped migration, concatenated. `migrations/` is flat — there are no era subfolders. */
export const readShippedSql = () =>
    readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith('.sql'))
        .map((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf8'))
        .join('\n');

test('every application this repo declares is reachable from a host user launcher', () => {
    const applications = readDeclaredApplications();
    assert.ok(applications.length > 0, `${APPLICATIONS_JSON} declares no applications`);

    for (const app of applications) {
        assert.equal(
            app.DefaultForNewUser,
            true,
            `metadata/applications/.applications.json declares the "${app.Name}" application with ` +
                `DefaultForNewUser: ${JSON.stringify(app.DefaultForNewUser)}. That flag is what puts an ` +
                `application into a new user's __mj.UserApplication list, which is the list the Explorer ` +
                `app launcher renders — so a curated application declaring anything but true ships ` +
                `unreachable by every user on the host (#212). Both sibling apps declare true.`,
        );
    }
});
