#!/usr/bin/env node
/**
 * Proves the distribution gate FIRES. A gate nobody has seen fail is indistinguishable from a
 * gate that returns "pass" unconditionally — and this one guards a defect class whose whole
 * character is that everything looks fine from inside.
 *
 * Plain Node rather than Vitest on purpose: the gate is stdlib-only so it can run in CI without
 * `npm ci`, and its test should not reintroduce the dependency it was designed to avoid.
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { runChecks, buildManifest } from './check-distribution-seed.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
function check(name, condition, detail) {
    if (condition) {
        console.log(`  ✓ ${name}`);
    } else {
        console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
        failures++;
    }
}

/** A minimal repo-shaped fixture: real metadata, plus whatever migrations the case needs. */
function fixture(build) {
    const root = mkdtempSync(join(tmpdir(), 'dist-gate-'));
    cpSync(join(REPO_ROOT, 'metadata'), join(root, 'metadata'), {
        recursive: true,
        filter: (src) => !src.includes(`${'metadata'}/sql_logging`),
    });
    mkdirSync(join(root, 'migrations'), { recursive: true });
    build(root);
    return root;
}

function withFixture(build, assert) {
    const root = fixture(build);
    try {
        assert(runChecks(root), root);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
}

console.log('distribution gate:');

// 1. The state MJ Forms was actually in: metadata present, no seed migration anywhere.
withFixture(
    () => {},
    (violations) => {
        check(
            'flags metadata that ships nowhere (no Metadata_Sync migration)',
            violations.some((v) => v.includes('ships') && v.includes('NOWHERE')),
            JSON.stringify(violations),
        );
    },
);

// 2. A seed exists but nothing records what it was generated from.
withFixture(
    (root) => writeFileSync(join(root, 'migrations', 'V1__Metadata_Sync.sql'), '-- seed\n'),
    (violations) => {
        check(
            'flags a seed migration with no manifest to date it',
            violations.some((v) => v.includes('metadata-seed.manifest.json')),
            JSON.stringify(violations),
        );
    },
);

// 3. The common case this exists for: someone edits metadata and does not regenerate the seed.
withFixture(
    (root) => {
        writeFileSync(join(root, 'migrations', 'V1__Metadata_Sync.sql'), '-- seed\n');
        writeFileSync(
            join(root, 'migrations', 'metadata-seed.manifest.json'),
            JSON.stringify(buildManifest(root), null, 2),
        );
        // Edit a record AFTER the manifest was written — exactly the drift being guarded against.
        const rolesPath = join(root, 'metadata', 'roles', '.roles.json');
        const roles = JSON.parse(readFileSync(rolesPath, 'utf-8'));
        roles[0].fields.Description = 'edited after the seed was generated';
        writeFileSync(rolesPath, JSON.stringify(roles, null, 2));
    },
    (violations) => {
        check(
            'flags metadata edited after the seed was generated',
            violations.some((v) => v.includes('.roles.json') && v.includes('changed since')),
            JSON.stringify(violations),
        );
    },
);

// 4. A `sync` block rewritten by a push is bookkeeping, not content — it must NOT fire, or the
//    gate cries wolf on the very push that regenerated the seed.
withFixture(
    (root) => {
        writeFileSync(join(root, 'migrations', 'V1__Metadata_Sync.sql'), '-- seed\n');
        writeFileSync(
            join(root, 'migrations', 'metadata-seed.manifest.json'),
            JSON.stringify(buildManifest(root), null, 2),
        );
        const rolesPath = join(root, 'metadata', 'roles', '.roles.json');
        const roles = JSON.parse(readFileSync(rolesPath, 'utf-8'));
        roles[0].sync = { lastModified: '2099-01-01T00:00:00.000Z', checksum: 'deadbeef' };
        writeFileSync(rolesPath, JSON.stringify(roles, null, 2));
    },
    (violations) => {
        check(
            'ignores a rewritten sync block (bookkeeping, not content)',
            !violations.some((v) => v.includes('.roles.json')),
            JSON.stringify(violations),
        );
    },
);

// 5. The placeholder leak, in the form it actually shipped in.
withFixture(
    (root) => {
        writeFileSync(join(root, 'migrations', 'V1__Metadata_Sync.sql'), '-- seed\n');
        writeFileSync(
            join(root, 'migrations', 'metadata-seed.manifest.json'),
            JSON.stringify(buildManifest(root), null, 2),
        );
        writeFileSync(
            join(root, 'migrations', 'V2__Leak.sql'),
            "EXEC [${mjSchema}].[spUpdateExistingEntitiesFromSchema] @ExcludedSchemaNames='sys,${commonSchema}';\n",
        );
    },
    (violations) => {
        check(
            'flags a placeholder the install engine cannot resolve',
            violations.some((v) => v.includes('commonSchema')),
            JSON.stringify(violations),
        );
    },
);

// 6. Teardown scripts get a stricter map — only ${mjSchema} is substituted there.
withFixture(
    (root) => {
        writeFileSync(join(root, 'migrations', 'V1__Metadata_Sync.sql'), '-- seed\n');
        writeFileSync(
            join(root, 'migrations', 'metadata-seed.manifest.json'),
            JSON.stringify(buildManifest(root), null, 2),
        );
        mkdirSync(join(root, 'migrations-teardown'), { recursive: true });
        writeFileSync(
            join(root, 'migrations-teardown', 'V001__Teardown.sql'),
            'DELETE FROM [${flyway:defaultSchema}].[Thing];\n',
        );
    },
    (violations) => {
        check(
            'flags the app-schema placeholder in a teardown script, where MJ does not substitute it',
            violations.some((v) => v.includes('migrations-teardown') && v.includes('flyway:defaultSchema')),
            JSON.stringify(violations),
        );
    },
);

// 7. The real repository must pass, or the gate is not describing this codebase.
check('the repository itself passes', runChecks(REPO_ROOT).length === 0, JSON.stringify(runChecks(REPO_ROOT)));

if (failures > 0) {
    console.error(`\n${failures} gate self-test(s) failed.`);
    process.exit(1);
}
console.log('\nAll distribution-gate self-tests passed.');
