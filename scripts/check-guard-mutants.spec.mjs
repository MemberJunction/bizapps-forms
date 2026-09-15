/**
 * The guard-mutation harness's own tests: the four verdicts, restore-on-every-path, and that every
 * manifest anchor still matches the source exactly once — which catches a drifted anchor at PR
 * time without paying for a suite run.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { runMutant, parseSuiteSummary, killFilesFor, MUTANTS } from './check-guard-mutants.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function tree(source) {
  const root = mkdtempSync(join(tmpdir(), 'guard-mutants-'));
  mkdirSync(join(root, 'pkg', 'src'), { recursive: true });
  writeFileSync(join(root, 'pkg', 'src', 'a.ts'), source);
  return root;
}
const entry = { name: 'x', behaviour: 'y', file: 'pkg/src/a.ts', find: 'if (guard)', replace: 'if (true)', suite: 'pkg', killedBy: ['src/a.spec.ts'] };

test('a suite that fails under the mutation is KILLED, and the source is restored', () => {
  const root = tree('if (guard) { a(); }');
  const r = runMutant(entry, { repoRoot: root, run: () => ({ crashed: false, failed: 1, passed: 9 }) });
  assert.equal(r.verdict, 'KILLED');
  assert.equal(readFileSync(join(root, 'pkg/src/a.ts'), 'utf-8'), 'if (guard) { a(); }');
});

test('the suite runner is handed the mutated source, not the original', () => {
  const root = tree('if (guard) { a(); }');
  let seen = null;
  runMutant(entry, { repoRoot: root, run: () => { seen = readFileSync(join(root, 'pkg/src/a.ts'), 'utf-8'); return { crashed: false, failed: 1, passed: 1 }; } });
  assert.equal(seen, 'if (true) { a(); }');
});

test('a suite that stays green is SURVIVED', () => {
  const r = runMutant(entry, { repoRoot: tree('if (guard) { a(); }'), run: () => ({ crashed: false, failed: 0, passed: 9 }) });
  assert.equal(r.verdict, 'SURVIVED');
});

test('a find that does not match exactly once is NOT APPLIED — never silently skipped', () => {
  const never = () => { throw new Error('the suite must not run when nothing was applied'); };
  assert.equal(runMutant(entry, { repoRoot: tree('nothing here'), run: never }).verdict, 'NOT APPLIED');
  assert.equal(runMutant(entry, { repoRoot: tree('if (guard) if (guard)'), run: never }).verdict, 'NOT APPLIED');
});

test('a run with no summary is CRASHED, not KILLED', () => {
  const r = runMutant(entry, { repoRoot: tree('if (guard) { a(); }'), run: () => ({ crashed: true, detail: 'no summary' }) });
  assert.equal(r.verdict, 'CRASHED');
});

test('the source is restored even when the suite runner throws', () => {
  const root = tree('if (guard) { a(); }');
  assert.throws(() => runMutant(entry, { repoRoot: root, run: () => { throw new Error('boom'); } }));
  assert.equal(readFileSync(join(root, 'pkg/src/a.ts'), 'utf-8'), 'if (guard) { a(); }');
});

test('a mutant runs ONLY the spec files it names — never the whole package suite', () => {
  // The defect this pins: the gate used to hand `run` a directory and nothing else, so every
  // mutant paid for collecting all 78 of packages/Server's spec files to observe an edit to one
  // source file. That is 37.5s per mutant on a CI runner, 15 mutants deep, and it is why
  // `build-and-test` ran for fifteen minutes.
  const root = tree('if (guard) { a(); }');
  let seenFiles = 'never called';
  runMutant(entry, {
    repoRoot: root,
    run: (_cwd, files) => { seenFiles = files; return { crashed: false, failed: 1, passed: 1 }; },
  });
  assert.deepEqual(seenFiles, ['src/a.spec.ts']);
});

test('an entry with no killedBy is refused by name — never run against the whole suite', () => {
  // The failure mode this change introduces: someone adds a mutant and forgets the field. Falling
  // back to the full suite would be the slow-and-silent answer, and spreading an undefined into
  // the argv would be a TypeError naming neither the entry nor the field.
  const never = () => { throw new Error('the suite must not run for an entry with no killedBy'); };
  const { killedBy, ...bare } = entry;
  assert.throws(
    () => runMutant(bare, { repoRoot: tree('if (guard) { a(); }'), run: never }),
    /x: killedBy must name at least one spec file/,
  );
});

test('every manifest entry names the spec file(s) that prove its guard, and each one exists', () => {
  // A `killedBy` is not a hint — it IS the instrument. An entry without one would silently fall
  // back to the whole suite; one naming a moved spec matches no test file, which vitest reports
  // as a failed run with no summary, i.e. CRASHED. Both are caught here, at PR time, for free.
  for (const m of MUTANTS) {
    assert.ok(Array.isArray(m.killedBy) && m.killedBy.length > 0, `${m.name}: needs killedBy`);
    for (const spec of m.killedBy) {
      assert.match(spec, /\.spec\.ts$/, `${m.name}: killedBy must name spec files — got ${spec}`);
      assert.ok(existsSync(join(REPO_ROOT, m.suite, spec)), `${m.name}: no such spec ${spec}`);
    }
  }
});

test('a suite baseline runs exactly the spec files that suite\'s mutants will be judged by', () => {
  // The baseline exists so a suite that is red for an unrelated reason cannot report every mutant
  // as KILLED. Tests no mutant ever runs cannot do that, so the baseline is the union of what the
  // mutants use — the instrument, proven green, and nothing else.
  const mutants = [
    { suite: 'pkg', killedBy: ['src/b.spec.ts', 'src/a.spec.ts'] },
    { suite: 'pkg', killedBy: ['src/a.spec.ts'] },
    { suite: 'other', killedBy: ['src/z.spec.ts'] },
  ];
  assert.deepEqual(killFilesFor(mutants, 'pkg'), ['src/a.spec.ts', 'src/b.spec.ts']);
  assert.deepEqual(killFilesFor(mutants, 'other'), ['src/z.spec.ts']);
});

test('every manifest entry names a file that exists and a find that matches exactly once', () => {
  for (const m of MUTANTS) {
    const src = readFileSync(join(REPO_ROOT, m.file), 'utf-8');
    assert.equal(src.split(m.find).length - 1, 1, `${m.name}: find must match exactly once`);
    assert.notEqual(m.find, m.replace, `${m.name}: replace must differ from find`);
  }
});

test('reads a vitest summary that GitHub Actions has coloured — ANSI escapes between the words', () => {
  // CI enables colour; a local spawnSync has no TTY and never does. The first CI run of this gate
  // reported BASELINE FAILED on a green suite because the plain-text regex could not see through
  // `\x1b[2m Tests \x1b[22m\x1b[1m\x1b[32m73 passed\x1b[39m`. Loud and wrong beats silent and wrong,
  // but a gate that cannot run in CI protects nothing.
  const coloured = '\x1b[2m Tests \x1b[22m\x1b[1m\x1b[32m73 passed\x1b[39m\x1b[22m\x1b[90m (73)\x1b[39m\n';
  assert.deepEqual(parseSuiteSummary(coloured), { crashed: false, failed: 0, passed: 73 });
  const colouredFail = '\x1b[2m Tests \x1b[22m\x1b[1m\x1b[31m2 failed\x1b[39m\x1b[22m\x1b[2m | \x1b[22m\x1b[1m\x1b[32m71 passed\x1b[39m\x1b[22m\x1b[90m (73)\x1b[39m\n';
  assert.deepEqual(parseSuiteSummary(colouredFail), { crashed: false, failed: 2, passed: 71 });
});

test('reads a plain vitest summary, and calls anything without one a crash', () => {
  assert.deepEqual(parseSuiteSummary('      Tests  13 passed (13)\n'), { crashed: false, failed: 0, passed: 13 });
  assert.deepEqual(parseSuiteSummary('      Tests  1 failed | 12 passed (13)\n'), { crashed: false, failed: 1, passed: 12 });
  assert.equal(parseSuiteSummary('Error: Cannot find module').crashed, true);
});
