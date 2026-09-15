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
 * Two things: the fix going missing, and its symptoms coming back.
 *
 *  1. CONFIG — a foreign schema absent from `excludeSchemas` in mj.config.cjs.
 *     Checked because the artifact scan alone cannot see this: delete a schema from
 *     that list and the committed output stays clean until someone regenerates, so
 *     an artifact-only gate reports PASS right up until the bug is back.
 *
 *  2. ARTIFACTS — only *declarations* of foreign-schema artifacts: an exported symbol
 *     whose name carries a foreign prefix, a generated file/directory named for a
 *     foreign entity, or an import reaching into one. A passing mention of a foreign
 *     entity NAME is explicitly allowed: Forms has legitimate cross-schema foreign
 *     keys (FormResponse.RespondentPersonID -> MJ_BizApps_Common: People), and
 *     correctly scoped CodeGen output still describes those FK targets in comments
 *     and metadata. Gating on mentions would flag that legitimate output; gating on
 *     declarations flags only artifacts that belong to another package.
 *
 * Read-only. No --fix. Exits non-zero if any violation is found.
 * Zero dependencies beyond Node's stdlib so it runs fast in CI.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

/**
 * mj.config.cjs is CommonJS and this script is ESM, so it needs `createRequire`.
 * Requiring it pulls in no dependencies — the config is a bare object literal — which
 * keeps this gate runnable in CI without an `npm ci` step.
 */
const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------

/** The one schema MJ Forms owns. Anything else generated here belongs elsewhere. */
const OWNED_SCHEMA = '__mj_BizAppsForms';

/**
 * Sibling schemas whose artifacts must never be generated into this repo, and the
 * package that legitimately owns each.
 *
 * This is the authoritative list; `excludeSchemas` in mj.config.cjs is checked
 * AGAINST it (see `missingExclusions`) rather than hand-synced with it. Adding a
 * third Open App dependency means adding it here, and the gate will then insist
 * mj.config.cjs excludes it too.
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

/**
 * Generated artifacts that do NOT live under a `generated/` directory.
 *
 * Empty. The one entry was `apps/MJAPI/schema.graphql` — the emitted GraphQL SDL for
 * whatever resolvers the host loaded, as much CodeGen output as `generated.ts`, and
 * the artifact that shipped 392 foreign-schema references through the entire #10 fix
 * while this gate reported PASS.
 *
 * UPDATED 2026-08-18 (#49): the MJAPI harness is back and committed, so that SDL IS
 * emitted in this repo again — the previous note here said it was not, and stayed
 * behind when the harness returned. It is still not scanned, and this is a deliberate
 * choice rather than an oversight: the file is a machine-specific by-product of
 * whatever a developer's local host happened to load (it is gitignored for that
 * reason), so hashing one developer's copy would make the gate's verdict depend on
 * who ran it last. The coverage remains GONE, not relocated — resolver scoping is
 * checked only through the three package `generated/` roots above. Restoring it
 * properly means emitting the SDL deterministically in CI and pointing this list at
 * that artifact, not at the local file.
 *
 * Like GENERATED_ROOTS, a missing entry is a hard error rather than a skip — so an
 * entry added back must exist.
 */
const GENERATED_FILES = [];

/** Extensions inspected for declarations and imports. */
const CODE_EXTS = ['.ts', '.js', '.mjs', '.html'];

/** Extensions inspected with the GraphQL SDL matcher instead of the TypeScript one. */
const GRAPHQL_EXTS = ['.graphql', '.gql'];

// ---------------------------------------------------------------------------
// MATCHERS
// ---------------------------------------------------------------------------

/**
 * An exported declaration whose symbol name CONTAINS a foreign class prefix.
 *
 * Deliberately not anchored to the start of the identifier: CodeGen emits five
 * classes per entity and only two of them lead with the schema prefix
 * (`mjBizAppsTasksTask_`, `mjBizAppsTasksTaskResolver`). The other three wrap it —
 * `CreatemjBizAppsTasksTaskInput`, `UpdatemjBizAppsTasksTaskInput`,
 * `RunmjBizAppsTasksTaskViewResult` — so a start-anchored matcher would miss 60%
 * of a real regression, in a file whose own name carries no prefix for the name
 * gate to catch either.
 *
 * The prefix is distinctive enough (`mjBizAppsTasks`) that a substring match
 * cannot collide with a Forms-owned name.
 */
function declarationRe(classPrefix) {
  return new RegExp(`^\\s*export\\s+(?:declare\\s+)?(?:abstract\\s+)?(class|interface|type|const|enum|function)\\s+(\\w*${classPrefix}\\w*)`);
}

/**
 * A GraphQL SDL type definition whose name CONTAINS a foreign class prefix.
 *
 * The TypeScript matcher cannot be reused: SDL has no `export`, and CodeGen emits
 * `type mjBizAppsTasksTask_`, `input CreatemjBizAppsTasksTaskInput`, and
 * `type RunmjBizAppsTasksTaskViewResult` — so the same wrap-the-prefix problem applies
 * and the match must be a substring within the identifier, not start-anchored.
 *
 * Anchored to column 0 on purpose. Correctly scoped output still REFERENCES foreign
 * entities at field level (`RespondentPersonID: String`) and in description strings
 * ("links to a bizapps-common Person"), all of which are indented or quoted. Only a
 * top-level definition means this repo GENERATED the foreign type.
 */
function graphqlDeclarationRe(classPrefix) {
  return new RegExp(`^(type|input|enum|interface|union|scalar)\\s+(\\w*${classPrefix}\\w*)`);
}

/** An import/export whose module specifier reaches into a foreign-named path. */
function importPathRe(classPrefix) {
  return new RegExp(`(?:from|import)\\s*\\(?\\s*['"][^'"]*${classPrefix}[^'"]*['"]`, 'i');
}

/** Case-insensitive: generated Angular component dirs/files lowercase the prefix. */
function nameCarriesForeignPrefix(name, classPrefix) {
  return name.toLowerCase().includes(classPrefix.toLowerCase());
}

/**
 * Foreign schemas that `excludeSchemas` fails to cover — i.e. the fix itself going
 * missing, rather than its symptoms reappearing.
 *
 * Scanning artifacts cannot catch this: delete a schema from `excludeSchemas` and the
 * committed output stays clean until the next CodeGen run, so the gate would report
 * PASS right up until the bug is back. Checking the config closes that window, and
 * makes FOREIGN_SCHEMAS a list that is *verified* against mj.config.cjs rather than
 * hand-synced with it.
 *
 * Comparison is trimmed + lowercased to match how CodeGen itself filters
 * (`runCodeGen.js`: `configInfo.excludeSchemas.map(s => s.toLowerCase())`), so this
 * agrees with the real behaviour instead of imposing a stricter rule of its own.
 */
function missingExclusions(excludeSchemas) {
  const excluded = new Set((excludeSchemas ?? []).map((s) => String(s).trim().toLowerCase()));
  return FOREIGN_SCHEMAS.filter((f) => !excluded.has(f.schema.toLowerCase()));
}

/**
 * Whether this repo's CodeGen config can emit artifacts for a schema it does not own.
 *
 * Two mechanisms, checked according to which one the config actually uses:
 *
 * - **Allow-list** (`includeSchemas` non-empty). CodeGen resolves it into
 *   `excludeSchemas` before anything downstream runs, treating every schema NOT named
 *   as excluded — including schemas this repo has never heard of. Demanding that
 *   `excludeSchemas` also name each sibling would then be a rule about the wrong
 *   mechanism.
 * - **Deny-list** (no `includeSchemas`). Every known foreign schema must be named.
 */
function configScopeViolations({ includeSchemas, excludeSchemas }) {
  const include = (includeSchemas ?? []).map((s) => String(s).trim()).filter((s) => s.length > 0);
  if (include.length === 0) {
    return missingExclusions(excludeSchemas).map((f) => ({
      schema: f.schema,
      detail: `excludeSchemas is missing '${f.schema}'`,
      message: `'${f.schema}' (owned by ${f.owner}) is missing from excludeSchemas — the next CodeGen run will emit its artifacts here`,
    }));
  }
  const owned = OWNED_SCHEMA.trim().toLowerCase();
  return include
    .filter((s) => s.toLowerCase() !== owned)
    .map((s) => ({
      schema: s,
      detail: `includeSchemas names '${s}'`,
      message: `includeSchemas names '${s}', which this repo does not own — CodeGen will emit its artifacts here`,
    }));
}

/**
 * Reads the CodeGen scope config from mj.config.cjs. Throws rather than defaulting.
 *
 * `excludeSchemas` is required even under an allow-list: CodeGen's own zod schema
 * defaults it, and `includeSchemas` is resolved INTO it, so a config missing it
 * entirely is malformed rather than merely permissive. `includeSchemas` is optional —
 * absent means classic deny-list behaviour.
 */
function loadScopeConfig() {
  const configPath = join(REPO_ROOT, 'mj.config.cjs');
  let config;
  try {
    config = require(configPath);
  } catch (err) {
    throw new Error(`Cannot load mj.config.cjs to verify CodeGen scope: ${err.message}`, { cause: err });
  }
  if (!Array.isArray(config.excludeSchemas)) {
    // Defaulting to [] here would turn a malformed config into a silent full-scan
    // pass; the whole point of this check is that the config is load-bearing.
    throw new Error(`mj.config.cjs has no 'excludeSchemas' array — cannot verify CodeGen scope.`);
  }
  if (config.includeSchemas !== undefined && !Array.isArray(config.includeSchemas)) {
    throw new Error(`mj.config.cjs has a non-array 'includeSchemas' — cannot verify CodeGen scope.`);
  }
  return { includeSchemas: config.includeSchemas, excludeSchemas: config.excludeSchemas };
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

function hasGraphQLExt(abs) {
  return GRAPHQL_EXTS.some((ext) => abs.endsWith(ext));
}

/**
 * The fix itself going missing. Reported in the same shape as an artifact violation
 * so there is one reporting path and one failure path, not a parallel set for config.
 */
function runConfigGate(scopeViolations) {
  return scopeViolations.map((v) => ({
    file: 'mj.config.cjs',
    line: 0,
    text: v.detail,
    message: v.message,
  }));
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
    gql: graphqlDeclarationRe(f.classPrefix),
    imp: importPathRe(f.classPrefix),
  }));

  for (const { abs, isDir } of entries) {
    if (isDir) continue;
    const isGraphQL = hasGraphQLExt(abs);
    if (!isGraphQL && !hasCodeExt(abs)) continue;
    // A foreign-named file is already reported by the name gate; re-reporting
    // every one of its lines would bury the signal.
    if (FOREIGN_SCHEMAS.some((f) => nameCarriesForeignPrefix(basename(abs), f.classPrefix))) continue;

    const lines = readFileSync(abs, 'utf8').split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const m of matchers) {
        const { owner } = m;
        // SDL has no import statements, so the import matcher is meaningless there
        // and would only produce noise on description strings.
        const decl = isGraphQL ? m.gql : m.decl;
        const imp = isGraphQL ? null : m.imp;
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
        if (imp && imp.test(line)) {
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
  const gqlTasks = graphqlDeclarationRe('mjBizAppsTasks');
  const gqlCommon = graphqlDeclarationRe('mjBizAppsCommon');

  const checks = [
    ['flags a foreign resolver class', declGate.test('export class mjBizAppsTasksTaskActivity_ {')],
    ['flags a foreign entity subclass', declGate.test('export class mjBizAppsTasksTaskEntity extends BaseEntity {')],
    // CodeGen emits 5 classes per entity and only 2 of them lead with the schema
    // prefix. The other 3 wrap it in Create/Update/Run, so a matcher anchored to
    // the start of the identifier would miss 60% of a real regression.
    ['flags a foreign Create input type', declGate.test('export class CreatemjBizAppsTasksTaskActivityInput {')],
    ['flags a foreign Update input type', declGate.test('export class UpdatemjBizAppsTasksTaskActivityInput {')],
    ['flags a foreign Run view result', declGate.test('export class RunmjBizAppsTasksTaskActivityViewResult {')],
    ['flags a foreign component import', impGate.test("import { X } from './Entities/mjBizAppsCommonPerson/x.component';")],

    // The name gate is the ONLY thing that catches generated Angular components: their
    // files declare `mjBizAppsCommonPersonFormComponent`, which the declaration gate
    // deliberately skips (foreign-named files are reported once, by path). CodeGen
    // camelCases the directory but lowercases the filenames, so both sides must be
    // folded — dropping either `toLowerCase()` silently blinds the gate to every
    // generated *file* while leaving a clean tree still reporting PASS.
    ['flags a foreign component directory (camelCase)',
      nameCarriesForeignPrefix('mjBizAppsCommonPerson', 'mjBizAppsCommon')],
    ['flags a foreign component file (lowercased by CodeGen)',
      nameCarriesForeignPrefix('mjbizappscommonperson.form.component.ts', 'mjBizAppsCommon')],
    ['flags a foreign component template (lowercased by CodeGen)',
      nameCarriesForeignPrefix('mjbizappstaskstasktemplateitem.form.component.html', 'mjBizAppsTasks')],
    ['allows a Forms-owned component directory',
      !nameCarriesForeignPrefix('mjBizAppsFormsFormResponse', 'mjBizAppsCommon')],
    ['allows a Forms-owned component file',
      !nameCarriesForeignPrefix('mjbizappsformsformresponse.form.component.ts', 'mjBizAppsTasks')],
    ['allows a neutrally-named generated file',
      !nameCarriesForeignPrefix('generated-forms.module.ts', 'mjBizAppsCommon')],

    // GraphQL SDL. `apps/MJAPI/schema.graphql` carried 392 foreign references through
    // the whole #10 fix because nothing scanned it. SDL has no `export`, so the
    // TypeScript matcher above is blind to every line here.
    ['flags a foreign GraphQL type', gqlTasks.test('type mjBizAppsTasksTaskActivity_ {')],
    ['flags a foreign GraphQL input', gqlCommon.test('input CreatemjBizAppsCommonPersonInput {')],
    ['flags a foreign GraphQL update input', gqlCommon.test('input UpdatemjBizAppsCommonPersonInput {')],
    ['flags a foreign GraphQL view result', gqlTasks.test('type RunmjBizAppsTasksTaskActivityViewResult {')],
    ['flags a foreign GraphQL enum', gqlTasks.test('enum mjBizAppsTasksTaskStatus {')],
    // The TS matcher must NOT be what catches these — if it were, the dispatch in
    // runDeclarationGate would be pointless and a regression there would go unnoticed.
    ['TS matcher is blind to SDL (proves the GraphQL matcher is load-bearing)',
      !declGate.test('type mjBizAppsTasksTaskActivity_ {')],

    ['allows a Forms-owned GraphQL type', !gqlTasks.test('type mjBizAppsFormsFormResponse_ {')],
    // Correctly scoped SDL still REFERENCES foreign entities — at field level and in
    // description strings. Column-0 anchoring is the only thing separating those from
    // a real generated definition, so both must stay silent.
    ['allows an indented FK field naming a foreign entity',
      !gqlCommon.test('  RespondentPersonID: String')],
    ['allows a description string mentioning a foreign app',
      !gqlCommon.test('One submission of a form. Identified respondents link to a bizapps-common Person via RespondentPersonID.')],
    ['allows a mutation field referencing a foreign type mid-line',
      !gqlCommon.test('  CreatemjBizAppsCommonAddress(input: CreatemjBizAppsCommonAddressInput!): mjBizAppsCommonAddress_!')],
    // This one is what makes the column-0 anchor load-bearing, and it is the only
    // check that does. An SDL description block is free text, so a sentence naming a
    // foreign type after the word "input" or "type" is a legitimate line that the
    // unanchored matcher reads as a definition. Verified by mutation: drop the `^`
    // and this check — and only this check — goes red.
    ['allows a description sentence that names a foreign input type',
      !gqlCommon.test('  Use input CreatemjBizAppsCommonPersonInput to create a Person.')],

    ['allows a Forms-owned class', !declGate.test('export class mjBizAppsFormsFormResponse_ {')],
    // The legitimate cross-schema FK: correctly scoped output still names the target.
    ['allows an FK comment naming a foreign entity', !declGate.test(' * RespondentPersonID -> MJ_BizApps_Common: People')],
    ['allows an FK field declaration', !declGate.test('  RespondentPersonID: string | null;')],

    // The gate guards a config line. Scanning artifacts alone cannot see that line
    // being deleted — the tree stays clean until someone regenerates, which is the
    // exact "invisible until regen" failure this gate exists to eliminate.
    ['flags a config that stopped excluding a foreign schema',
      missingExclusions(['sys', 'staging', 'dbo', '__mj', '__mj_BizAppsCommon']).length === 1],
    ['flags a config that excludes no foreign schema at all',
      missingExclusions(['sys', '__mj']).length === FOREIGN_SCHEMAS.length],
    ['allows a config that excludes every foreign schema',
      missingExclusions(['__mj', '__mj_BizAppsCommon', '__mj_BizAppsTasks']).length === 0],

    // An `includeSchemas` allow-list scopes CodeGen positively: anything not named is
    // out of scope, including schemas this repo has never heard of. Once it is set,
    // demanding that excludeSchemas ALSO name each sibling is a rule about the wrong
    // mechanism — the siblings are already unreachable.
    ['allows an includeSchemas allow-list that names only the owned schema',
      configScopeViolations({ includeSchemas: [OWNED_SCHEMA], excludeSchemas: ['sys', '__mj'] }).length === 0],
    ['flags an includeSchemas allow-list that pulls a sibling schema back into scope',
      configScopeViolations({ includeSchemas: [OWNED_SCHEMA, '__mj_BizAppsTasks'], excludeSchemas: ['sys'] }).length === 1],
    // The reason the allow-list exists. A deny-list can only name apps we already know;
    // __mj_BizAppsCaliber is a real Open App sharing a database with Forms today and
    // appears nowhere in FOREIGN_SCHEMAS. Under the old rule this config was clean.
    ['flags an unknown app schema the deny-list could never have named',
      configScopeViolations({ includeSchemas: [OWNED_SCHEMA, '__mj_BizAppsCaliber'], excludeSchemas: [] }).length === 1
      && missingExclusions(['__mj_BizAppsCommon', '__mj_BizAppsTasks']).length === 0],
    // Regression guards: both passed the moment the allow-list branch was written, so
    // they document the contract rather than having driven it.
    ['falls back to the deny-list rule when includeSchemas is absent or blank',
      configScopeViolations({ excludeSchemas: ['sys'] }).length === FOREIGN_SCHEMAS.length
      && configScopeViolations({ includeSchemas: ['  '], excludeSchemas: ['sys'] }).length === FOREIGN_SCHEMAS.length],
    ['matches CodeGen’s case/whitespace handling for includeSchemas',
      configScopeViolations({ includeSchemas: ['  __MJ_BIZAPPSFORMS '], excludeSchemas: [] }).length === 0],
    // CodeGen trims and lowercases schema names before comparing, so the gate must too
    // — otherwise a cosmetically-reformatted config would read as a missing exclusion.
    ['matches CodeGen’s case/whitespace-insensitive comparison',
      missingExclusions([' __MJ_BIZAPPSCOMMON ', '__mj_bizappstasks']).length === 0],
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

  // Standalone generated artifacts. A missing one is a hard error for the same reason
  // an empty root is: silently skipping it is how this file went unscanned through an
  // entire release while the gate reported PASS.
  for (const rel of GENERATED_FILES) {
    const abs = join(REPO_ROOT, rel);
    let st;
    try {
      st = statSync(abs);
    } catch (err) {
      throw new Error(`Generated file '${rel}' is missing — the gate would not scan it. Update GENERATED_FILES.`, { cause: err });
    }
    if (!st.isFile()) throw new Error(`Generated file '${rel}' is not a file.`);
    entries.push({ abs, isDir: false });
  }

  const scopeConfig = loadScopeConfig();
  const scopeViolations = configScopeViolations(scopeConfig);
  const violations = [...runConfigGate(scopeViolations), ...runNameGate(entries), ...runDeclarationGate(entries)];
  const usingAllowList = (scopeConfig.includeSchemas ?? []).some((s) => String(s).trim().length > 0);

  console.log('Generated-output schema-scope gate');
  console.log('----------------------------------');
  console.log(`Owned schema : ${OWNED_SCHEMA}`);
  console.log(`Foreign      : ${FOREIGN_SCHEMAS.map((f) => f.schema).join(', ')}`);
  console.log(`Scanned      : ${entries.length} path(s) under ${GENERATED_ROOTS.length} generated root(s) + ${GENERATED_FILES.length} standalone file(s)`);
  console.log(usingAllowList
    ? `Config       : includeSchemas allow-list -> [${scopeConfig.includeSchemas.join(', ')}]`
    : `Config       : excludeSchemas deny-list -> ${FOREIGN_SCHEMAS.length - scopeViolations.length}/${FOREIGN_SCHEMAS.length} foreign schema(s) named`);
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
  console.log(`FAIL — ${violations.length} scope violation(s) across ${byFile.size} path(s).`);
  console.log('Fix: scope CodeGen in mj.config.cjs — either an `includeSchemas` allow-list naming only');
  console.log(`     '${OWNED_SCHEMA}', or an \`excludeSchemas\` deny-list naming every foreign schema — then re-run CodeGen.`);
  process.exit(1);
}

main();
