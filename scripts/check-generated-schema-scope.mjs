#!/usr/bin/env node
/**
 * Generated-output schema-scope gate.
 *
 * MJ Forms owns exactly one database schema: `__mj_BizAppsForms`. CodeGen runs
 * against a database that also holds its dependencies' schemas
 * (`__mj_BizAppsCommon`, `__mj_BizAppsTasks`), so an unscoped run silently emits
 * entity subclasses, GraphQL resolvers, and Angular form components for those
 * sibling schemas into the Forms packages — which makes MJAPI fail to start with a
 * duplicate GraphQL type error in every real deployment (issue #10).
 *
 * The durable fix is `excludeSchemas` in mj.config.cjs — see that file for the full
 * rationale. This gate is only the tripwire that catches a regression the moment
 * someone regenerates against a database without that exclusion in place.
 *
 * WHAT COUNTS AS A VIOLATION
 * Only *declarations* of foreign-schema artifacts — an exported symbol whose name
 * carries a foreign prefix, a generated file/directory named for a foreign entity,
 * or an import reaching into one. A passing mention of a foreign entity NAME is
 * explicitly allowed: Forms has legitimate cross-schema foreign keys
 * (FormResponse.RespondentPersonID -> MJ_BizApps_Common: People), and correctly
 * scoped CodeGen output still describes those FK targets in comments and metadata.
 * Gating on mentions would flag that legitimate output; gating on declarations
 * flags only artifacts that belong to another package.
 *
 * Read-only. No --fix. Exits non-zero if any violation is found.
 * Zero dependencies beyond Node's stdlib so it runs fast in CI.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------

/** The one schema MJ Forms owns. Anything else generated here belongs elsewhere. */
const OWNED_SCHEMA = '__mj_BizAppsForms';

/**
 * Sibling schemas whose artifacts must never be generated into this repo, and the
 * package that legitimately owns each. Keep in sync with `excludeSchemas` in
 * mj.config.cjs — that config is the fix, this list is the tripwire.
 */
const FOREIGN_SCHEMAS = [
  { schema: '__mj_BizAppsCommon', classPrefix: 'mjBizAppsCommon', owner: '@mj-biz-apps/common-*' },
  { schema: '__mj_BizAppsTasks', classPrefix: 'mjBizAppsTasks', owner: '@mj-biz-apps/tasks-*' },
];

/**
 * CodeGen output directories. Every entry must exist — a missing root is a hard
 * error, not a skip. Silently tolerating one is how this gate would report PASS
 * while scanning nothing (a package rename or a typo here would disarm it).
 * If a package legitimately stops emitting generated output, delete its entry.
 */
const GENERATED_ROOTS = [
  'packages/Entities/src/generated',
  'packages/Server/src/generated',
  'packages/Actions/src/generated',
  'packages/Angular/src/lib/generated',
];

/** Extensions inspected for declarations and imports. */
const CODE_EXTS = ['.ts', '.js', '.mjs', '.html'];

// ---------------------------------------------------------------------------
// MATCHERS
// ---------------------------------------------------------------------------

/**
 * An exported declaration whose symbol name starts with a foreign class prefix.
 * Captures the declaration keyword so the report can say what was declared.
 * Matches e.g. `export class mjBizAppsTasksTaskActivity_ {`.
 */
function declarationRe(classPrefix) {
  return new RegExp(`^\\s*export\\s+(?:declare\\s+)?(?:abstract\\s+)?(class|interface|type|const|enum|function)\\s+(${classPrefix}\\w*)`);
}

/** An import/export whose module specifier reaches into a foreign-named path. */
function importPathRe(classPrefix) {
  return new RegExp(`(?:from|import)\\s*\\(?\\s*['"][^'"]*${classPrefix}[^'"]*['"]`, 'i');
}

/** Case-insensitive: generated Angular component dirs/files lowercase the prefix. */
function nameCarriesForeignPrefix(name, classPrefix) {
  return name.toLowerCase().includes(classPrefix.toLowerCase());
}

// ---------------------------------------------------------------------------
// SCANNING
// ---------------------------------------------------------------------------

function walk(dirAbs, acc) {
  let entries;
  try {
    entries = readdirSync(dirAbs);
  } catch (err) {
    throw new Error(`Cannot read generated root '${relative(REPO_ROOT, dirAbs)}': ${err.message}`, { cause: err });
  }
  for (const entry of entries) {
    const abs = join(dirAbs, entry);
    let st;
    try {
      st = statSync(abs);
    } catch (err) {
      // A path that vanished mid-walk can hide a foreign artifact, so refuse to
      // report PASS on a partial scan.
      throw new Error(`Cannot stat '${relative(REPO_ROOT, abs)}' while scanning: ${err.message}`, { cause: err });
    }
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      acc.push({ abs, isDir: true });
      walk(abs, acc);
    } else if (st.isFile()) {
      acc.push({ abs, isDir: false });
    }
  }
  return acc;
}

function hasCodeExt(abs) {
  return CODE_EXTS.some((ext) => abs.endsWith(ext));
}

/** Foreign-named files and directories — the Angular per-entity component folders. */
function runNameGate(entries) {
  const violations = [];
  for (const { abs, isDir } of entries) {
    const name = basename(abs);
    for (const { classPrefix, owner } of FOREIGN_SCHEMAS) {
      if (nameCarriesForeignPrefix(name, classPrefix)) {
        violations.push({
          file: relative(REPO_ROOT, abs),
          line: 0,
          text: `${isDir ? 'directory' : 'file'} generated for a foreign schema`,
          message: `foreign-schema artifact (owned by ${owner})`,
        });
        break; // one finding per path is enough
      }
    }
  }
  return violations;
}

/** Exported declarations and imports of foreign-schema symbols. */
function runDeclarationGate(entries) {
  const violations = [];
  const matchers = FOREIGN_SCHEMAS.map((f) => ({
    ...f,
    decl: declarationRe(f.classPrefix),
    imp: importPathRe(f.classPrefix),
  }));

  for (const { abs, isDir } of entries) {
    if (isDir || !hasCodeExt(abs)) continue;
    // A foreign-named file is already reported by the name gate; re-reporting
    // every one of its lines would bury the signal.
    if (FOREIGN_SCHEMAS.some((f) => nameCarriesForeignPrefix(basename(abs), f.classPrefix))) continue;

    const lines = readFileSync(abs, 'utf8').split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const { decl, imp, owner } of matchers) {
        const d = line.match(decl);
        if (d) {
          violations.push({
            file: relative(REPO_ROOT, abs),
            line: i + 1,
            text: line.trim().slice(0, 120),
            message: `declares foreign-schema ${d[1]} '${d[2]}' (owned by ${owner})`,
          });
          break;
        }
        if (imp.test(line)) {
          violations.push({
            file: relative(REPO_ROOT, abs),
            line: i + 1,
            text: line.trim().slice(0, 120),
            message: `imports a foreign-schema module (owned by ${owner})`,
          });
          break;
        }
      }
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

/**
 * Proves the matchers fire on known-bad input and stay silent on the legitimate
 * cross-schema FK reference. Runs without touching the tree so a green gate can
 * never be a green-because-it-matched-nothing gate.
 */
function selfTest() {
  const declGate = declarationRe('mjBizAppsTasks');
  const impGate = importPathRe('mjBizAppsCommon');

  const checks = [
    ['flags a foreign resolver class', declGate.test('export class mjBizAppsTasksTaskActivity_ {')],
    ['flags a foreign entity subclass', declGate.test('export class mjBizAppsTasksTaskEntity extends BaseEntity {')],
    ['flags a foreign component import', impGate.test("import { X } from './Entities/mjBizAppsCommonPerson/x.component';")],
    ['allows a Forms-owned class', !declGate.test('export class mjBizAppsFormsFormResponse_ {')],
    // The legitimate cross-schema FK: correctly scoped output still names the target.
    ['allows an FK comment naming a foreign entity', !declGate.test(' * RespondentPersonID -> MJ_BizApps_Common: People')],
    ['allows an FK field declaration', !declGate.test('  RespondentPersonID: string | null;')],
  ];

  const failed = checks.filter(([, pass]) => !pass);
  for (const [name, pass] of checks) console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${name}`);
  if (failed.length > 0) {
    console.error(`SELF-TEST FAILED — ${failed.length} matcher check(s) wrong.`);
    process.exit(2);
  }
  console.log('SELF-TEST PASS');
  process.exit(0);
}

function main() {
  if (process.argv.includes('--self-test')) return selfTest();

  const entries = [];
  for (const root of GENERATED_ROOTS) {
    const before = entries.length;
    walk(join(REPO_ROOT, root), entries);
    // An empty root means CodeGen output moved or a package was renamed. Passing
    // here would be a false green, so treat it as a failure of the gate itself.
    if (entries.length === before) {
      throw new Error(`Generated root '${root}' is empty — the gate would scan nothing. Update GENERATED_ROOTS.`);
    }
  }

  const violations = [...runNameGate(entries), ...runDeclarationGate(entries)];

  console.log('Generated-output schema-scope gate');
  console.log('----------------------------------');
  console.log(`Owned schema : ${OWNED_SCHEMA}`);
  console.log(`Foreign      : ${FOREIGN_SCHEMAS.map((f) => f.schema).join(', ')}`);
  console.log(`Scanned      : ${entries.length} path(s) under ${GENERATED_ROOTS.length} generated root(s)`);
  console.log('');

  if (violations.length === 0) {
    console.log('PASS — generated output is scoped to the Forms schema.');
    return;
  }

  // Group by file so a 8,000-line generated file reports once with a count,
  // rather than thousands of near-identical lines.
  const byFile = new Map();
  for (const v of violations) {
    if (!byFile.has(v.file)) byFile.set(v.file, []);
    byFile.get(v.file).push(v);
  }

  for (const [file, vs] of byFile) {
    const first = vs[0];
    console.log(`::error file=${file},line=${first.line || 1}::${first.message}`);
    console.log(`  ${file}  — ${vs.length} violation(s)`);
    for (const v of vs.slice(0, 3)) {
      console.log(`    ${v.line ? `:${v.line}  ` : ''}${v.message}`);
    }
    if (vs.length > 3) console.log(`    … and ${vs.length - 3} more`);
  }

  console.log('');
  console.log(`FAIL — ${violations.length} foreign-schema artifact(s) across ${byFile.size} path(s).`);
  console.log('Fix: add the foreign schemas to `excludeSchemas` in mj.config.cjs, then re-run CodeGen.');
  process.exit(1);
}

main();
