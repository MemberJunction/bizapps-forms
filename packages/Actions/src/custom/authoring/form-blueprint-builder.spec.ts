import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * In-memory fake of the MJ entity layer so we can exercise the deterministic Builder
 * (the Designer→Builder pipeline) with NO database. We mock `@memberjunction/core`'s
 * `Metadata` to hand back tiny fake entities that record their assigned field values
 * into a shared `saved` array on Save().
 *
 * The builder only ever assigns known scalar props (FormID, Status, …) and reads `.ID`
 * + `.LatestResult`, so a plain object whose own-enumerable props we snapshot on Save
 * is a faithful stand-in.
 */
interface SavedRow {
  entity: string;
  fields: Record<string, unknown>;
}

const saved: SavedRow[] = [];
let failOn: string | null = null;

class FakeEntity {
  ID = '';
  readonly LatestResult = { Message: 'forced failure' };
  constructor(private readonly entityName: string) {}

  NewRecord(): void {
    // Clear any previously-set business fields (none on a fresh instance).
  }

  async Save(): Promise<boolean> {
    if (failOn === this.entityName) {
      return false;
    }
    this.ID = `${this.entityName}#${saved.length + 1}`;
    saved.push({ entity: this.entityName, fields: snapshot(this) });
    return true;
  }
}

/** Snapshot the business fields an instance has accumulated (own enumerable, minus internals). */
function snapshot(entity: FakeEntity): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entity)) {
    if (key === 'entityName' || key === 'LatestResult') {
      continue;
    }
    out[key] = value;
  }
  return out;
}

/**
 * PARTIAL mock: spread the real module, then override only what this test fakes.
 *
 * It used to REPLACE the module with a two-export object, which worked only for as long as
 * nothing else in the import graph needed a third export. `form-blueprint.ts` deriving its type
 * enum from the shared contract at RUNTIME (rather than via an erased `import type`) pulled the
 * generated entity subclasses in behind it, and the whole file then failed to load with
 * `No "BaseEntity" export is defined on the mock` — a failure about a symbol this test never
 * mentions. `importOriginal` keeps the override to the two classes it actually fakes.
 */
/** Action names this fake deployment has registered, and the ids they resolve to. */
let registeredActions: Record<string, string> = {};
/** Every ExtraFilter the builder asked Actions with — so a test can prove it did not ask for all. */
const actionFilters: string[] = [];
let actionReadSucceeds = true;

vi.mock('@memberjunction/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/core')>()),
  Metadata: class {
    async GetEntityObject(entityName: string): Promise<FakeEntity> {
      return new FakeEntity(entityName);
    }
  },
  RunView: class {
    async RunView(params: { EntityName: string; ExtraFilter?: string }): Promise<{
      Success: boolean;
      ErrorMessage?: string;
      Results: { ID: string; Name: string }[];
    }> {
      actionFilters.push(params.ExtraFilter ?? '');
      if (!actionReadSucceeds) {
        return { Success: false, ErrorMessage: 'action catalogue unavailable', Results: [] };
      }
      // Match the way SQL would: the filter carries names with quotes doubled, so a fake that
      // looked for the raw name would report every quoted name as unregistered.
      const results = Object.entries(registeredActions)
        .filter(([name]) => (params.ExtraFilter ?? '').includes(`'${name.replace(/'/g, "''")}'`))
        .map(([name, ID]) => ({ ID, Name: name }));
      return { Success: true, Results: results };
    }
  },
  UserInfo: class {},
}));

// Import AFTER the mock is registered.
import { buildFormFromBlueprint } from './form-blueprint-builder';
import { UserInfo } from '@memberjunction/core';
import type { FormBlueprint } from './form-blueprint';

const user = new UserInfo();

const blueprint: FormBlueprint = {
  name: 'Event RSVP',
  renderMode: 'Scroll',
  confirmationMessage: 'See you there!',
  pages: [
    {
      title: 'RSVP',
      questions: [
        { type: 'Email', prompt: 'Email', isRequired: true },
        { type: 'Number', prompt: '+1 count', settings: { min: 0, max: 10 } },
        {
          type: 'MultiChoice',
          prompt: 'Dietary restrictions',
          options: [{ label: 'Vegan' }, { label: 'None', value: 'none' }],
        },
        // Non-choice with stray options — builder must NOT persist options for it.
        { type: 'ShortText', prompt: 'Name', options: [{ label: 'ignored' }] },
      ],
    },
  ],
};

const byEntity = (name: string): SavedRow[] => saved.filter((r) => r.entity === name);

describe('buildFormFromBlueprint', () => {
  beforeEach(() => {
    saved.length = 0;
    failOn = null;
    actionFilters.length = 0;
    actionReadSucceeds = true;
    registeredActions = {
      'Forms: Send Confirmation Email': 'action-email',
      'Forms: Create Followup Task': 'action-task',
    };
  });

  it('persists a form, a draft version, one page, four questions and two options', async () => {
    const result = await buildFormFromBlueprint(blueprint, user);
    expect(result.pageCount).toBe(1);
    expect(result.questionCount).toBe(4);
    expect(result.optionCount).toBe(2); // only the MultiChoice options

    expect(byEntity('MJ_BizApps_Forms: Forms')).toHaveLength(1);
    expect(byEntity('MJ_BizApps_Forms: Form Versions')).toHaveLength(1);
    expect(byEntity('MJ_BizApps_Forms: Form Pages')).toHaveLength(1);
    expect(byEntity('MJ_BizApps_Forms: Form Questions')).toHaveLength(4);
    expect(byEntity('MJ_BizApps_Forms: Form Question Options')).toHaveLength(2);
  });

  it('records that a form authoring its own automations runs only those', async () => {
    // bizapps-forms#47: without this the form is indistinguishable from one that configured
    // nothing, so it inherits the four legacy hooks — including `Forms: Upsert Respondent Person`,
    // which mints a second Person for a consumer that already owns subject identity.
    await buildFormFromBlueprint({ ...blueprint, onSubmitMode: 'Configured' }, user);

    const form = byEntity('MJ_BizApps_Forms: Forms')[0];
    expect(JSON.parse(String(form.fields.Settings)).onSubmitMode).toBe('Configured');
  });

  it('leaves the mode absent when a blueprint says nothing about it', async () => {
    // Absent is what every form built to date carries, and it means "infer, as the server always
    // did". Writing a default here would change the behaviour of every AI- and template-authored
    // form at once.
    await buildFormFromBlueprint(blueprint, user);

    const form = byEntity('MJ_BizApps_Forms: Forms')[0];
    expect(JSON.parse(String(form.fields.Settings)).onSubmitMode).toBeUndefined();
  });

  it('sets the form to Draft with the right render mode and a settings JSON', async () => {
    await buildFormFromBlueprint(blueprint, user);
    const form = byEntity('MJ_BizApps_Forms: Forms')[0];
    expect(form.fields.Status).toBe('Draft');
    expect(form.fields.RenderMode).toBe('Scroll');
    const settings = JSON.parse(String(form.fields.Settings));
    expect(settings.confirmationMessage).toBe('See you there!');
    expect(settings.anonymousAllowed).toBe(true);
  });

  it('marks the draft version as Draft, version 1', async () => {
    await buildFormFromBlueprint(blueprint, user);
    const version = byEntity('MJ_BizApps_Forms: Form Versions')[0];
    expect(version.fields.Status).toBe('Draft');
    expect(version.fields.VersionNumber).toBe(1);
  });

  it('wires each question to the form and page ids', async () => {
    await buildFormFromBlueprint(blueprint, user);
    const formId = byEntity('MJ_BizApps_Forms: Forms')[0].fields.ID;
    const pageId = byEntity('MJ_BizApps_Forms: Form Pages')[0].fields.ID;
    for (const q of byEntity('MJ_BizApps_Forms: Form Questions')) {
      expect(q.fields.FormID).toBe(formId);
      expect(q.fields.PageID).toBe(pageId);
    }
  });

  it('serializes per-type settings onto the question', async () => {
    await buildFormFromBlueprint(blueprint, user);
    const numberQ = byEntity('MJ_BizApps_Forms: Form Questions').find((r) => r.fields.QuestionType === 'Number');
    expect(JSON.parse(String(numberQ?.fields.Settings))).toEqual({ min: 0, max: 10 });
  });

  it('defaults an option value to its label when omitted', async () => {
    await buildFormFromBlueprint(blueprint, user);
    const vegan = byEntity('MJ_BizApps_Forms: Form Question Options').find((o) => o.fields.Label === 'Vegan');
    expect(vegan?.fields.Value).toBe('Vegan');
  });

  it('throws a FormPersistError when a Save fails', async () => {
    failOn = 'MJ_BizApps_Forms: Form Pages';
    await expect(buildFormFromBlueprint(blueprint, user)).rejects.toThrow(/Failed to save FormPage/);
  });
});

describe('buildFormFromBlueprint + authored automations', () => {
  beforeEach(() => {
    saved.length = 0;
    failOn = null;
    actionFilters.length = 0;
    actionReadSucceeds = true;
    registeredActions = {
      'Forms: Send Confirmation Email': 'action-email',
      'Forms: Create Followup Task': 'action-task',
    };
  });

  const withAutomations = (automations: FormBlueprint['automations']): FormBlueprint => ({
    ...blueprint,
    automations,
  });

  it('writes one row per authored step, in the order they were authored', async () => {
    // The issue's ask #1: a consumer seeding a form should be able to say which on-submit steps it
    // gets, rather than inheriting four it never chose.
    await buildFormFromBlueprint(
      withAutomations([
        { actionName: 'Forms: Create Followup Task' },
        { actionName: 'Forms: Send Confirmation Email' },
      ]),
      user,
    );

    const rows = byEntity('MJ_BizApps_Forms: Form Automations');
    expect(rows.map((r) => r.fields.ActionID)).toEqual(['action-task', 'action-email']);
    // Array position IS the run order, so two steps can never share a DisplayOrder.
    expect(rows.map((r) => r.fields.DisplayOrder)).toEqual([1, 2]);
    expect(rows.every((r) => r.fields.TargetType === 'Action')).toBe(true);
  });

  it('declares the form authoritative, so the legacy four never run for it', async () => {
    await buildFormFromBlueprint(withAutomations([{ actionName: 'Forms: Send Confirmation Email' }]), user);

    const form = byEntity('MJ_BizApps_Forms: Forms')[0];
    expect(JSON.parse(String(form.fields.Settings)).onSubmitMode).toBe('Configured');
  });

  it('treats an empty list as "run nothing", not as "say nothing"', async () => {
    // The exact shape a consumer owning its own subject identity needs: no automations, and no
    // `Forms: Upsert Respondent Person` either.
    await buildFormFromBlueprint(withAutomations([]), user);

    expect(byEntity('MJ_BizApps_Forms: Form Automations')).toHaveLength(0);
    const form = byEntity('MJ_BizApps_Forms: Forms')[0];
    expect(JSON.parse(String(form.fields.Settings)).onSubmitMode).toBe('Configured');
  });

  it('defaults a step to the settings the legacy runner used', async () => {
    await buildFormFromBlueprint(withAutomations([{ actionName: 'Forms: Send Confirmation Email' }]), user);

    const [row] = byEntity('MJ_BizApps_Forms: Form Automations');
    expect(row.fields.Trigger).toBe('OnComplete');
    expect(row.fields.ExecutionMode).toBe('Sync');
    expect(row.fields.ContinueOnError).toBe(true);
    expect(row.fields.IsActive).toBe(true);
  });

  it('honours the settings a step states explicitly', async () => {
    await buildFormFromBlueprint(
      withAutomations([
        {
          actionName: 'Forms: Send Confirmation Email',
          trigger: 'OnCompleteOrPartial',
          executionMode: 'Async',
          continueOnError: false,
          isActive: false,
        },
      ]),
      user,
    );

    const [row] = byEntity('MJ_BizApps_Forms: Form Automations');
    expect(row.fields.Trigger).toBe('OnCompleteOrPartial');
    expect(row.fields.ExecutionMode).toBe('Async');
    expect(row.fields.ContinueOnError).toBe(false);
    expect(row.fields.IsActive).toBe(false);
  });

  it('writes NO form at all when a step names an Action this deployment lacks', async () => {
    // Adversarial review of PR #59. The refusal was real but too late: the Form row was already
    // saved WITH `onSubmitMode: 'Configured'` baked into its settings, so a failed resolve left a
    // draft that is marked authoritative and carries zero automations. Publish that and NOTHING
    // runs on submit — no configured steps, and no legacy fallback either, because the mode says
    // the (empty) list is authoritative. Worse than the duplicate Person this PR set out to fix.
    await expect(
      buildFormFromBlueprint(withAutomations([{ actionName: 'Forms: Not Installed Here' }]), user),
    ).rejects.toThrow();

    expect(byEntity('MJ_BizApps_Forms: Forms')).toHaveLength(0);
    expect(byEntity('MJ_BizApps_Forms: Form Versions')).toHaveLength(0);
    expect(byEntity('MJ_BizApps_Forms: Form Automations')).toHaveLength(0);
  });

  it('writes no form when the Action catalogue cannot be read', async () => {
    actionReadSucceeds = false;

    await expect(
      buildFormFromBlueprint(withAutomations([{ actionName: 'Forms: Send Confirmation Email' }]), user),
    ).rejects.toThrow();

    expect(byEntity('MJ_BizApps_Forms: Forms')).toHaveLength(0);
  });

  it('refuses a step naming an Action this deployment does not have', async () => {
    // The opposite of what the builder UI's seeding does, deliberately. Seeding skips an
    // unregistered built-in to reproduce the legacy runner; here the consumer NAMED the step, and
    // silently dropping it hands back a form that does not do what was asked.
    await expect(
      buildFormFromBlueprint(withAutomations([{ actionName: 'Forms: Not Installed Here' }]), user),
    ).rejects.toThrow(/Forms: Not Installed Here/);
  });

  it('refuses rather than guessing when the Action catalogue cannot be read', async () => {
    actionReadSucceeds = false;

    await expect(
      buildFormFromBlueprint(withAutomations([{ actionName: 'Forms: Send Confirmation Email' }]), user),
    ).rejects.toThrow(/action catalogue unavailable/);
  });

  it('does not read the Action catalogue at all when no steps are authored', async () => {
    await buildFormFromBlueprint(blueprint, user);

    expect(actionFilters).toHaveLength(0);
  });

  it('escapes a quote in an Action name instead of building broken SQL', async () => {
    registeredActions = { "Forms: O'Brien Step": 'action-quote' };

    await buildFormFromBlueprint(withAutomations([{ actionName: "Forms: O'Brien Step" }]), user);

    expect(actionFilters[0]).toContain("''Brien");
  });
});
