#!/usr/bin/env node
/**
 * Gate: build a database from ONLY what this repo ships, run CodeGen against it, and fail if CodeGen
 * wants to change anything.
 *
 * ── THE QUESTION NOTHING ELSE ASKS ──────────────────────────────────────────────────────────────
 * Every other check here reads the REPOSITORY. check-distribution-seed.mjs reads literals in SQL
 * text; check-codegen-append.mjs reads a diff — and its CHECK 2 is diff-scoped on purpose, because
 * nine merged migrations predate the rule and a whole-tree version would be permanently red. That
 * scoping has a consequence nobody could act on: the moment a migration merges without its CodeGen
 * output there is no diff left to scope to, so the omission becomes invisible forever.
 *
 * Two shipped that way. #201 (`V202609091600` added FormResponse.FormDistributionID with no
 * EntityField row — every Form Response save failed on a host, silently, because BaseEntity.Set on a
 * field with no EntityField row is a no-op) and #219 (a Signature→Doodle rename that skipped the
 * EntityFieldValue.Sequence rewrite). Both carried a "RUN mj:codegen AFTER APPLYING THIS" banner,
 * which is the one instruction a host cannot follow: `mj app install` puts __mj_BizAppsForms in the
 * host's excludeSchemas, so the host's CodeGen never runs against our schema. `migrations/` is the
 * only channel we have. Neither defect was found by CI; an unrelated MJ upgrade found them.
 *
 * So this check reads the ARTEFACT instead of the repository: it builds what a host builds and looks
 * at it. See issue #220.
 *
 * ── THE VERDICT IS A FILE, NOT AN EXIT CODE ─────────────────────────────────────────────────────
 * `mj codegen` exits 0 and reports {"success":true} whether or not the database it just looked at was
 * complete — measured on both a converged and an unconverged database. Its only signal is the capture
 * it writes into mj.config.cjs's SQLOutput.folderPath: the SQL a host would have to run. A converged
 * database produces NO capture file at all, so the verdict is binary rather than a judgement call.
 * We compare the folder before and after, so a capture a developer already had staged is neither
 * destroyed nor mistaken for our answer.
 *
 * ── WHY THIS SCRIPT HOLDS NO DATABASE CONNECTION ────────────────────────────────────────────────
 * It takes an EXISTING, EMPTY database and never creates or drops one. `.env` on a dev machine points
 * at the shared database MJ's host serves; a check that could DROP DATABASE is one bug away from
 * taking it. Emptiness is verified rather than trusted, from `mj migrate`'s own first stdout line —
 * the same signal the root CLAUDE.md teaches — and a run against the database named in .env is
 * refused outright.
 *
 * Node stdlib only, like every other gate here: a dependency problem must never be the reason nobody
 * finds out.
 */
import { createRequire } from 'node:module';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The `mj migrate -t` tag a host sitting at our declared floor would be on. */
export function coreMigrationTag(mjVersionRange) {
  const lowerBound = /(?:^|\s)>=\s*(\d+)\.(\d+)\.(\d+)/.exec(mjVersionRange ?? '');
  if (!lowerBound) {
    throw new Error(
      `mj-app.json's mjVersionRange ${JSON.stringify(mjVersionRange)} has no '>=X.Y.Z' lower bound, ` +
        'so the core migration tag cannot be derived. Pass --core-tag vX.Y.Z to say it explicitly.',
    );
  }
  const [, major, minor, patch] = lowerBound;
  return `v${major}.${minor}.${patch}`;
}

/**
 * What `mj migrate` said about the database it started on. stdout only — the spinner is on stderr.
 *
 * Fails CLOSED: output we cannot read reports `fresh: false`, because reading "the database was
 * empty" out of silence is the one mistake that would make this whole check meaningless.
 */
export function readMigrateStart(stdout) {
  const text = stdout ?? '';
  if (text.includes('No prior migration history detected')) {
    return { fresh: true, installedVersion: null };
  }
  const watermark = /Detected installed migration version:\s*(\S+)/.exec(text);
  return { fresh: false, installedVersion: watermark ? watermark[1] : null };
}

/** How many trailing lines of a CLI's stdout may be searched for its result document. */
const RESULT_SEARCH_LINES = 20;

/** The machine-readable result the CLI prints as the last line of stdout, or null. */
export function readCliResult(stdout) {
  const lines = (stdout ?? '').split('\n').map((line) => line.trim()).filter(Boolean);
  const floor = Math.max(0, lines.length - RESULT_SEARCH_LINES);
  for (let i = lines.length - 1; i >= floor; i--) {
    if (!lines[i].startsWith('{')) continue;
    try {
      return JSON.parse(lines[i]);
    } catch {
      // Not the result document — a progress line can begin with a brace. Keep looking; if no line
      // parses, the caller gets null and treats that as a failure, so nothing is swallowed.
    }
  }
  return null;
}

/** Capture files that appeared during the run — never the ones that were already there. */
export function newCaptureFiles({ before, after }) {
  const alreadyThere = new Set(before);
  return after.filter((name) => !alreadyThere.has(name)).sort();
}

/**
 * What a capture file is asking a host to run, condensed. Metadata writes first — those are the
 * defect class this gate exists for — then the object DDL that came with them.
 */
export function summarizeCapture(sql) {
  const counts = new Map();
  const bump = (label) => counts.set(label, (counts.get(label) ?? 0) + 1);

  const metadataWrite = /\b(INSERT INTO|UPDATE|DELETE FROM)\s+\[?\$\{mjSchema\}\]?\.\[?(\w+)\]?/gi;
  for (const [, verb, table] of (sql ?? '').matchAll(metadataWrite)) {
    bump(`${verb.toUpperCase()} \${mjSchema}.${table}`);
  }
  const objectDdl = /\b(CREATE|DROP|ALTER)\s+(VIEW|PROCEDURE|TRIGGER|INDEX|TABLE|FUNCTION)\b/gi;
  for (const [, verb, kind] of (sql ?? '').matchAll(objectDdl)) {
    bump(`${verb.toUpperCase()} ${kind.toUpperCase()}`);
  }
  return [...counts]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** The database this checkout works against — the one a clean-room run must never be. */
export function workingDatabaseName({ envFileText, processEnv }) {
  if (processEnv?.DB_DATABASE) return processEnv.DB_DATABASE;
  const assignment = /^[ \t]*DB_DATABASE[ \t]*=[ \t]*(['"]?)([^'"\n#]+?)\1[ \t]*$/m.exec(envFileText ?? '');
  return assignment ? assignment[2] : null;
}
