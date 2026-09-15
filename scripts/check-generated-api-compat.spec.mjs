#!/usr/bin/env node
/**
 * Proves the generated-output compatibility gate FIRES, and — the reason this spec exists — that it
 * STOPS firing when the pin moves past the rule that fired.
 *
 * This gate inverted in production. Its two rules flag 6.x shapes, written while the repo pinned
 * 5.51.0. The repo now pins 6.1.0-edge.5, so those shapes are exactly what CodeGen is supposed to
 * emit — and the gate, unchanged, would have failed CI on correct output while reporting that the
 * output was broken. Nobody noticed for two MJ majors because the committed output was still
 * 5.x-shaped, so the gate kept printing a green tick that meant nothing.
 *
 * So the cases below are not "does the regex match". They are: a rule fires while its pin is
 * current, the same rule is silent once the pin outgrows it, and a run with no active rules says so
 * out loud instead of printing the same tick as a run that checked something.
 *
 * Plain Node, stdlib only, matching `check-migration-order.spec.mjs`: the gate runs in CI without
 * installing anything, and its test must not reintroduce that dependency.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  INCOMPATIBLE_SHAPES,
  atOrAbove,
  findIncompatibleShapes,
  partitionRules,
  pinnedMJVersion,
} from './check-generated-api-compat.mjs';

let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log(`  ok    ${name}`);
  } else {
    failures++;
    console.error(`  FAIL  ${name}${detail ? `\n          ${detail}` : ''}`);
  }
}

/** A throwaway generated tree holding one file. */
function generatedTreeWith(contents) {
  const dir = mkdtempSync(join(tmpdir(), 'api-compat-'));
  mkdirSync(join(dir, 'Entities'), { recursive: true });
  writeFileSync(join(dir, 'Entities', 'x.form.component.html'), contents, 'utf8');
  return dir;
}

console.log('check-generated-api-compat gate\n');

// ── The rules still fire, when they apply ────────────────────────────────────────────────────────
{
  const dir = generatedTreeWith('<mj-grid [ShowToolbar]="true"></mj-grid>');
  try {
    const rules = partitionRules('5.51.0').active;
    const hits = findIncompatibleShapes(dir, dir, rules);
    check('a 6.x shape IS a violation while the repo pins 5.51.0', hits.length === 1, JSON.stringify(hits));
    check('the message names the shape and what was expected instead',
      hits[0]?.includes('ShowToolbar/true') && hits[0]?.includes('[ShowToolbar]="false"'), hits[0]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── ...and stop firing once the pin outgrows them. This is the inversion. ────────────────────────
{
  const dir = generatedTreeWith('<mj-grid [ShowToolbar]="true"></mj-grid>');
  try {
    const rules = partitionRules('6.1.0-edge.5').active;
    const hits = findIncompatibleShapes(dir, dir, rules);
    check('the SAME shape is NOT a violation once the repo pins 6.1.0-edge.5', hits.length === 0, JSON.stringify(hits));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

{
  const dir = generatedTreeWith("this.NewRecordValues('Forms', 'CategoryID');");
  try {
    check('NewRecordValues/2 fires at 5.51.0',
      findIncompatibleShapes(dir, dir, partitionRules('5.51.0').active).length === 1);
    check('NewRecordValues/2 is retired at 6.1.0-edge.5',
      findIncompatibleShapes(dir, dir, partitionRules('6.1.0-edge.5').active).length === 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── Retirement is decided by the pin, and prereleases must not read as "below" ───────────────────
check('atOrAbove ignores a prerelease suffix: 6.1.0-edge.5 >= 6.0.0', atOrAbove('6.1.0-edge.5', '6.0.0'));
check('atOrAbove is false below the floor: 5.51.0 < 6.0.0', !atOrAbove('5.51.0', '6.0.0'));
check('atOrAbove is true on an exact match: 6.0.0 >= 6.0.0', atOrAbove('6.0.0', '6.0.0'));
check('atOrAbove compares minor, not just major: 6.1.0 >= 6.0.0', atOrAbove('6.1.0', '6.0.0'));
check('atOrAbove compares patch: 6.0.1 >= 6.0.0 and 5.9.9 < 6.0.0',
  atOrAbove('6.0.1', '6.0.0') && !atOrAbove('5.9.9', '6.0.0'));

// ── Every rule must declare which pin retires it, or the next one inverts silently too ───────────
check('every rule declares retiredAtPin',
  INCOMPATIBLE_SHAPES.every((r) => typeof r.retiredAtPin === 'string' && r.retiredAtPin.length > 0),
  JSON.stringify(INCOMPATIBLE_SHAPES.filter((r) => !r.retiredAtPin).map((r) => r.id)));

// ── The pin is read from the repo, never restated in this file ───────────────────────────────────
{
  const pin = pinnedMJVersion();
  check('pinnedMJVersion reads a real version out of apps/MJAPI/package.json', /^\d+\.\d+\.\d+/.test(pin), pin);
  const { active, retired } = partitionRules(pin);
  check('partitioning the REAL pin accounts for every rule',
    active.length + retired.length === INCOMPATIBLE_SHAPES.length);
  check('at the current pin both 5.51.0-era rules are retired, not active',
    retired.length === 2 && active.length === 0,
    `active=${JSON.stringify(active.map((r) => r.id))} retired=${JSON.stringify(retired.map((r) => r.id))}`);
}

console.log(failures === 0 ? '\nPASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
