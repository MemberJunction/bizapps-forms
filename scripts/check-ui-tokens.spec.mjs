/**
 * The token rules of the UI gate (`npm run lint:ui`).
 *
 * Both rules come from the 2026-10-28 UI audit, where each one was a measured WCAG failure:
 *  - `on-primary`: MJ's dark theme keeps `--mj-brand-on-primary` at #fff on a lighter #4095d2,
 *    which is 3.25:1. Explorer surfaces read `--mjf-on-primary` instead, which Forms controls.
 *    The widget is exempt: it defines its own `--mj-brand-on-primary` for its own palette.
 *  - `disabled-for-content`: `--mj-text-disabled` is #445766 on #1a2b38 in dark (1.93:1). It is
 *    for disabled controls and placeholders only; anything else needs a written reason.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tokenRuleViolations } from './check-ui-tokens.mjs';

const EXPLORER = 'packages/Angular/src/lib/shared/x.ts';
const WIDGET = 'packages/Angular/src/lib/widget/mj-form.component.css';

const rules = (lines, path = EXPLORER) => tokenRuleViolations(lines, path).map((v) => v.rule);

test('on-primary: Explorer CSS may not read --mj-brand-on-primary', () => {
  assert.deepEqual(rules(['  color: var(--mj-brand-on-primary);']), ['on-primary']);
});

test('on-primary: a fallback chain that starts with it is still a read of it', () => {
  assert.deepEqual(rules(['.b { color: var(--mj-brand-on-primary, var(--mj-text-inverse)); }']), ['on-primary']);
});

test('on-primary: the widget may, because it defines the token for its own palette', () => {
  assert.deepEqual(rules(['  --mjf-on-accent: var(--mj-brand-on-primary);'], WIDGET), []);
});

test('disabled-for-content: readable text may not use --mj-text-disabled', () => {
  assert.deepEqual(rules(['.x { color: var(--mj-text-disabled); }']), ['disabled-for-content']);
});

for (const selector of ['.x:disabled', '.x[disabled]', '.x[aria-disabled="true"]', '.x::placeholder', '.x.is-disabled']) {
  test(`disabled-for-content: allowed on ${selector}`, () => {
    assert.deepEqual(rules([`${selector} { color: var(--mj-text-disabled); }`]), []);
  });
}

test('disabled-for-content: the selector of a multi-line rule is read from the line that opened it', () => {
  assert.deepEqual(rules(['.x:disabled,', '.y:disabled {', '  color: var(--mj-text-disabled);', '}']), []);
  assert.deepEqual(rules(['.meta {', '  font-size: 12px;', '  color: var(--mj-text-disabled);', '}']), ['disabled-for-content']);
});

test('disabled-for-content: a marker with a reason on the line before allows it', () => {
  assert.deepEqual(
    rules(['/* ui-gate: allow-disabled-token — decorative separator */', '.dot { color: var(--mj-text-disabled); }']),
    [],
  );
});

test('disabled-for-content: a marker without a reason does not', () => {
  assert.deepEqual(
    rules(['/* ui-gate: allow-disabled-token */', '.dot { color: var(--mj-text-disabled); }']),
    ['disabled-for-content'],
  );
});

test('a mention inside a comment is prose, not a use', () => {
  assert.deepEqual(rules(['/* never use var(--mj-brand-on-primary) here */']), []);
});

test('violations carry the 1-based line number', () => {
  const [v] = tokenRuleViolations(['', '.x { color: var(--mj-text-disabled); }'], EXPLORER);
  assert.equal(v.line, 2);
});

test('importing the gate does not run it, and --self-test still passes', () => {
  const script = fileURLToPath(new URL('./check-ui-tokens.mjs', import.meta.url));
  const run = spawnSync(process.execPath, [script, '--self-test'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stdout + run.stderr);
});
