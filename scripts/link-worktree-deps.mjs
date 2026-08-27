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
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKTREE = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The main checkout, asked of git rather than configured.
 *
 * A worktree's `.git` is a pointer; `--git-common-dir` resolves to the ONE real git directory
 * every worktree shares, which lives inside the main checkout — so its parent is the answer, on
 * any machine, with no setup. This used to be a hardcoded absolute path with an env-var override,
 * which meant the script worked on exactly one laptop and failed on every other with a message
 * about a directory that had never existed there.
 *
 * The override is kept for a layout git cannot describe (a bare repo, a relocated store).
 */
function mainCheckout() {
  if (process.env.BIZAPPS_MAIN_CHECKOUT) {
    return resolve(process.env.BIZAPPS_MAIN_CHECKOUT);
  }
  try {
    const common = execFileSync('git', ['rev-parse', '--git-common-dir'], {
      cwd: WORKTREE,
      encoding: 'utf8',
    }).trim();
    return dirname(resolve(WORKTREE, common));
  } catch (err) {
    // Never guessed. A wrong main checkout would symlink this worktree's packages against some
    // other tree's store, which typechecks and is silently wrong — the exact drift this script
    // exists to prevent.
    console.error(
      `Could not locate the main checkout from ${WORKTREE}: ${err instanceof Error ? err.message : String(err)}\n` +
        'Run this from inside a git worktree, or set BIZAPPS_MAIN_CHECKOUT to the main checkout.',
    );
    process.exit(1);
  }
}

const MAIN = mainCheckout();

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
    if (entry === '.package-lock.json') {
      continue;
    }
    // `.bin` is mirrored, not skipped. Skipping it made every package RESOLVABLE but none of them
    // RUNNABLE: `pnpm run test` in a worktree died on `sh: vitest: command not found`, and
    // `pnpm run build` on `sh: ngc: command not found`, because pnpm puts a package's executables
    // only here. Turbo then reported the other packages as passing from CACHE, so the whole suite
    // looked green while nothing had actually run — which is worse than an obvious failure.
    if (entry === '.bin') {
      mirrorBin(join(fromDir, entry), join(toDir, entry));
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

/**
 * Mirror an executables directory.
 *
 * Each entry is symlinked to the MAIN checkout's `.bin` entry rather than resolved through it: the
 * originals are themselves relative symlinks into pnpm's store, and copying that relative target
 * into a worktree would point it at a path that does not exist here.
 */
function mirrorBin(fromDir, toDir) {
  if (!existsSync(fromDir)) {
    return;
  }
  mkdirSync(toDir, { recursive: true });
  for (const entry of readdirSync(fromDir)) {
    const target = join(toDir, entry);
    if (existsSync(target) || isBrokenLink(target)) {
      rmSync(target, { recursive: true, force: true });
    }
    symlinkSync(join(fromDir, entry), target, 'file');
    linked++;
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
