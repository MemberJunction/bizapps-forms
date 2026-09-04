#!/usr/bin/env node
/**
 * Gate: CodeGen's SQL ships inside the migration that caused it, and the standalone run file does not
 * ship at all.
 *
 * ── WHY THIS IS NOT A STYLE RULE ────────────────────────────────────────────────────────────────
 * MJ Forms is an Open App. `mj app install` writes `__mj_BizAppsForms` into the host's
 * `excludeSchemas` (MJ/packages/OpenApp/Engine/src/install/install-orchestrator.ts:1980-1983), so the
 * host's CodeGen never runs against our schema. `migrations/` is the only channel we have: if a
 * table, a base view, an spCreate/spUpdate/spDelete, an EntityField row or a column description is
 * not in a migration, it does not exist on the host. Locally everything works, because `mj codegen`
 * both LOGS and EXECUTES each statement in one call (CodeGenLib/src/Misc/sql_logging.ts:212-216) —
 * the authoring database is already current when CodeGen exits, and the run file exists solely to
 * replay that effect somewhere else.
 *
 * The specific damage, observed here on 2026-08-19: V202608182100 created FormScreen and three
 * columns and shipped no CodeGen output. `BaseEntity.Set` on a field with no EntityField row is a
 * NO-OP, so the entity never goes dirty and the save reports success having written nothing. An hour
 * went into that before anyone noticed the column and the metadata lived in different databases;
 * V202608191300 is the repair, and V202608191200/V202608191400 are the same pair a second time.
 *
 * ── THE TWO CHECKS, AND WHY THEIR SCOPES DIFFER ─────────────────────────────────────────────────
 * CHECK 1 (capture files) is WHOLE-TREE. `git ls-files migrations/codegen` is 0 today, so a
 * whole-tree check can never be permanently red, and whole-tree is the only scope that catches the
 * commit that motivated this gate: a23b598 committed 14 run files and touched no top-level
 * migration at all.
 *
 * CHECK 2 (DDL ↔ output) is DIFF-SCOPED, for the reason bizapps-caliber documents: nine merged
 * migrations predate the rule and cannot be repaired in place — history is append-only
 * (migrations/README.md, "Add a NEW seed migration; never edit an existing one") — so a whole-tree
 * version would be permanently red and would get turned off. The diff is also the only thing the
 * PR's author can act on.
 *
 * Node stdlib only, deliberately: a dependency problem must never be the reason nobody finds out.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * A migration that ships its CodeGen output is large — B202606281200 is 15k lines — and node's
 * default maxBuffer is 1 MB, so `git show` on exactly the files this gate exists to read would throw
 * ENOBUFS and be indistinguishable from "the path does not exist".
 */
const GIT_OUTPUT_LIMIT = 256 * 1024 * 1024;

/** The banner this repo already uses (V202606301305, V202608211000, V202608211600, V202608252340). */
export const BANNER_PATTERN = /--\s*CodeGen output \(appended\)/i;

/** A deliberate, stated claim that this DDL yields no CodeGen output. */
export const CODEGEN_NONE_MARKER = '@codegen-none';

/**
 * Migrations whose CodeGen output legitimately shipped in a LATER migration.
 *
 * Both were already merged — and therefore immutable — when the omission was found, so the only
 * available remedy was a new migration. Verified, never trusted: the named remedy must exist in the
 * diff's head AND actually carry output, so an entry cannot outlive its justification.
 *
 * NOT a general escape hatch. For a migration that is still editable, append the output to it.
 */
export const OUTPUT_SHIPPED_LATER = new Map([
  // Created FormScreen + FormPage.IsPartialSubmitPoint + FormQuestionOption.ImageURL/MatrixAxis
  // with no output. V202608191300's header documents the repair and the debugging it cost.
  ['V202608182100__v0.11.x__Element_Parity_And_Screens.sql',
   'V202608191300__v0.11.x__Element_Parity_Metadata_Backfill.sql'],
  // Added FormScreen.SocialLinks. Its EntityField row could not be inserted in the same file — the
  // Entity row for Form Screens is created by V202608191300, which sorts AFTER it. V202608191400
  // calls itself "the second half of V202608191200".
  ['V202608191200__v0.11.x__Ending_Screen_Social_Links.sql',
   'V202608191400__v0.11.x__Form_Screen_Social_Links_Metadata.sql'],
]);

/** Strip line and block comments so prose naming a table never trips a check. */
export function stripSqlComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
}

/**
 * This app's schema, literally (CLAUDE.md's "Database schema" line, `mj.config.cjs`).
 * `${flyway:defaultSchema}` is the placeholder every migration should use, but a DDL statement
 * written against the literal name is still real DDL against our schema -- it must not be
 * invisible to this gate just because it skipped the convention. Several pre-convention
 * migrations (B202606281200 and others) do exactly this for their original CREATE TABLEs.
 */
const APP_SCHEMA_LITERAL = '__mj_BizAppsForms';
const APP_SCHEMA = String.raw`(?:\[?\$\{flyway:defaultSchema\}\]?|\[?${APP_SCHEMA_LITERAL}\]?)`;
const DDL_PATTERNS = [
  ['CREATE TABLE', new RegExp(String.raw`\bCREATE\s+TABLE\s+${APP_SCHEMA}\s*\.\s*\[?(\w+)\]?`, 'gi')],
  ['ALTER TABLE',  new RegExp(String.raw`\bALTER\s+TABLE\s+${APP_SCHEMA}\s*\.\s*\[?(\w+)\]?`, 'gi')],
  ['DROP TABLE',   new RegExp(String.raw`\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?${APP_SCHEMA}\s*\.\s*\[?(\w+)\]?`, 'gi')],
];

/**
 * Schema changes CodeGen owns, and therefore that oblige output.
 *
 * Scoped to `${flyway:defaultSchema}` — our own schema — because CodeGen generates for our entities
 * and nothing else. A migration that only grants a core role or writes `${mjSchema}` rows
 * (V202608131600, V202608181030 and the other Automation_Runner grants) produces no Forms CodeGen
 * output and must not be nagged.
 *
 * Deliberately NOT here: CREATE INDEX and INSERTs into app tables — neither changes entity metadata.
 * Extended properties are handled separately, by `classifyMigration`.
 */
export function findAppSchemaDDL(sql) {
  const code = stripSqlComments(sql);
  const found = [];
  for (const [what, re] of DDL_PATTERNS) {
    for (const m of code.matchAll(re)) found.push(`${what} ${m[1]}`);
  }
  return found;
}

/** Does this migration touch a column description? */
export function touchesExtendedProperty(sql) {
  return /\bsp_(add|update)extendedproperty\b/i.test(stripSqlComments(sql));
}

/**
 * Does it also write `__mj.EntityField.Description` -- an actual SET of the column, not just the
 * word "Description" occurring somewhere nearby?
 *
 * The established Forms pattern (V202608302200) writes BOTH: CodeGen copies the description into the
 * generated entity class, Explorer's field UI reads the EntityField row, and a migration that
 * updates only one leaves the two surfaces publishing different sentences. Requiring an actual SET
 * (not mere proximity) matters because a WHERE clause or an unrelated column can carry the word
 * "Description" without the UPDATE ever assigning it -- `[^;]` bounds the search to the one UPDATE
 * statement so a later, unrelated SET can't be credited to this one.
 */
export function writesEntityFieldDescription(sql) {
  return /UPDATE\s+(?:\[?\$\{mjSchema\}\]?\s*\.\s*)?\[?EntityField\]?\b[^;]{0,300}?\bSET\b[^;]{0,300}?\[?Description\]?\s*=/i
    .test(stripSqlComments(sql));
}

/** The banner, on its own. Kept separate because the banner rule applies only to NEW files. */
export function hasBanner(sql) {
  return BANNER_PATTERN.test(sql);
}

/**
 * True when the banner is present but nothing substantive follows it -- a file that READS as
 * having shipped its output while shipping none. Blank lines and further comments don't count as
 * content; only code does.
 */
export function bannerHasNoContentBeneath(sql) {
  const m = sql.match(BANNER_PATTERN);
  if (!m) return false;
  const restOfBannerLine = sql.indexOf('\n', m.index + m[0].length);
  const after = restOfBannerLine === -1 ? '' : sql.slice(restOfBannerLine + 1);
  return stripSqlComments(after).trim().length === 0;
}

/**
 * Does the file carry CodeGen's SQL — under the banner, or structurally?
 *
 * Structural detection exists because history predates the banner: five merged migrations carry
 * generated CRUD without one, and they ship correct output. Hand-authored equivalents count too —
 * V202608301200 writes the `__mj.EntityFieldValue` rows CodeGen derives from a CHECK constraint by
 * hand, and documents exactly why (it had no database to regenerate from).
 *
 * A bare `UPDATE ... EntityField` does NOT count. CodeGen's actual EntityField output is an INSERT
 * (a new field row) -- an UPDATE of EntityField is a hand-patch to an existing row (a Sequence
 * tweak, a description edit) and proves nothing about whether THIS migration's DDL got its
 * metadata. Without this distinction, one unrelated EntityField UPDATE anywhere in the file excuses
 * every DDL statement in it -- the exact V202608182100 failure this gate exists to catch.
 * EntityFieldValue is different: CodeGen's value-list sync inserts new rows AND updates existing
 * ones, so both verbs count there (V202608301200 depends on the UPDATE case).
 */
export function carriesCodeGenOutput(sql) {
  if (hasBanner(sql)) return true;
  const code = stripSqlComments(sql);
  return (
    /CREATE\s+(?:OR\s+ALTER\s+)?PROCEDURE\s+\S*\[?sp(?:Create|Update|Delete)\w+/i.test(code) ||
    /CREATE\s+(?:OR\s+ALTER\s+)?VIEW\s+\S*\[?vw\w+/i.test(code) ||
    /INSERT\s+INTO\s+\S*\[?EntityField(?:Value)?\]?/i.test(code) ||
    /(?:INSERT\s+INTO|UPDATE)\s+\S*\[?EntityFieldValue\]?/i.test(code)
  );
}

/**
 * The stated reason behind `@codegen-none:`, or null when absent.
 *
 * Horizontal whitespace only around the colon — `\s*` would swallow the newline and adopt the next
 * SQL statement as the "reason", so a bare `-- @codegen-none:` would read as fully justified.
 */
export function findCodeGenNoneReason(sql) {
  const m = sql.match(new RegExp(String.raw`${CODEGEN_NONE_MARKER}[ \t]*:[ \t]*([^\n]*)`));
  return m ? m[1].trim() : null;
}

/**
 * Does this migration honour the DDL ↔ CodeGen-output contract?
 *
 * Returns violation strings (empty = clean). `isNew` is true for a file the diff ADDS: the banner is
 * required of new migrations only, because history cannot be retrofitted (migrations/README.md,
 * "Add a NEW seed migration; never edit an existing one"). Every message names the fix — a gate
 * that only says "no" costs a round trip to find out why.
 */
export function classifyMigration(relPath, sql, { isNew = false } = {}) {
  const violations = [];
  const ddl = findAppSchemaDDL(sql);
  const generated = carriesCodeGenOutput(sql);

  // A banner that claims output but ships none is worse than no banner: it reads as satisfied.
  if (hasBanner(sql) && bannerHasNoContentBeneath(sql)) {
    violations.push(
      `${relPath}: carries the "-- CodeGen output (appended)" banner, but nothing generated ` +
        `follows it -- an empty section satisfies no host. Append CodeGen's actual output below ` +
        `the banner, or remove the banner if this migration truly ships none.`
    );
    return violations;
  }

  // A description-only migration: no schema change, just text. Its obligation is the second write.
  if (!ddl.length && touchesExtendedProperty(sql) && !generated) {
    if (!writesEntityFieldDescription(sql)) {
      violations.push(
        `${relPath}: changes a column description via sp_addextendedproperty but never writes ` +
          `__mj.EntityField.Description. CodeGen copies the description into the generated entity ` +
          `class and Explorer reads the EntityField row, so the two surfaces will publish different ` +
          `sentences. Write both — see V202608302200 for the shape.`
      );
    }
    return violations;
  }

  if (ddl.length && !generated) {
    const reason = findCodeGenNoneReason(sql);
    if (reason === null) {
      violations.push(
        `${relPath}: changes schema CodeGen owns (${[...new Set(ddl)].join(', ')}) but ships no ` +
          `CodeGen output. The host runs only migrations and never CodeGen for __mj_BizAppsForms, so ` +
          `it gets the column and not the API — no EntityField row, a stale base view, stale CRUD. ` +
          `Run \`npm run mj:migrate && npx mj codegen --skipfiles\`, then append ` +
          `migrations/codegen/CodeGen_Run_*.sql below a "-- CodeGen output (appended)" banner and ` +
          `DELETE the run file. If this DDL genuinely produces none, say so and why: ` +
          `\`-- ${CODEGEN_NONE_MARKER}: <reason>\`.`
      );
    } else if (reason === '') {
      violations.push(
        `${relPath}: ${CODEGEN_NONE_MARKER} carries no reason. The marker exists to make the claim ` +
          `reviewable — state what about this DDL yields no CodeGen output.`
      );
    } else if (ddl.some((d) => d.startsWith('CREATE TABLE'))) {
      violations.push(
        `${relPath}: ${CODEGEN_NONE_MARKER} on a migration that CREATEs a table is always false — a ` +
          `new table always produces at least the __mj.Entity registration and its EntityField rows. ` +
          `Append the output instead.`
      );
    } else {
      // One `@codegen-none` must not excuse every DDL statement in the file — only the tables it
      // actually names. Otherwise a second, genuinely-unexcused ALTER inherits an old reason it
      // never earned.
      const ddlTables = [...new Set(ddl.map((d) => d.split(' ').pop()))];
      const unnamed = ddlTables.filter((t) => !new RegExp(`\\b${t}\\b`).test(reason));
      if (unnamed.length) {
        violations.push(
          `${relPath}: ${CODEGEN_NONE_MARKER} does not name ${unnamed.join(', ')}, so it does not ` +
            `excuse ${unnamed.length > 1 ? 'those tables' : 'that table'} — name every table this ` +
            `migration's DDL touches in the reason, or a later ALTER on the same file silently ` +
            `inherits an excuse it never earned.`
        );
      }
    }
  }

  // This branch depends on `isNew` for more than its own correctness: several merged migrations
  // legitimately ship CodeGen output with no banner (some predate the banner convention and are
  // caught only by carriesCodeGenOutput's structural detection; V202608191300/V202608191400 are
  // OUTPUT_SHIPPED_LATER remedies written before the banner existed; V202608301200 hand-writes
  // EntityFieldValue rows with no banner). History here is append-only (migrations/README.md,
  // "Add a NEW seed migration; never edit an existing one"), so none of them can be retrofitted --
  // `isNew` is what keeps this rule from re-flagging them.
  // That only holds while the caller's BASE sits at or after those commits: true for a PR's
  // merge-base and for a push range, since both start somewhere already on the branch, but NOT
  // true for an arbitrary wide range (e.g. "everything since the banner convention began"), which
  // would relight all of them as if newly added. Whoever changes what base/head this script is
  // invoked with must preserve that invariant, or this fires on merged history it cannot fix.
  if (isNew && generated && !hasBanner(sql)) {
    violations.push(
      `${relPath}: ships CodeGen output with no "-- CodeGen output (appended)" banner. In a file this ` +
        `long the hand-DDL/generated boundary has to be unmissable, or a reviewer reads generated ` +
        `plumbing as reviewable schema. Put the banner above the appended block, under ~50 blank lines.`
    );
  }

  return violations;
}

// ── CHECK 1: no capture file is tracked, anywhere ───────────────────────────────────────────────

/**
 * Every tracked path matching `CodeGen_Run_*.sql`.
 *
 * `git ls-files`, not the filesystem, and that is load-bearing: 14 untracked run files sit in
 * `migrations/codegen/` on a developer machine right now. A pure-fs check would fail every local run
 * and teach people that this gate is noise.
 */
export function trackedCaptureFiles(cwd) {
  return execFileSync('git', ['ls-files', '--', '*CodeGen_Run_*.sql'], {
    cwd, encoding: 'utf8', maxBuffer: GIT_OUTPUT_LIMIT,
  }).split('\n').filter(Boolean);
}

// ── CHECK 2: a changed migration ships its output ───────────────────────────────────────────────

function diffPaths(baseSha, headSha, cwd, filter) {
  const args = ['diff', '--name-only'];
  if (filter) args.push(`--diff-filter=${filter}`);
  args.push(baseSha, headSha, '--', 'migrations/');
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: GIT_OUTPUT_LIMIT })
    .split('\n').filter(Boolean);
}

/** Top-level `migrations/*.sql` added or modified between two commits. */
export function changedMigrations(baseSha, headSha, cwd) {
  return diffPaths(baseSha, headSha, cwd, 'AM').filter((p) => /^migrations\/[^/]+\.sql$/.test(p));
}

/** Of those, the ones the diff ADDS — the only files the banner rule applies to. */
export function addedMigrations(baseSha, headSha, cwd) {
  return diffPaths(baseSha, headSha, cwd, 'A').filter((p) => /^migrations\/[^/]+\.sql$/.test(p));
}

/** File contents at `sha`, or null when the path does not exist there. */
export function readAt(sha, relPath, cwd) {
  try {
    return execFileSync('git', ['show', `${sha}:${relPath}`], {
      cwd, encoding: 'utf8', maxBuffer: GIT_OUTPUT_LIMIT,
    });
  } catch {
    return null;
  }
}

function main() {
  const [, , baseSha, headSha] = process.argv;
  const cwd = process.cwd();
  const violations = [];

  // CHECK 1 — always, with or without a diff.
  const captures = trackedCaptureFiles(cwd);
  for (const f of captures) {
    violations.push(
      `${f}: a standalone CodeGen capture is tracked. Nothing applies it — skyway globs **/*.sql, ` +
        `fails to parse a name that is not V…__/B…__/R__, and swallows the error into a warning, so ` +
        `this reads as "the output shipped" while shipping nothing. Append it below a ` +
        `"-- CodeGen output (appended)" banner in the migration that caused it, then delete it.`
    );
  }

  // CHECK 2 — only when given a range.
  if (baseSha && headSha) {
    let changed, added;
    try {
      changed = changedMigrations(baseSha, headSha, cwd);
      added = new Set(addedMigrations(baseSha, headSha, cwd));
    } catch (error) {
      // Named as itself. The unfetched-base case must never be mistaken for a clean run.
      console.error(
        `::error::Could not diff ${baseSha}..${headSha} from ${cwd}: ${error.message.trim()}\n` +
          `This check ran nothing. Confirm the base commit is fetched (\`fetch-depth: 0\`) and that ` +
          `both refs exist.`
      );
      process.exit(1);
    }

    for (const relPath of changed) {
      const sql = readAt(headSha, relPath, cwd);
      if (sql === null) {
        violations.push(`${relPath}: listed as added/modified but unreadable at ${headSha}.`);
        continue;
      }
      const findings = classifyMigration(relPath, sql, { isNew: added.has(relPath) });
      if (findings.length === 0) continue;

      // A merged migration's output may have shipped in a later one — verified, never assumed.
      const remedy = OUTPUT_SHIPPED_LATER.get(path.basename(relPath));
      if (remedy) {
        const remedySql = readAt(headSha, `migrations/${remedy}`, cwd);
        if (remedySql === null) {
          violations.push(
            `${relPath}: recorded as remedied by ${remedy}, but that migration does not exist at ` +
              `${headSha}. The columns are unregistered on every host either way.`
          );
        } else if (!carriesCodeGenOutput(remedySql)) {
          violations.push(
            `${relPath}: recorded as remedied by ${remedy}, but that migration carries no CodeGen ` +
              `output. The exemption no longer holds.`
          );
        } else {
          console.log(
            `::notice file=migrations/${remedy}::${path.basename(relPath)} ships no output of its ` +
              `own — it was already merged when that was found; its registration ships here.`
          );
        }
        continue;
      }
      violations.push(...findings);
    }

    if (violations.length === 0) {
      console.log(`::notice::${changed.length} changed migration(s) ship their CodeGen output.`);
    }
  } else if (violations.length === 0) {
    console.log('::notice::No CodeGen capture files are tracked.');
  }

  if (violations.length > 0) {
    console.error('::error::CodeGen output convention violated:');
    for (const v of violations) console.error(`  - ${v}`);
    console.error('See .claude/rules/migrations-codegen.md and migrations/README.md.');
    process.exit(1);
  }
}

// Only run as a CLI when executed directly, so the spec can import the pure parts.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
