#!/usr/bin/env node
/**
 * Catch generated output emitted by a CodeGen whose MJ is NEWER than this repo's pin.
 *
 * `mj codegen` resolves to whatever MJ workspace is linked on the machine running it, which is not
 * necessarily the version this repo pins. When the machine is ahead, a routine regeneration quietly
 * emits templates written against APIs the pinned packages do not have.
 *
 * It fails in the one place nobody looks and passes in the one place everybody does. Locally,
 * `packages/Angular/node_modules/@memberjunction/ng-base-forms` is a symlink into the MJ checkout,
 * so `ngc` type-checks the generated templates against the linked source and is perfectly happy. CI
 * installs the pinned version from the lockfile and the Angular build dies with `TS2554`. Local
 * green is not evidence for anything MJ-API-shaped in this repo.
 *
 * EACH RULE IS SCOPED TO A PIN, AND RETIRES ITSELF (added on the 6.1.0-edge.5 upgrade).
 * The two rules below were written while this repo pinned 5.51.0, and they describe 6.x shapes as
 * violations. That was right then and is wrong now: the repo pins 6.1.0-edge.5, so those shapes are
 * what CodeGen is SUPPOSED to emit. A tripwire that outlives its calibration does not go quiet — it
 * inverts, and starts failing CI on correct output while claiming the output is broken.
 *
 * So a rule now declares `retiredAtPin`: the pin at which the shape it flags becomes legitimate.
 * The pin is read from `apps/MJAPI/package.json` rather than restated here, for the same reason
 * CLAUDE.md refuses to restate it in prose. Retired rules are reported, not silently dropped, and a
 * run with no active rules says so — "nothing wrong" and "nothing looked at" must never print the
 * same summary.
 *
 * It is a TRIPWIRE, not a type-checker: it knows only the shapes that have actually broken this
 * repo. The durable fix is to run CodeGen with the pinned MJ version; this catches the day someone
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
 * The MJ version this repo pins, read from the file an upgrade actually edits.
 *
 * Any `@memberjunction/*` exact dependency answers this — they move together by construction
 * (`bump-pins.sh`, and the caret peers float above the same floor), so the first one is the pin.
 */
export function pinnedMJVersion(repoRoot = REPO_ROOT) {
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'apps', 'MJAPI', 'package.json'), 'utf8'));
  const entry = Object.entries(pkg.dependencies ?? {}).find(([name]) => name.startsWith('@memberjunction/'));
  if (!entry) {
    throw new Error('no @memberjunction/* dependency in apps/MJAPI/package.json — cannot resolve the pin');
  }
  return entry[1];
}

/**
 * Is `version` at or above `floor`?
 *
 * Compares the numeric triple only. A prerelease suffix is deliberately ignored: MJ's edge builds
 * of X.Y.Z carry X.Y.Z's APIs, so `6.1.0-edge.5` counts as `>= 6.0.0` here even though strict
 * semver orders a prerelease below its release. This comparison decides which tripwire rules are
 * still relevant, never what gets installed.
 */
export function atOrAbove(version, floor) {
  const triple = (v) => String(v).split('-')[0].split('.').map((n) => Number.parseInt(n, 10) || 0);
  const [a, b, c] = triple(version);
  const [x, y, z] = triple(floor);
  return a !== x ? a > x : b !== y ? b > y : c >= z;
}

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
      'BaseFormComponent.NewRecordValues takes a single argument in 5.51.0; the join-field overload is 6.x only (TS2554: Expected 1 arguments, but got 2)',
    retiredAtPin: '6.0.0',
  },
  {
    id: 'ShowToolbar/true',
    // 6.x flipped this default on relationship grids. Uniformly false in 5.51.0-era output.
    pattern: /\[ShowToolbar\]="true"/g,
    expected: '[ShowToolbar]="false"',
    because: '6.x flipped the relationship-grid toolbar default; 5.51.0 output is uniformly false',
    retiredAtPin: '6.0.0',
  },
];

/** The rules that still describe a violation at `pin`, and the ones the pin has outgrown. */
export function partitionRules(pin, rules = INCOMPATIBLE_SHAPES) {
  const active = [];
  const retired = [];
  for (const rule of rules) {
    (rule.retiredAtPin && atOrAbove(pin, rule.retiredAtPin) ? retired : active).push(rule);
  }
  return { active, retired };
}

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

/** Violations across the generated tree, judged by the rules still active at `rules`. */
export function findIncompatibleShapes(root = GENERATED_ROOT, repoRoot = REPO_ROOT, rules = null) {
  const active = rules ?? partitionRules(pinnedMJVersion(repoRoot)).active;
  const violations = [];
  for (const abs of generatedFiles(root)) {
    const sql = readFileSync(abs, 'utf8');
    for (const shape of active) {
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
  const pin = pinnedMJVersion();
  const { active, retired } = partitionRules(pin);
  const violations = findIncompatibleShapes(GENERATED_ROOT, REPO_ROOT, active);

  if (violations.length > 0) {
    console.error('Generated-output API compatibility gate FAILED:\n');
    for (const v of violations) {
      console.error(`  ✗ ${v}\n`);
    }
    console.error(
      `${violations.length} violation(s) against the pinned MJ ${pin}. The generated output was\n` +
        'produced by a CodeGen newer than that pin. Re-run CodeGen against the pinned version, or\n' +
        'correct the shapes above; the Angular build will fail in CI otherwise even though it passes\n' +
        'locally.',
    );
    process.exit(1);
  }

  // Always say what was actually checked. A gate whose rules have all retired still prints a tick,
  // and a tick that does not distinguish "nothing wrong" from "nothing looked at" is how a tripwire
  // dies unnoticed — which is the failure this scoping was added to prevent.
  const retiredNote = retired.length > 0 ? ` (${retired.length} retired at this pin: ${retired.map((r) => r.id).join(', ')})` : '';
  if (active.length === 0) {
    console.log(
      `Generated-output API compatibility gate passed — but NO rules are active at the pinned MJ ${pin}${retiredNote}.\n` +
        'It is checking nothing. Add a rule the day a newer CodeGen emits a shape this pin cannot compile.',
    );
    return;
  }
  console.log(`Generated-output API compatibility gate passed — ${active.length} rule(s) active at the pinned MJ ${pin}${retiredNote}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
