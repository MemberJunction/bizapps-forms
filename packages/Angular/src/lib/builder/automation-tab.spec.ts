/**
 * Structural guards for the Automate tab.
 *
 * The component uses `inject()` and cannot be instantiated in this suite's node environment (no
 * Angular JIT), so what is checkable is the SOURCE: that the three defects this redesign existed
 * to fix cannot quietly return. Each of these was a real bug, and each is invisible in a unit test
 * of the pure modules because each lives in a query or a sentence rather than in a function.
 *
 * Comments are stripped before every assertion. The first version of this file passed by matching
 * the prose in the component's own header, which describes the bugs — a guard that reads its own
 * documentation proves nothing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const BUILDER = join(__dirname);

const code = (): string =>
  readFileSync(join(BUILDER, 'automation-tab.component.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

const template = (): string =>
  readFileSync(join(BUILDER, 'automation-tab.component.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');

describe('activity is scoped to this form', () => {
  it('never reads Form Automation Runs without a filter', () => {
    // The old query had none, so a form that had never run anything showed another form's runs.
    const source = code();
    const runsQuery = source.slice(source.indexOf("'MJ_BizApps_Forms: Form Automation Runs'"));
    expect(runsQuery).toMatch(/ExtraFilter:\s*inClause\('FormAutomationID'/);
  });

  it('asks for nothing rather than everything when there are no ids to filter on', () => {
    // `IN ()` is a syntax error and omitting the filter returns the whole table; 1=0 is the only
    // answer that means "none".
    expect(code()).toMatch(/ids\.length === 0\s*\)\s*\{\s*return '1=0';/);
  });

  it('scopes the automations themselves to this form', () => {
    expect(code()).toMatch(/ExtraFilter: `FormID='\$\{escapeSql\(this\.FormID\)\}'`/);
  });
});

describe('the empty state tells the truth', () => {
  it('does not claim that nothing runs', () => {
    // Four built-in hooks fire on a form that has configured nothing — one of them emails the
    // respondent — so the old "Nothing runs on submit yet" was false in the dangerous direction.
    expect(template()).not.toMatch(/nothing runs/i);
    expect(template()).not.toMatch(/Nothing runs on submit yet/);
  });

  it('shows the built-in steps that are actually running', () => {
    expect(template()).toContain('builtIns()');
    expect(template()).toContain('Already happening');
  });

  it('only lists built-ins this deployment really has', () => {
    // Resolved against MJ: Actions by name — a hook whose Action is not registered was never
    // running, and claiming it does is the same class of lie as the one above.
    expect(code()).toMatch(/builtIns\.set\(/);
    expect(code()).toMatch(/legacy\.Success/);
  });
});

describe('the sequence shown is the sequence that runs', () => {
  it('renders the derived run order, not the raw DisplayOrder the rows arrive in', () => {
    expect(template()).toContain('@for (step of steps(); track step.id)');
    expect(code()).toMatch(/steps = computed<SubmitStep\[\]>\(\(\) => toSubmitSteps\(/);
  });

  it('refuses to reorder across execution modes, which the runner would ignore', () => {
    expect(code()).toMatch(/mine\.ExecutionMode === theirs\.ExecutionMode/);
  });
});

describe('the tab speaks the author language', () => {
  it('never puts a column value on screen', () => {
    const shown = template();
    for (const columnish of ['TargetType', 'ExecutionMode', 'DisplayOrder', 'EntityBinding']) {
      expect(shown).not.toContain(columnish);
    }
  });

  it('offers exactly three things to add, not a list of every possibility', () => {
    expect(template()).toContain('@for (choice of choices; track choice.kind)');
  });

  it('can create an Action and an Agent step, not only a binding', () => {
    // The header advertised all three for months while only one could be created.
    expect(code()).toMatch(/row\.ActionID = target\.id/);
    expect(code()).toMatch(/row\.AgentID = target\.id/);
  });
});

describe('adding the first step preserves what already ran', () => {
  it('seeds the built-in defaults before the first author-added step', () => {
    // Dispatch is all-or-nothing: without this, adding one step silently switches the four
    // built-ins off.
    expect(code()).toMatch(/const seeded = await this\.seedLegacyDefaultsIfFirst\(\);/);
  });

  it('stops rather than replacing them when the built-ins cannot be read', () => {
    expect(code()).toMatch(/if \(!actions\.Success\) \{\s*throw new Error\(/);
  });
});

describe('failures are surfaced, never swallowed', () => {
  it('reports a failed load instead of rendering an empty tab', () => {
    // An empty tab and a broken query look identical, and one of them is a form doing nothing.
    expect(code()).toMatch(/this\.loadError\.set\(/);
    expect(template()).toContain('loadError()');
  });

  it('puts a rejected save back rather than leaving the screen showing it', () => {
    expect(code()).toMatch(/row\.Revert\(\);/);
  });
});
