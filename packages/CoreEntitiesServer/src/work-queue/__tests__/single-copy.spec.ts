/**
 * One copy of `@memberjunction/core` and `@memberjunction/global` — Forms' and the work-queue
 * packages' — or nothing registers.
 *
 * `@RegisterClass(BaseWorkHandler, 'Forms.RunAutomations')` writes into the ClassFactory of the
 * `@memberjunction/global` THIS package resolves, against the `BaseWorkHandler` class it resolves.
 * The host resolves handlers through the work-queue engine's copies. Two copies and the subscription
 * plans as `HandlerNotRegistered` while every spec of the handler itself stays green — which is why
 * this asserts the module files themselves, and the handler spec separately delivers through
 * `ResolveWorkHandler`.
 */
import { existsSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** The directory holding the package.json of the package `require` resolves `name` to, symlinks followed. */
function packageRoot(require: NodeRequire, name: string): string {
  let dir = dirname(realpathSync(require.resolve(name)));
  for (let depth = 0; depth < MAX_PACKAGE_DEPTH && !existsSync(join(dir, 'package.json')); depth++) {
    dir = dirname(dir);
  }
  if (!existsSync(join(dir, 'package.json'))) {
    throw new Error(`No package.json above the entry of ${name}.`);
  }
  return dir;
}

/** How far up from a package's entry file its package.json can be (dist/<sub>/index.js and the like). */
const MAX_PACKAGE_DEPTH = 6;

const fromForms = createRequire(import.meta.url);
/** Resolve as the work-queue packages themselves do: from their own directories. */
const fromEngine = createRequire(join(packageRoot(fromForms, '@memberjunction/work-queue-engine'), 'package.json'));
const fromCore = createRequire(join(packageRoot(fromForms, '@memberjunction/work-queue-core'), 'package.json'));

describe('the work-queue packages share Forms\' copies of MJ core', () => {
  it.each(['@memberjunction/core', '@memberjunction/global', '@memberjunction/core-entities'])('%s', (name) => {
    expect(packageRoot(fromEngine, name)).toBe(packageRoot(fromForms, name));
  });

  it('@memberjunction/work-queue-core — the Outcome and error types the handler returns', () => {
    expect(packageRoot(fromEngine, '@memberjunction/work-queue-core')).toBe(packageRoot(fromForms, '@memberjunction/work-queue-core'));
    expect(packageRoot(fromCore, '@memberjunction/global')).toBe(packageRoot(fromForms, '@memberjunction/global'));
  });
});
