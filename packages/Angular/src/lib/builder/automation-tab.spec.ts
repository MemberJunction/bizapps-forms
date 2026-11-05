/**
 * The Automate tab: its reads and template checked in the source, its WRITES executed.
 *
 * Every write the tab makes is a Remote Operation since #303 (`Forms.SaveAutomation`,
 * `Forms.ReorderAutomations`, `Forms.RemoveAutomation`), and the rules that used to be read out of
 * this component's source — seed the built-ins on a form's first step, mark the form as owning its
 * step list, a reorder as one change — run on the server and are pinned there
 * (`FormAutomationEngine.edit.spec.ts`). What is left to pin HERE is that the tab asks for the right
 * operation with the right input, shows the server's refusal, and reloads; the component
 * constructs in this node environment, so that is executed rather than read.
 *
 * The source guards below are about what the tab READS and RENDERS, which did not move. Comments
 * are stripped before every assertion — a guard that reads its own documentation proves nothing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import '@angular/compiler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunViewParams } from '@memberjunction/core';
import { installFakeOperations, refused, succeeded, type FakeOperations } from '../shared/testing/fake-operations';

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
    // The escaper is matched as `\w+` rather than by name. What this guard is about is the FILTER —
    // that the query is bounded by this component's own FormID — and pinning the helper's spelling
    // made an unrelated rename (the sixteen-copies consolidation, #67) fail a test about form
    // scoping. That the value is escaped at all is still required; which function does it is not
    // this file's business, and `sql-literal.spec.ts` owns the escaping rule itself.
    expect(code()).toMatch(/ExtraFilter: `FormID='\$\{\w+\(this\.FormID\)\}'`/);
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
});

describe('failures are surfaced, never swallowed', () => {
  it('reports a failed load instead of rendering an empty tab', () => {
    // An empty tab and a broken query look identical, and one of them is a form doing nothing.
    expect(code()).toMatch(/this\.loadError\.set\(/);
    expect(template()).toContain('loadError()');
  });

  it('never returns a form to the legacy list', () => {
    // There is no inverse anywhere, by design: once an author configures their own steps, removing
    // all of them means "run nothing".
    expect(code()).not.toMatch(/onSubmitMode\s*[:=]\s*'Legacy'/);
  });
});

// --- the writes, executed ----------------------------------------------------------------------

/** Automation rows the mocked RunView answers with (the tab reads them as plain rows). */
let automationRows: Record<string, unknown>[] = [];
/** Run rows the mocked RunView answers with. */
let runRows: Record<string, unknown>[] = [];
let refuseHistory = false;

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  class RunView {
    public async RunView(params: RunViewParams) {
      if (params.EntityName === 'MJ_BizApps_Forms: Form Automation Runs') {
        const filter = typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '';
        const ids = [...filter.matchAll(/'([^']+)'/g)].map((match) => match[1]);
        return {
          Success: !refuseHistory,
          Results: refuseHistory ? [] : runRows.filter((row) => ids.includes(String(row['FormAutomationID']))).slice(0, params.MaxRows),
          ErrorMessage: refuseHistory ? 'History unavailable' : '',
        };
      }
      const rows =
        params.EntityName === 'MJ_BizApps_Forms: Form Automations'
          ? automationRows
          : params.EntityName === 'MJ_BizApps_Forms: Form Automation Runs'
            ? runRows
            : [];
      return { Success: true, Results: rows, ErrorMessage: '' };
    }
    public async RunViews(params: RunViewParams[]) {
      return Promise.all(params.map((p) => this.RunView(p)));
    }
  }
  return { ...actual, RunView, LogError: () => undefined };
});

const { AutomationTabComponent } = await import('./automation-tab.component');

function step(id: string, order: number, mode: 'Sync' | 'Async' = 'Sync', extra: Record<string, unknown> = {}) {
  return {
    ID: id,
    FormID: 'form-1',
    Name: `Step ${id}`,
    TargetType: 'Action',
    ActionID: `action-${id}`,
    AgentID: null,
    BindingID: null,
    Trigger: 'OnComplete',
    ExecutionMode: mode,
    DisplayOrder: order,
    ContinueOnError: true,
    IsActive: true,
    ConditionalRule: null,
    ...extra,
  };
}

/** The tab's protected surface the specs drive, named once. */
interface TabInternals {
  FormID: string;
  reload(): Promise<void>;
  steps(): { id: string }[];
  canMove(id: string, delta: number): boolean;
  move(id: string, delta: number): Promise<void>;
  remove(id: string): Promise<void>;
  toggleActive(id: string): Promise<void>;
  toggleSequential(id: string): Promise<void>;
  saveTarget(target: { id: string; name: string }): Promise<void>;
  saveBinding(): Promise<void>;
  adding: { set(stage: 'choose' | 'record' | 'action' | 'agent' | null): void; (): string | null };
  chosenEntity: { set(choice: { name: string; label: string; schema: string } | null): void };
  mappings: { set(rows: { targetField: string; questionId: string; rule: string }[]): void };
  selectedId(): string;
  actionError(): string;
  runsFor(id: string): { id: string }[];
  seededNote(): string;
  md: { EntityByName(name: string): { ID: string; Name: string; DisplayNameOrName: string } | undefined };
}

let operations: FakeOperations | null = null;

async function tabWith(rows: Record<string, unknown>[]): Promise<TabInternals> {
  automationRows = rows;
  const tab = new AutomationTabComponent() as unknown as TabInternals;
  tab.FormID = 'form-1';
  await tab.reload();
  return tab;
}

beforeEach(() => {
  automationRows = [];
  runRows = [];
  refuseHistory = false;
});

afterEach(() => {
  operations?.restore();
  operations = null;
});

const saved = (id: string, seeded: string[] = []) =>
  succeeded({ FormAutomationID: id, FormEntityBindingID: null, DisplayOrder: 5, SeededAutomationIDs: seeded });

describe('recent activity', () => {
  it('shows a quiet step latest run even when another step fills the global history window', async () => {
    runRows = [
      ...Array.from({ length: 10 }, (_, index) => ({ ID: `busy-${index}`, FormAutomationID: 'busy', Status: 'Succeeded', StartedAt: null, ErrorMessage: null, OutputSummary: null })),
      { ID: 'quiet-1', FormAutomationID: 'quiet', Status: 'Succeeded', StartedAt: null, ErrorMessage: null, OutputSummary: null },
    ];
    const tab = await tabWith([step('busy', 1), step('quiet', 2)]);
    expect(tab.runsFor('quiet').map((run) => run.id)).toEqual(['quiet-1']);
    expect(tab.runsFor('busy')).toHaveLength(5);
  });

  it('preserves a refused write reason when the subsequent history read also fails', async () => {
    const tab = await tabWith([step('a', 1)]);
    operations = installFakeOperations(() => refused('The change was refused.'));
    refuseHistory = true;
    await tab.toggleActive('a');
    expect(tab.actionError()).toContain('The change was refused.');
  });

  it('shows what a run said in words — no JSON envelope, no record id (click-through observation 2)', async () => {
    runRows = [
      { ID: 'run-1', FormAutomationID: 'a1', Status: 'Succeeded', StartedAt: null, ErrorMessage: null, OutputSummary: '{"summary":"Created 7F367F15-B60D-49FF-A85F-3F62B5F2AE42"}' },
    ];
    const tab = await tabWith([step('a1', 1)]);

    expect((tab as unknown as { runs(): { message: string }[] }).runs().map((r) => r.message)).toEqual(['Created']);
  });
});

describe('adding a step', () => {
  it('creates an Action step through Forms.SaveAutomation, leaving order and defaults to the server', async () => {
    const tab = await tabWith([]);
    operations = installFakeOperations(() => saved('new-1'));
    tab.adding.set('action');

    await tab.saveTarget({ id: 'action-9', name: 'Send a thank-you' });

    expect(operations.calls).toEqual([
      {
        key: 'Forms.SaveAutomation',
        input: { FormID: 'form-1', Automation: { Name: 'Send a thank-you', TargetType: 'Action', ActionID: 'action-9' } },
      },
    ]);
    expect(tab.selectedId()).toBe('new-1');
    expect(tab.adding()).toBeNull();
  });

  it('creates an Agent step the same way — the tab can add all three kinds it advertises', async () => {
    const tab = await tabWith([]);
    operations = installFakeOperations(() => saved('new-2'));
    tab.adding.set('agent');

    await tab.saveTarget({ id: 'agent-3', name: 'Triage' });

    expect(operations.calls[0].input).toEqual({
      FormID: 'form-1',
      Automation: { Name: 'Triage', TargetType: 'Agent', AgentID: 'agent-3' },
    });
  });

  it('creates a "send to a record" step and its binding in ONE call', async () => {
    const tab = await tabWith([]);
    operations = installFakeOperations(() => saved('new-3'));
    tab.md = { EntityByName: () => ({ ID: 'e-1', Name: 'MJ_BizApps_Common: People', DisplayNameOrName: 'People' }) };
    tab.chosenEntity.set({ name: 'MJ_BizApps_Common: People', label: 'People', schema: 'x' });
    tab.mappings.set([{ targetField: 'Email', questionId: 'q-email', rule: 'overwrite' }]);

    await tab.saveBinding();

    expect(operations.calls).toHaveLength(1);
    const input = operations.calls[0].input as { Automation: unknown; Binding: Record<string, string> };
    expect(input.Automation).toEqual({ Name: 'Send responses to People', TargetType: 'EntityBinding' });
    expect(input.Binding).toMatchObject({ Name: 'Send responses to People', TargetEntityName: 'MJ_BizApps_Common: People', Status: 'Active' });
    expect(JSON.parse(input.Binding['FieldMappings'])).toEqual({
      version: 1,
      fields: [{ targetField: 'Email', source: { kind: 'question', questionId: 'q-email' } }],
    });
    expect(JSON.parse(input.Binding['IdentityRule'])).toEqual({ mode: 'AlwaysCreate' });
    expect(JSON.parse(input.Binding['MergePolicy'])).toEqual({ default: 'neverBlank', fields: { Email: 'overwrite' } });
  });

  it('says why built-in steps appeared when the server seeded them with the first step', async () => {
    const tab = await tabWith([]);
    operations = installFakeOperations(() => saved('new-1', ['b1', 'b2', 'b3', 'b4']));
    tab.adding.set('action');

    await tab.saveTarget({ id: 'action-9', name: 'X' });

    expect(tab.seededNote()).toMatch(/the 4 built-in steps it was already running were added/);
  });

  it('shows the server\'s refusal and stays on the picker', async () => {
    const tab = await tabWith([]);
    operations = installFakeOperations(() => refused('The built-in steps could not be read, so nothing was changed.'));
    tab.adding.set('action');

    await tab.saveTarget({ id: 'action-9', name: 'X' });

    expect(tab.actionError()).toBe('The built-in steps could not be read, so nothing was changed.');
    expect(tab.adding()).toBe('action');
  });
});

describe('editing a step', () => {
  it('a toggle is a Forms.SaveAutomation update carrying only that setting', async () => {
    const tab = await tabWith([step('a', 1)]);
    operations = installFakeOperations(() => saved('a'));

    await tab.toggleActive('a');
    await tab.toggleSequential('a');

    expect(operations.calls.map((c) => c.input)).toEqual([
      { FormID: 'form-1', Automation: { ID: 'a', IsActive: false } },
      { FormID: 'form-1', Automation: { ID: 'a', ExecutionMode: 'Async' } },
    ]);
  });

  it('a refused change is shown, and the list re-read rather than left showing it', async () => {
    const tab = await tabWith([step('a', 1)]);
    operations = installFakeOperations(() => refused('Step a does not exist on form form-1.'));
    automationRows = [];

    await tab.toggleActive('a');

    expect(tab.actionError()).toBe('Step a does not exist on form form-1.');
    expect(tab.steps()).toEqual([]);
  });
});

describe('reordering', () => {
  it('sends the COMPLETE new order in one Forms.ReorderAutomations', async () => {
    const tab = await tabWith([step('a', 1), step('b', 2), step('c', 3)]);
    operations = installFakeOperations(() => succeeded({ Automations: [] }));

    await tab.move('c', -1);

    expect(operations.calls).toEqual([
      { key: 'Forms.ReorderAutomations', input: { FormID: 'form-1', OrderedAutomationIDs: ['a', 'c', 'b'] } },
    ]);
  });

  it('never offers a move across execution modes, which the runner would ignore', async () => {
    const tab = await tabWith([step('a', 1, 'Sync'), step('b', 2, 'Async')]);

    expect(tab.canMove('a', 1)).toBe(false);
    expect(tab.canMove('b', -1)).toBe(false);
  });
});

describe('removing a step', () => {
  it('is one Forms.RemoveAutomation — the server keeps the binding and marks the form', async () => {
    const tab = await tabWith([step('a', 1)]);
    operations = installFakeOperations(() =>
      succeeded({ FormAutomationID: 'a', FormID: 'form-1', RetainedBindingID: null, SeededAutomationIDs: [] }),
    );

    await tab.remove('a');

    expect(operations.calls).toEqual([{ key: 'Forms.RemoveAutomation', input: { FormAutomationID: 'a' } }]);
    expect(tab.selectedId()).toBe('');
    expect(tab.seededNote()).toBe('');
  });

  it('explains the built-ins the server seeded because a legacy form now runs its own list', async () => {
    const tab = await tabWith([step('a', 1)]);
    operations = installFakeOperations(() =>
      succeeded({ FormAutomationID: 'a', FormID: 'form-1', RetainedBindingID: null, SeededAutomationIDs: ['b1', 'b2'] }),
    );

    await tab.remove('a');

    expect(tab.seededNote()).toMatch(/the 2 built-in steps/);
  });
});
