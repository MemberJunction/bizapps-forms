#!/usr/bin/env node
/**
 * Catch the two ways a regenerated migration silently undoes the one before it.
 *
 * `migrations/` is the only thing that ships, and its files are applied in version order on a
 * database nobody here has seen. Every defect this gate looks for is invisible on the box that
 * authored it, because that box already ran the statements by hand — which is exactly how both
 * of the defects that motivated this gate reached a pull request.
 *
 * The failure mode is always the same shape: CodeGen is re-run against a database in state N,
 * its output is appended to a migration that will apply at state N+1, and the difference between
 * the two states is a column somebody added an hour earlier. SQL Server does not complain — the
 * later DROP/CREATE wins, the column keeps existing, and the entity metadata keeps pointing at a
 * parameter the procedure no longer has. The first person to notice is a user whose save fails.
 *
 * Plain Node, stdlib only, matching `check-distribution-seed.mjs`: a gate that guards the
 * shipping artifact must be runnable in CI without installing anything.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The timestamp columns CodeGen adds to every entity table.
 *
 * Migrations must never hand-add these (CLAUDE.md), which means a migration that *references*
 * one is depending on a CodeGen block in some other file — and the ordering between the two is
 * the thing nobody checks.
 */
export const CODEGEN_TIMESTAMP_COLUMNS = ['__mj_CreatedAt', '__mj_UpdatedAt'];

/** Migration files in the order Flyway will apply them. */
export function readMigrations(root) {
    const dir = join(root, 'migrations');
    return readdirSync(dir)
        .filter((f) => /^V\d+__.*\.sql$/.test(f))
        .sort()
        .map((file) => ({
            file,
            version: file.slice(1, file.indexOf('__')),
            sql: readFileSync(join(dir, file), 'utf8'),
        }));
}

/**
 * Business columns a migration adds to a table, as `{ table, column }` pairs.
 *
 * Deliberately ignores `__mj_*`: those are CodeGen's, they are checked separately, and treating
 * them as business columns would demand a `@__mj_CreatedAt` parameter that no procedure has.
 */
export function findColumnsAdded(sql) {
    const found = [];
    for (const [, table, body] of sql.matchAll(
        /CREATE TABLE\s+\[\$\{flyway:defaultSchema\}\]\.\[?(\w+)\]?\s*\(([\s\S]*?)\n\s*\);/g,
    )) {
        for (const column of columnNamesFromTableBody(body)) {
            found.push({ table, column });
        }
    }
    for (const [, table, body] of sql.matchAll(
        /ALTER TABLE\s+\[\$\{flyway:defaultSchema\}\]\.\[?(\w+)\]?\s+ADD\b([\s\S]*?);/g,
    )) {
        for (const column of columnNamesFromAlterBody(body)) {
            found.push({ table, column });
        }
    }
    return found;
}

/** Column names from a CREATE TABLE body, skipping table-level constraints. */
function columnNamesFromTableBody(body) {
    const names = [];
    for (const rawLine of body.split('\n')) {
        const line = rawLine.trim();
        if (line === '' || line.startsWith('--') || /^(CONSTRAINT|PRIMARY|FOREIGN|UNIQUE|CHECK|INDEX)\b/i.test(line)) {
            continue;
        }
        const match = line.match(/^\[?(\w+)\]?\s+\w/);
        if (match && !match[1].startsWith('__mj_')) {
            names.push(match[1]);
        }
    }
    return names;
}

/** Column names from an `ALTER TABLE … ADD` body (one statement, possibly several columns). */
function columnNamesFromAlterBody(body) {
    const names = [];
    for (const rawLine of body.split('\n')) {
        const line = rawLine.trim().replace(/^,/, '').trim();
        if (line === '' || line.startsWith('--') || /^(CONSTRAINT|PRIMARY|FOREIGN|UNIQUE|CHECK|INDEX)\b/i.test(line)) {
            continue;
        }
        const match = line.match(/^\[?(\w+)\]?\s+\w/);
        if (match && !match[1].startsWith('__mj_')) {
            names.push(match[1]);
        }
    }
    return names;
}

/**
 * Every `CREATE PROCEDURE` in a migration, as `{ name, params }`.
 *
 * The parameter list is everything between the procedure name and the `AS` that opens its body.
 */
export function findProcedures(sql) {
    const procs = [];
    for (const match of sql.matchAll(
        /CREATE PROCEDURE\s+\[\$\{flyway:defaultSchema\}\]\.\[?(\w+)\]?([\s\S]*?)\nAS\b/g,
    )) {
        const [, name, paramBlock] = match;
        procs.push({ name, params: [...paramBlock.matchAll(/@(\w+)/g)].map((p) => p[1]) });
    }
    return procs;
}

/** Tables for which a migration creates the `__mj.Entity` row. */
export function findEntityRowsCreated(sql) {
    const tables = new Set();
    for (const match of sql.matchAll(/INSERT INTO\s+\[\$\{mjSchema\}\]\.\[Entity\]([\s\S]{0,4000})/g)) {
        for (const [, table] of match[1].matchAll(/'(\w+)'/g)) {
            // The BaseTable value is the only bare table name in the VALUES list; matching every
            // quoted token and intersecting with known tables downstream keeps this parser dumb.
            tables.add(table);
        }
    }
    return tables;
}

/** Tables whose `__mj.Entity` row a migration's `EntityField` inserts depend on. */
export function findEntityFieldDependencies(sql) {
    const tables = new Set();
    if (!/INSERT INTO\s+\[\$\{mjSchema\}\]\.\[EntityField\]/.test(sql)) {
        return tables;
    }
    for (const [, table] of sql.matchAll(
        /FROM\s+\[\$\{mjSchema\}\]\.\[Entity\]\s+WHERE\s+\[?BaseTable\]?\s*=\s*'(\w+)'/g,
    )) {
        tables.add(table);
    }
    return tables;
}

/**
 * The three ordering invariants, run over the migration chain in apply order.
 *
 * Returns a list of human-readable violations; empty means the chain is consistent.
 */
export function runChecks(root = REPO_ROOT) {
    const migrations = readMigrations(root);
    const violations = [];

    // Columns present on each table at each point in the chain, and where each came from.
    const columnsByTable = new Map();
    // The last migration to define each procedure, with the parameters it gave it.
    const lastProcDefinition = new Map();
    // Where each table's Entity row and CodeGen timestamp columns first appear.
    const entityRowVersion = new Map();
    const timestampVersion = new Map();

    for (const migration of migrations) {
        for (const { table, column } of findColumnsAdded(migration.sql)) {
            if (!columnsByTable.has(table)) {
                columnsByTable.set(table, new Map());
            }
            columnsByTable.get(table).set(column, migration);
        }
        for (const proc of findProcedures(migration.sql)) {
            lastProcDefinition.set(proc.name, { proc, migration, columnsThen: snapshotColumns(columnsByTable) });
        }
        for (const table of findEntityRowsCreated(migration.sql)) {
            if (!entityRowVersion.has(table)) {
                entityRowVersion.set(table, migration);
            }
        }
        for (const [, table] of migration.sql.matchAll(
            /ALTER TABLE\s+\[\$\{flyway:defaultSchema\}\]\.\[?(\w+)\]?\s+ADD\s+\[__mj_(?:Created|Updated)At\]/g,
        )) {
            if (!timestampVersion.has(table)) {
                timestampVersion.set(table, migration);
            }
        }
    }

    violations.push(...checkProcParity(lastProcDefinition));
    violations.push(...checkTimestampOrder(migrations, timestampVersion, columnsByTable));
    violations.push(...checkEntityRowOrder(migrations, entityRowVersion, columnsByTable));
    return violations;
}

/** A point-in-time copy of the column map, so a later migration cannot rewrite history. */
function snapshotColumns(columnsByTable) {
    const copy = new Map();
    for (const [table, columns] of columnsByTable) {
        copy.set(table, new Set(columns.keys()));
    }
    return copy;
}

/**
 * CHECK 1 — the last definition of `spCreateX`/`spUpdateX` must know every column X has.
 *
 * This is the SocialLinks defect: `V202608191200` added the column and regenerated the
 * procedures with it, then `V202608191300` — generated an hour earlier against a database
 * without the column — dropped and recreated the same procedures without the parameter. The
 * `EntityField` row survives, so MJ keeps composing an EXEC that passes `@SocialLinks` to a
 * procedure that has no such parameter, and every save of that entity fails.
 */
function checkProcParity(lastProcDefinition) {
    const violations = [];
    for (const [name, { proc, migration, columnsThen }] of lastProcDefinition) {
        const table = name.match(/^sp(?:Create|Update)(\w+)$/)?.[1];
        if (!table || !columnsThen.has(table)) {
            continue;
        }
        const params = new Set(proc.params);
        const missing = [...columnsThen.get(table)].filter((c) => !params.has(c));
        if (missing.length > 0) {
            violations.push(
                `${migration.file}: ${name} is the last definition of that procedure but has no parameter for ` +
                    `${missing.map((m) => `[${m}]`).join(', ')} on table ${table}. A later migration regenerated ` +
                    `this procedure from a database that predated the column, so the column ships without a way ` +
                    `to write it and every save of the entity fails with "too many arguments specified".`,
            );
        }
    }
    return violations;
}

/**
 * CHECK 2 — nothing may reference `__mj_CreatedAt`/`__mj_UpdatedAt` before they are added.
 *
 * SQL Server resolves column names against an existing table at CREATE time, so a trigger that
 * touches a column the table does not have yet is `Msg 207` and a halted migration chain — on a
 * fresh install only, which is the one place nobody tests.
 */
function checkTimestampOrder(migrations, timestampVersion, columnsByTable) {
    const violations = [];
    for (const migration of migrations) {
        for (const table of columnsByTable.keys()) {
            if (!referencesTimestampColumnOf(migration.sql, table)) {
                continue;
            }
            const adds = timestampVersion.get(table);
            if (adds && adds.version > migration.version) {
                violations.push(
                    `${migration.file}: references a CodeGen timestamp column on ${table}, but ${adds.file} is ` +
                        `what adds it — and that runs later. On a database built only from migrations/ the column ` +
                        `does not exist yet, so this fails with "Invalid column name" and halts the chain.`,
                );
            }
        }
    }
    return violations;
}

/** Whether a migration touches a CodeGen timestamp column in a statement about `table`. */
function referencesTimestampColumnOf(sql, table) {
    for (const column of CODEGEN_TIMESTAMP_COLUMNS) {
        // Brackets optional on the column: CodeGen's own trigger body writes `__mj_UpdatedAt`
        // bare, and requiring `[...]` is precisely what let the trigger-before-column defect
        // through the first draft of this gate.
        const pattern = new RegExp(
            `(?:TRIGGER|UPDATE|SET|SELECT|INSERT)[\\s\\S]{0,600}?\\[?${table}\\]?[\\s\\S]{0,600}?\\[?${column}\\]?`,
            'g',
        );
        // The ALTER that ADDs the column is the definition, not a reference to a missing one.
        const withoutAdds = sql.replace(
            new RegExp(`ALTER TABLE[^;]*?\\[${table}\\][^;]*?ADD\\s+\\[?${column}\\]?[^;]*;`, 'g'),
            '',
        );
        if (pattern.test(withoutAdds)) {
            return true;
        }
    }
    return false;
}

/**
 * CHECK 3 — an `EntityField` insert may not precede the `Entity` row it points at.
 *
 * `EntityField.EntityID` is NOT NULL, and CodeGen writes the id as a subquery against
 * `__mj.Entity`. When the entity row is created by a *later* migration the subquery yields NULL,
 * the `IF NOT EXISTS` guard passes on the NULL comparison, and the insert dies on the NOT NULL
 * constraint — again only on a fresh install.
 */
function checkEntityRowOrder(migrations, entityRowVersion, columnsByTable) {
    const violations = [];
    for (const migration of migrations) {
        for (const table of findEntityFieldDependencies(migration.sql)) {
            if (!columnsByTable.has(table)) {
                continue;
            }
            const creates = entityRowVersion.get(table);
            if (creates && creates.version > migration.version) {
                violations.push(
                    `${migration.file}: inserts an EntityField whose EntityID is looked up from __mj.Entity for ` +
                        `BaseTable '${table}', but ${creates.file} is what creates that Entity row — and it runs ` +
                        `later. On a fresh database the lookup returns NULL and the insert violates ` +
                        `EntityField.EntityID NOT NULL, aborting the install.`,
                );
            }
        }
    }
    return violations;
}

/** CLI entry point. */
function main() {
    const violations = runChecks();
    if (violations.length > 0) {
        console.error('Migration ordering gate FAILED:\n');
        for (const v of violations) {
            console.error(`  ✗ ${v}\n`);
        }
        console.error(`${violations.length} violation(s).`);
        process.exit(1);
    }
    console.log('Migration ordering gate passed.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main();
}
