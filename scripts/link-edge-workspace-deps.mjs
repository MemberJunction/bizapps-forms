#!/usr/bin/env node
/**
 * Recreate the MemberJunction symlinks `forms-core-entities-server` needs in a shared MJ dev
 * workspace where those packages are built but not linked into this repo (#303 Task 7).
 *
 * The work-queue packages (`@memberjunction/work-queue-core`, `-engine`) are not in the edge
 * workspace's package list, so no install links them; the other five are peers CES gained when the
 * automation runtime moved into it from `forms-server`, and an install that has not run since then
 * has not linked them either. Each link points at the package in the MJ checkout beside this repo
 * (`../MJ`), so Forms and MJ resolve ONE copy of `@memberjunction/core` and `-global` — two copies
 * would split the class registry and leave the `Forms.RunAutomations` handler unregistered
 * (`packages/CoreEntitiesServer/src/work-queue/__tests__/single-copy.spec.ts` proves they are one).
 *
 * Gitignored and reversible: it only writes symlinks under `node_modules`, and only replaces an
 * existing SYMLINK — a real directory there (an installed package) is left alone and reported.
 *
 *   node scripts/link-edge-workspace-deps.mjs            # create or repair the links
 *   node scripts/link-edge-workspace-deps.mjs --check    # report only; exit 1 if any is missing or wrong
 */
import { existsSync, lstatSync, mkdirSync, readlinkSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MJ = resolve(process.env.MJ_CHECKOUT ?? join(REPO, '..', 'MJ'));
const LINK_DIR = join(REPO, 'packages', 'CoreEntitiesServer', 'node_modules', '@memberjunction');

/** npm name (under @memberjunction/) → package directory inside the MJ checkout. */
const LINKS = new Map([
  ['actions', 'packages/Actions/Engine'],
  ['actions-base', 'packages/Actions/Base'],
  ['ai-agents', 'packages/AI/Agents'],
  ['ai-core-plus', 'packages/AI/CorePlus'],
  ['generic-database-provider', 'packages/GenericDatabaseProvider'],
  ['work-queue-core', 'packages/WorkQueue/core'],
  ['work-queue-engine', 'packages/WorkQueue/engine'],
]);

const checkOnly = process.argv.includes('--check');
const problems = [];

if (!existsSync(join(MJ, 'packages'))) {
  console.error(`No MJ checkout at ${MJ}. Set MJ_CHECKOUT to it.`);
  process.exit(1);
}
if (!checkOnly) {
  mkdirSync(LINK_DIR, { recursive: true });
}

for (const [name, packageDir] of LINKS) {
  const target = join(MJ, packageDir);
  const link = join(LINK_DIR, name);
  const wanted = relative(LINK_DIR, target);
  if (!existsSync(join(target, 'dist', 'index.js'))) {
    problems.push(`@memberjunction/${name}: ${target} is not built (no dist/index.js); build it in the MJ checkout first.`);
    continue;
  }
  // `throwIfNoEntry: false`: nothing there is `undefined`; a dangling link is still seen (existsSync is not).
  const current = lstatSync(link, { throwIfNoEntry: false }) ?? null;
  if (current && !current.isSymbolicLink()) {
    problems.push(`@memberjunction/${name}: ${link} is a real directory (an installed package); left alone.`);
    continue;
  }
  if (current && readlinkSync(link) === wanted) {
    continue;
  }
  if (checkOnly) {
    problems.push(`@memberjunction/${name}: ${current ? `points at ${readlinkSync(link)}` : 'missing'}; wants ${wanted}.`);
    continue;
  }
  if (current) {
    rmSync(link);
  }
  symlinkSync(wanted, link);
  console.log(`linked @memberjunction/${name} -> ${wanted}`);
}

for (const problem of problems) {
  console.error(problem);
}
process.exit(problems.length > 0 ? 1 : 0);

