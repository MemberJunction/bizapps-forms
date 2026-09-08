#!/usr/bin/env node
/**
 * Spec for the generated-edit hook. Two jobs, and the second is the one that matters:
 *   1. it denies every generated tree this repo has, and
 *   2. it ALLOWS what it must — a hook that denies everything would pass a deny-only suite
 *      while making the repo unusable, and a hook that fails closed on a payload it cannot
 *      parse would break tool calls it has no business judging.
 *
 * Node stdlib only, run with `node --test`, matching scripts/check-codegen-append.spec.mjs.
 * A gate on the build must not need the build.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOK = join(dirname(fileURLToPath(import.meta.url)), 'block-generated-edits.mjs');

/** Run the hook with `payload` on stdin; returns 'DENY' or 'ALLOW'. */
function verdict(payload) {
  const out = execFileSync(process.execPath, [HOOK], { input: payload, encoding: 'utf8' });
  return out.includes('"deny"') ? 'DENY' : 'ALLOW';
}

const denies = [
  ['Entities generated module', 'packages/Entities/src/generated/entities/__mj_BizAppsForms.ts'],
  ['Server graphql-schemas', 'packages/Server/src/generated/graphql-schemas/__mj_BizAppsForms.ts'],
  // Angular's output is at src/lib/generated/, not src/generated/. A pattern anchored to the
  // latter would let exactly half the #156 edit through.
  ['Angular src/lib/generated', 'packages/Angular/src/lib/generated/Entities/x/y.form.component.html'],
  ['Actions generated', 'packages/Actions/src/generated/z.ts'],
  ['absolute path into a generated tree', '/Users/x/repo/packages/Server/src/generated/generated.ts'],
  // Windows separators are normalised before matching.
  ['Windows backslash path', 'packages\\Server\\src\\generated\\generated.ts'],
  // CASE. Windows and macOS both mount case-insensitive by default, so `Packages/...` and
  // `packages/...` resolve to the SAME file. A case-sensitive pattern denies one spelling and
  // waves the other through, which is a bypass rather than an edge case.
  ['capitalised leading segment', 'Packages/Entities/src/generated/x.ts'],
  ['capitalised src segment', 'packages/Entities/SRC/generated/x.ts'],
  ['capitalised generated segment', 'packages/Entities/src/GENERATED/x.ts'],
  ['shouty path', 'PACKAGES/ENTITIES/SRC/GENERATED/X.TS'],
];

const allows = [
  ['hand-written src file', 'packages/Server/src/magic-link/token.ts'],
  ['a migration', 'migrations/V202609050300__v0.12.x__Hierarchy_Opt_In.sql'],
  ['a spec beside generated output', 'packages/Angular/src/lib/templates/form-clone-columns.spec.ts'],
  ['a doc that merely says "generated"', 'docs/generated-code-notes.md'],
  // `generated/` outside a packages/<pkg>/src/ tree is not CodeGen output.
  ['generated dir outside packages', 'scripts/generated/helper.mjs'],
];

for (const [name, path] of denies) {
  test(`denies: ${name}`, () => {
    assert.equal(verdict(JSON.stringify({ tool_input: { file_path: path } })), 'DENY', path);
  });
}

for (const [name, path] of allows) {
  test(`allows: ${name}`, () => {
    assert.equal(verdict(JSON.stringify({ tool_input: { file_path: path } })), 'ALLOW', path);
  });
}

// NotebookEdit names its target `notebook_path`. It is in the matcher, so it must be judged.
test('denies a NotebookEdit into a generated tree (notebook_path)', () => {
  const p = { tool_input: { notebook_path: 'packages/Entities/src/generated/entities/x.ipynb' } };
  assert.equal(verdict(JSON.stringify(p)), 'DENY');
});

test('allows a NotebookEdit outside a generated tree', () => {
  const p = { tool_input: { notebook_path: 'docs/analysis.ipynb' } };
  assert.equal(verdict(JSON.stringify(p)), 'ALLOW');
});

// Failing OPEN is deliberate for input the hook cannot judge: a hook must never break tool
// calls it has no opinion about. These three prove that branch still works — and, together
// with the allow-list above, that the hook is not simply denying everything.
test('fails open on malformed JSON', () => {
  assert.equal(verdict('not json at all'), 'ALLOW');
});

test('fails open on a missing path', () => {
  assert.equal(verdict(JSON.stringify({ tool_input: {} })), 'ALLOW');
});

test('fails open on empty stdin', () => {
  assert.equal(verdict(''), 'ALLOW');
});
