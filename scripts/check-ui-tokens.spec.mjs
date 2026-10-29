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
  assert.deepEqual(rules(['.meta {', '  font-weight: 600;', '  color: var(--mj-text-disabled);', '}']), ['disabled-for-content']);
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

test('undefined-token: --mj-overlay-scrim is not an MJ token, so its fallback always applies', () => {
  assert.deepEqual(rules(['  background: var(--mj-overlay-scrim, rgba(9, 17, 24, 0.55));']), ['undefined-token']);
  assert.deepEqual(rules(['  background: var(--mj-bg-overlay);']), []);
});

test('palette-primitive: a --mj-color-* step is a palette value, not a theme decision', () => {
  assert.deepEqual(rules(['  color: var(--mj-status-error, var(--mj-color-error-600));']), ['palette-primitive']);
  assert.deepEqual(rules(['  color: var(--mj-status-error-text);']), []);
});

test('focus-ring-is-a-color: the widget may not use --mjf-focus-ring as a shadow', () => {
  // A form style sets it to a colour (the shipped Contrast preset does), and a colour in a
  // box-shadow is invalid, so the focus indicator vanished. The shadow is --mjf-focus-shadow.
  assert.deepEqual(rules(['.b:focus-visible { box-shadow: var(--mjf-focus-ring); }'], WIDGET), ['focus-ring-is-a-color']);
  assert.deepEqual(rules(['  box-shadow: var(--mjf-card-shadow), var(--mjf-focus-ring);'], WIDGET), ['focus-ring-is-a-color']);
  assert.deepEqual(rules(['.b:focus-visible { box-shadow: var(--mjf-focus-shadow); }'], WIDGET), []);
  assert.deepEqual(rules(['.b:focus-visible { outline: 2px solid var(--mjf-focus-ring); }']), []);
});

test('raw-font-size: Explorer text takes its size from a type token', () => {
  assert.deepEqual(rules(['.t { font-size: 1.0625rem; }']), ['raw-font-size']);
  assert.deepEqual(rules(['.t { font-size: 12px; }']), ['raw-font-size']);
  assert.deepEqual(rules(['.t { font-size: var(--mjf-meta); }']), []);
  assert.deepEqual(rules(['.t i { font-size: 0.85em; }']), [], 'em is relative to its own text, so it scales with the token');
});

test('raw-font-size: defining a token is where the raw value belongs', () => {
  assert.deepEqual(rules(['  --mjf-meta: 0.8125rem;']), []);
});

test('raw-font-size: the widget keeps its own scale', () => {
  // Respondent inputs sit at 1rem so iOS does not zoom on focus; that is the widget's to own.
  assert.deepEqual(rules(['.i { font-size: 1rem; }'], WIDGET), []);
});

test('off-scale-spacing: gaps, padding and margins sit on the 4px grid', () => {
  assert.deepEqual(rules(['.a { gap: 10px; }']), ['off-scale-spacing']);
  assert.deepEqual(rules(['.a { padding: 6px 12px; }']), ['off-scale-spacing']);
  assert.deepEqual(rules(['.a { margin-bottom: 14px; }']), ['off-scale-spacing']);
  assert.deepEqual(rules(['.a { padding: 4px 12px 24px; gap: 8px; }']), []);
});

test('off-scale-spacing: hairlines and nudges of 1–2px are not spacing', () => {
  assert.deepEqual(rules(['.a { margin-bottom: -1px; padding: 2px 8px; }']), []);
});

test('off-scale-spacing: only spacing properties, and not in the widget', () => {
  assert.deepEqual(rules(['.a { width: 22px; border-radius: 6px; }']), []);
  assert.deepEqual(rules(['.a { gap: 6px; }'], WIDGET), []);
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
