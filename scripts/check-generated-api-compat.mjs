#!/usr/bin/env node
/**
 * Catch generated output emitted by a CodeGen NEWER than this repo's MJ pin.
 *
 * `mj codegen` resolves to whatever MJ workspace is linked on the machine running it — here that
 * is the MJ dev checkout, currently on a 6.x edge build — while this repo pins `@memberjunction/*`
 * to exactly 5.51.0. So a routine regeneration quietly emits templates written against APIs that
 * the pinned packages do not have.
 *
 * It fails in the one place nobody looks and passes in the one place everybody does. Locally,
 * `packages/Angular/node_modules/@memberjunction/ng-base-forms` is a symlink into the MJ
 * checkout, so `ngc` type-checks the generated templates against 6.x and is perfectly happy. CI
 * installs 5.51.0 from the lockfile and the Angular build dies with `TS2554`. Local green is not
 * evidence for anything MJ-API-shaped in this repo.
 *
 * This has now regressed twice — fixed in 1bc7aa3, back again by the next `mj codegen` run — which
 * is why it is a gate rather than a note. It is a TRIPWIRE, not a type-checker: it knows only the
 * shapes that have actually broken this repo, and cannot know about a v6 API nobody has hit yet.
 * The durable fix is to run CodeGen with the pinned MJ version; this catches the day someone
 * doesn't.
 *
 * Plain Node, stdlib only, matching the other gates: a gate on the build must not need the build.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GENERATED_ROOT = join(REPO_ROOT, 'packages', 'Angular', 'src', 'lib', 'generated');

/**
 * Shapes a newer CodeGen emits that the pinned MJ cannot compile.
 *
 * Each entry names the pinned signature it violates, so the message tells whoever hits it what
 * the correct output looks like rather than just that something is wrong.
 */
export const INCOMPATIBLE_SHAPES = [
  {
    id: 'NewRecordValues/2',
    // `NewRecordValues('Entity','JoinField')` — 5.51.0's BaseFormComponent declares one parameter.
    pattern: /NewRecordValues\('[^']*',\s*'[^']*'\)/g,
    expected: "NewRecordValues('Entity Name') — one argument",
    because:
      "BaseFormComponent.NewRecordValues takes a single argument in 5.51.0; the join-field overload is 6.x only (TS2554: Expected 1 arguments, but got 2)",
  },
  {
    id: 'ShowToolbar/true',
    // 6.x flipped this default on relationship grids. Every occurrence on `next` is false.
    pattern: /\[ShowToolbar\]="true"/g,
    expected: '[ShowToolbar]="false"',
    because: "6.x flipped the relationship-grid toolbar default; 5.51.0 output is uniformly false",
  },
];

/** Every generated file, relative to the repo root. */
export function generatedFiles(root = GENERATED_ROOT) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const abs = join(dir, entry);
      if (statSync(abs).isDirectory()) {
        walk(abs);
      } else if (/\.(html|ts)$/.test(entry)) {
        out.push(abs);
      }
    }
  };
  walk(root);
  return out;
}

/** Violations across the generated tree. */
export function findIncompatibleShapes(root = GENERATED_ROOT, repoRoot = REPO_ROOT) {
  const violations = [];
  for (const abs of generatedFiles(root)) {
    const sql = readFileSync(abs, 'utf8');
    for (const shape of INCOMPATIBLE_SHAPES) {
      const hits = sql.match(shape.pattern);
      if (hits) {
        violations.push(
          `${relative(repoRoot, abs)}: ${hits.length} use(s) of ${shape.id} — ${shape.because}. ` +
            `Expected ${shape.expected}.`,
        );
      }
    }
  }
  return violations;
}

function main() {
  const violations = findIncompatibleShapes();
  if (violations.length > 0) {
    console.error('Generated-output API compatibility gate FAILED:\n');
    for (const v of violations) {
      console.error(`  ✗ ${v}\n`);
    }
    console.error(
      `${violations.length} violation(s). The generated output was produced by a CodeGen newer than\n` +
        'this repo\'s @memberjunction/* pin. Re-run CodeGen against the pinned version, or correct the\n' +
        'shapes above; the Angular build will fail in CI otherwise even though it passes locally.',
    );
    process.exit(1);
  }
  console.log('Generated-output API compatibility gate passed.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
