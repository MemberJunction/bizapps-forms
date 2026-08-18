#!/usr/bin/env node
/**
 * Make this git worktree buildable on its own.
 *
 * `pnpm install` is a root-only operation and this repo's install lives in the MAIN checkout, so
 * a worktree has no `node_modules` anywhere and cannot typecheck, build or test. Re-installing
 * per worktree would take minutes and duplicate the store; syncing sources INTO the main checkout
 * (the previous workaround) makes the main checkout dirty and turns it into a second source of
 * truth for files that live here.
 *
 * So: mirror the main checkout's per-package `node_modules` as symlinks, with one deliberate
 * override — every `@mj-biz-apps/*` entry points at THIS worktree's packages rather than the main
 * checkout's. That override is the whole point. Without it a cross-package change typechecks
 * against the version of the contract sitting on whatever branch the main checkout happens to be
 * on, which is exactly the drift a monorepo is supposed to make impossible.
 *
 * Everything it writes is a symlink into the main checkout's store, and `node_modules` is
 * gitignored, so this is reversible by deleting the directories it creates.
 */
import { existsSync, lstatSync, mkdirSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKTREE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAIN = process.env.BIZAPPS_MAIN_CHECKOUT ?? '/Users/sohamdesai/Projects/bizapps-forms';

if (resolve(MAIN) === WORKTREE) {
  console.error('Refusing to run: this IS the main checkout. Run `pnpm install` instead.');
  process.exit(1);
}
if (!existsSync(join(MAIN, 'node_modules'))) {
  console.error(`No node_modules in ${MAIN}. Run \`pnpm install\` there first.`);
  process.exit(1);
}

/** Worktree package directory names, keyed by the npm name they publish under. */
const LOCAL_PACKAGES = new Map([
  ['forms-entities', 'Entities'],
  ['forms-actions', 'Actions'],
  ['forms-server', 'Server'],
  ['forms-ng', 'Angular'],
]);

let linked = 0;
let overridden = 0;

/** Mirror one directory of dependencies, repointing local packages at the worktree. */
function mirror(fromDir, toDir, scope = '') {
  if (!existsSync(fromDir)) {
    return;
  }
  mkdirSync(toDir, { recursive: true });
  for (const entry of readdirSync(fromDir)) {
    if (entry === '.bin' || entry === '.package-lock.json') {
      continue;
    }
    if (entry.startsWith('@') && !scope) {
      mirror(join(fromDir, entry), join(toDir, entry), entry);
      continue;
    }
    const target = join(toDir, entry);
    if (existsSync(target) || isBrokenLink(target)) {
      rmSync(target, { recursive: true, force: true });
    }
    const local = scope === '@mj-biz-apps' ? LOCAL_PACKAGES.get(entry) : undefined;
    if (local) {
      symlinkSync(join(WORKTREE, 'packages', local), target, 'dir');
      overridden++;
    } else {
      symlinkSync(join(fromDir, entry), target, 'dir');
      linked++;
    }
  }
}

/** `existsSync` is false for a dangling symlink, which still blocks a new one. */
function isBrokenLink(path) {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

mirror(join(MAIN, 'node_modules'), join(WORKTREE, 'node_modules'));
for (const dir of ['Entities', 'Actions', 'Server', 'Angular']) {
  mirror(join(MAIN, 'packages', dir, 'node_modules'), join(WORKTREE, 'packages', dir, 'node_modules'));
}
mirror(join(MAIN, 'apps', 'MJAPI', 'node_modules'), join(WORKTREE, 'apps', 'MJAPI', 'node_modules'));

console.log(`Linked ${linked} dependencies; ${overridden} @mj-biz-apps entries point at this worktree.`);
