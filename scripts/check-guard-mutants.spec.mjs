/**
 * The guard-mutation harness's own tests: the four verdicts, restore-on-every-path, and that every
 * manifest anchor still matches the source exactly once — which catches a drifted anchor at PR
 * time without paying for a suite run.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { runMutant, MUTANTS } from './check-guard-mutants.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function tree(source) {
  const root = mkdtempSync(join(tmpdir(), 'guard-mutants-'));
  mkdirSync(join(root, 'pkg', 'src'), { recursive: true });
  writeFileSync(join(root, 'pkg', 'src', 'a.ts'), source);
  return root;
}
const entry = { name: 'x', behaviour: 'y', file: 'pkg/src/a.ts', find: 'if (guard)', replace: 'if (true)', suite: 'pkg' };

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

test('every manifest entry names a file that exists and a find that matches exactly once', () => {
  for (const m of MUTANTS) {
    const src = readFileSync(join(REPO_ROOT, m.file), 'utf-8');
    assert.equal(src.split(m.find).length - 1, 1, `${m.name}: find must match exactly once`);
    assert.notEqual(m.find, m.replace, `${m.name}: replace must differ from find`);
  }
});
