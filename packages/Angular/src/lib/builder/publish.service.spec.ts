import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ConditionalRule,
  PublishedFormAutomation,
  PublishedFormDefinition,
  mjBizAppsFormsFormPageEntity,
  mjBizAppsFormsFormQuestionEntity,
} from '@mj-biz-apps/forms-entities';
import type { FormTree, PageNode, QuestionNode } from './builder-models';

/**
 * Publish is the only place the authored automation rows become executable.
 *
 * Automations run from the `FormVersion.DefinitionSnapshot`, never from the live `FormAutomation`
 * rows — so a binding an author configures in the Automate tab does nothing at all until a
 * publish copies it into a snapshot. These tests cover that copy, because it is invisible when it
 * is missing: the submit path falls back to the legacy hook list, every form keeps working, and
 * the only symptom is that the configured binding silently never fires.
 */

/** Rows the fake RunView hands back for the `Form Automations` query. */
interface AutomationRow {
  ID: string;
  Name: string;
  TargetType: string;
  ActionID: string | null;
  AgentID: string | null;
  BindingID: string | null;
  Trigger: string;
  ExecutionMode: string;
  DisplayOrder: number;
  ConditionalRule: string | null;
  ContinueOnError: boolean;
  IsActive: boolean;
}

const automationRows: AutomationRow[] = [];
/** What `Form.Settings` holds IN THE DATABASE — deliberately not what the in-memory tree carries. */
let storedSettings: string | null = null;
let formsReadSucceeds = true;
/** A read that succeeds and returns nothing — a different thing from a read that failed. */
let formsRowMissing = false;
/** Every EntityName the service asked RunView for, so we can assert it queried at all. */
const queriedEntities: string[] = [];

type VersionStatus = 'Draft' | 'Published' | 'Retired';

/**
 * A committed `FormVersion` row.
 *
 * The fake keeps rows separate from the entity objects that write them so a rolled-back
 * transaction leaves the table exactly as it found it. Mutating a shared object in place
 * would report a retire that a rollback never actually persisted.
 */
interface VersionRow {
  ID: string;
  FormID: string;
  VersionNumber: number;
  Status: VersionStatus;
  DefinitionSnapshot: string;
}

/** The `FormVersion` table. */
const versionRows: VersionRow[] = [];
/** Version entities the service asked Metadata for, oldest first. */
const createdVersions: FakeVersion[] = [];
/** Transaction groups the service opened, in the order it opened them. */
const transactionGroups: FakeTransactionGroup[] = [];
/** When false, every transaction group rolls back rather than committing. */
let transactionSucceeds = true;
/** When false, the read of the form's currently-published versions fails. */
let publishedVersionsReadSucceeds = true;

class FakeTransactionGroup {
  /** The entities queued into this group, in the order their Save() was called. */
  public readonly Queued: FakeVersion[] = [];

  public async Submit(): Promise<boolean> {
    if (!transactionSucceeds) {
      return false;
    }
    for (const entity of this.Queued) {
      entity.Commit();
    }
    return true;
  }
}

class FakeVersion {
  public FormID = '';
  public VersionNumber = 0;
  public Status: VersionStatus | '' = '';
  public PublishedAt: Date | null = null;
  public DefinitionSnapshot = '';
  public LatestResult = { CompleteMessage: '' };
  public TransactionGroup: FakeTransactionGroup | null = null;

  constructor(public ID: string) {}

  public NewRecord(): void {}

  /** Matches MJ: inside a transaction group a save is QUEUED, and only Submit() writes it. */
  public async Save(): Promise<boolean> {
    if (this.TransactionGroup) {
      this.TransactionGroup.Queued.push(this);
      return true;
    }
    this.Commit();
    return true;
  }

  public Commit(): void {
    const row = versionRows.find((r) => r.ID === this.ID);
    const values = {
      FormID: this.FormID,
      VersionNumber: this.VersionNumber,
      Status: this.Status as VersionStatus,
      DefinitionSnapshot: this.DefinitionSnapshot,
    };
    if (row) {
      Object.assign(row, values);
    } else {
      versionRows.push({ ID: this.ID, ...values });
    }
  }
}

/** An entity object over an existing row, as `ResultType: 'entity_object'` hands back. */
function hydrate(row: VersionRow): FakeVersion {
  const entity = new FakeVersion(row.ID);
  entity.FormID = row.FormID;
  entity.VersionNumber = row.VersionNumber;
  entity.Status = row.Status;
  entity.DefinitionSnapshot = row.DefinitionSnapshot;
  return entity;
}

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  class Metadata {
    public CurrentUser = { Name: 'tester' };
    public async GetEntityObject(): Promise<FakeVersion> {
      const version = new FakeVersion(`version-${createdVersions.length + 1}`);
      createdVersions.push(version);
      return version;
    }
    public async CreateTransactionGroup(): Promise<FakeTransactionGroup> {
      const group = new FakeTransactionGroup();
      transactionGroups.push(group);
      return group;
    }
  }
  class RunView {
    public async RunView(params: {
      EntityName: string;
      ResultType?: string;
    }): Promise<{ Success: boolean; Results: unknown[] }> {
      queriedEntities.push(params.EntityName);
      if (params.EntityName === 'MJ_BizApps_Forms: Form Automations') {
        return { Success: true, Results: automationRows };
      }
      if (params.EntityName === 'MJ_BizApps_Forms: Forms') {
        if (!formsReadSucceeds) {
          return { Success: false, Results: [] };
        }
        return { Success: true, Results: formsRowMissing ? [] : [{ Settings: storedSettings }] };
      }
      // Form Versions. Entity objects are what a publish mutates (the incumbents it retires);
      // the simple read is the version-number probe.
      if (params.ResultType === 'entity_object') {
        if (!publishedVersionsReadSucceeds) {
          return { Success: false, Results: [] };
        }
        return { Success: true, Results: versionRows.filter((r) => r.Status === 'Published').map(hydrate) };
      }
      const highest = versionRows.map((r) => r.VersionNumber).sort((a, b) => b - a)[0];
      return { Success: true, Results: highest === undefined ? [] : [{ VersionNumber: highest }] };
    }
  }
  return { ...actual, Metadata, RunView, LogError: () => {}, LogStatus: () => {} };
});

const { PublishService } = await import('./publish.service');

function tree(): FormTree {
  const form = {
    ID: 'form-1',
    Name: 'Intake',
    Description: null,
    RenderMode: 'Scroll',
    Settings: null,
    StyleID: null,
    Status: 'Draft',
    Save: async () => true,
    LatestResult: { CompleteMessage: '' },
  };
  return { form, pages: [], screens: [] } as unknown as FormTree;
}

function publishedSnapshot(): PublishedFormDefinition {
  const version = createdVersions[createdVersions.length - 1];
  return JSON.parse(version.DefinitionSnapshot) as PublishedFormDefinition;
}

/** Everything the fakes carry between tests. */
function resetWorld(): void {
  automationRows.length = 0;
  queriedEntities.length = 0;
  versionRows.length = 0;
  createdVersions.length = 0;
  transactionGroups.length = 0;
  transactionSucceeds = true;
  publishedVersionsReadSucceeds = true;
  storedSettings = null;
  formsReadSucceeds = true;
  formsRowMissing = false;
}

function row(overrides: Partial<AutomationRow>): AutomationRow {
  return {
    ID: 'auto-1',
    Name: 'Bind to Person',
    TargetType: 'EntityBinding',
    ActionID: null,
    AgentID: null,
    BindingID: 'binding-1',
    Trigger: 'OnComplete',
    ExecutionMode: 'Sync',
    DisplayOrder: 1,
    ConditionalRule: null,
    ContinueOnError: true,
    IsActive: true,
    ...overrides,
  };
}

describe('PublishService — automations in the snapshot', () => {
  function reset(rows: AutomationRow[]): void {
    resetWorld();
    automationRows.push(...rows);
  }

  it('carries a configured entity binding into the published snapshot', async () => {
    reset([row({})]);

    const result = await new PublishService().publish(tree());

    expect(result.success).toBe(true);
    expect(queriedEntities).toContain('MJ_BizApps_Forms: Form Automations');
    expect(publishedSnapshot().automations).toEqual<PublishedFormAutomation[]>([
      {
        id: 'auto-1',
        name: 'Bind to Person',
        targetType: 'EntityBinding',
        bindingId: 'binding-1',
        trigger: 'OnComplete',
        executionMode: 'Sync',
        displayOrder: 1,
        continueOnError: true,
        isActive: true,
      },
    ]);
  });

  it('publishes an empty array for a form with no automations, so the legacy path still applies', async () => {
    reset([]);

    await new PublishService().publish(tree());

    // The submit path switches on `automations.length > 0`. An empty array is what keeps every
    // already-published form on the legacy hook list rather than silently losing its hooks.
    expect(publishedSnapshot().automations).toEqual([]);
  });

  it('carries an inactive automation rather than dropping it', async () => {
    reset([row({ IsActive: false })]);

    await new PublishService().publish(tree());

    // Dropping it here would be indistinguishable from "never configured", and re-enabling it in
    // the builder would then require a republish to take effect in a way the author cannot see.
    // The runner is what honours `isActive`.
    expect(publishedSnapshot().automations[0].isActive).toBe(false);
  });
});

/**
 * The snapshot's settings must come from the DATABASE, not from the tree the builder loaded.
 *
 * Found by adversarial review of PR #59. `markAutomationsAuthoritative()` writes
 * `onSubmitMode: 'Configured'` through its own Form entity, and the tab has no `@Output`, so the
 * builder's `tree.form` — loaded once when the builder opened — never learns about it. Publishing
 * without leaving the builder therefore snapshotted the STALE settings: an author who removed
 * every automation got `automations: []` with no mode, which infers `legacy` and fires all four
 * built-in hooks. The database was right and the snapshot, the only thing the server reads, was
 * wrong.
 *
 * `loadAutomations` already re-reads for exactly this reason; settings simply had not been given
 * the same treatment.
 */
describe('PublishService — settings in the snapshot', () => {
  function reset(stored: string | null): void {
    resetWorld();
    storedSettings = stored;
  }

  it('publishes the stored on-submit mode, not the stale one the builder holds', async () => {
    reset(JSON.stringify({ anonymousAllowed: true, captchaRequired: false, onSubmitMode: 'Configured' }));

    // `tree()` carries `Settings: null` — the builder's copy, from before the Automate tab wrote.
    const result = await new PublishService().publish(tree());

    expect(result.success).toBe(true);
    expect(publishedSnapshot().settings.onSubmitMode).toBe('Configured');
  });

  it('carries the rest of the stored settings too', async () => {
    reset(JSON.stringify({ anonymousAllowed: false, captchaRequired: true, quota: 25, confirmationMessage: 'Thanks!' }));

    await new PublishService().publish(tree());

    const settings = publishedSnapshot().settings;
    expect(settings.anonymousAllowed).toBe(false);
    expect(settings.captchaRequired).toBe(true);
    expect(settings.quota).toBe(25);
    expect(settings.confirmationMessage).toBe('Thanks!');
  });

  it('publishes the documented defaults for a row whose Settings was never written', async () => {
    // The distinction the guard above rests on: a NULL column on a row that IS returned genuinely
    // means "never written", and must keep publishing rather than refuse.
    reset(null);

    const result = await new PublishService().publish(tree());

    expect(result.success).toBe(true);
    expect(publishedSnapshot().settings.anonymousAllowed).toBe(true);
    expect(publishedSnapshot().settings.onSubmitMode).toBeUndefined();
  });

  it('refuses to publish when the form row comes back missing', async () => {
    // A successful read returning zero rows is NOT "this form has no settings". The form
    // demonstrably exists — its automations were just read and a version row is about to be
    // written for it — so an empty result means we do not know what its settings are.
    //
    // Publishing the defaults instead is a silent downgrade, and not only of the on-submit mode:
    // `parseFormSettings(null)` yields anonymousAllowed=true and captchaRequired=false and drops
    // quota, opensAt, closesAt, confirmationMessage and redirectUrl. A private, captcha-gated,
    // capped form would publish as open, ungated and uncapped.
    reset(JSON.stringify({ anonymousAllowed: false, captchaRequired: true, quota: 10 }));
    formsRowMissing = true;

    const result = await new PublishService().publish(tree());

    expect(result.success).toBe(false);
    expect(createdVersions).toHaveLength(0);
  });

  it('refuses to publish when the form\'s settings cannot be read', async () => {
    // Same reasoning as the automations read: publishing settings we could not confirm is how a
    // form silently loses its declared mode and reverts to firing the built-ins.
    reset(null);
    formsReadSucceeds = false;

    const result = await new PublishService().publish(tree());

    expect(result.success).toBe(false);
    expect(createdVersions).toHaveLength(0);
  });
});

/**
 * At most ONE Published version per form.
 *
 * Publishing minted a new `Published` FormVersion and left every earlier one Published too, so
 * forms accumulated several simultaneously-live versions (three on one dev form). Nothing broke,
 * because all three readers here disambiguate with `VersionNumber DESC` — which is exactly the
 * problem: the invariant was a convention each caller had to remember rather than a property of
 * the data, and `loadPublishedVersion`'s own docstring already claimed it held. See #82.
 */
describe('PublishService — one live version per form', () => {
  beforeEach(resetWorld);

  function givenPublishedVersion(versionNumber: number): void {
    versionRows.push({
      ID: `existing-${versionNumber}`,
      FormID: 'form-1',
      VersionNumber: versionNumber,
      Status: 'Published',
      DefinitionSnapshot: '{}',
    });
  }

  function statusOf(versionNumber: number): VersionStatus | undefined {
    return versionRows.find((r) => r.VersionNumber === versionNumber)?.Status;
  }

  function publishedCount(): number {
    return versionRows.filter((r) => r.FormID === 'form-1' && r.Status === 'Published').length;
  }

  it('retires the version that was published before this one', async () => {
    givenPublishedVersion(1);

    const result = await new PublishService().publish(tree());

    expect(result.success).toBe(true);
    expect(statusOf(1)).toBe('Retired');
    expect(statusOf(2)).toBe('Published');
  });

  it('retires the incumbent and publishes its replacement in one transaction, retire first', async () => {
    givenPublishedVersion(1);

    await new PublishService().publish(tree());

    // One group, not two: a retire that committed on its own ahead of an insert that then failed
    // would leave the form with no live version and its public link answering
    // `no-published-version`. Retire-first is what the filtered unique index requires — the
    // replacement cannot be inserted as Published while the incumbent still is.
    expect(transactionGroups).toHaveLength(1);
    expect(transactionGroups[0].Queued.map((e) => [e.ID, e.Status])).toEqual([
      ['existing-1', 'Retired'],
      ['version-1', 'Published'],
    ]);
  });

  it('leaves exactly one Published version after two consecutive publishes', async () => {
    const service = new PublishService();

    await service.publish(tree());
    await service.publish(tree());

    expect(versionRows).toHaveLength(2);
    expect(publishedCount()).toBe(1);
    expect(statusOf(2)).toBe('Published');
    expect(statusOf(1)).toBe('Retired');
  });

  it('retires every live version, not just the newest', async () => {
    // What the dev database actually holds until the backfill migration runs: one form carried
    // three simultaneously-Published versions. A publish that demoted only the newest would leave
    // the older two live and the next insert would then be refused by the unique index.
    givenPublishedVersion(1);
    givenPublishedVersion(2);
    givenPublishedVersion(3);

    await new PublishService().publish(tree());

    expect(publishedCount()).toBe(1);
    expect(statusOf(4)).toBe('Published');
    expect([statusOf(1), statusOf(2), statusOf(3)]).toEqual(['Retired', 'Retired', 'Retired']);
  });

  it('leaves the incumbent live when the swap transaction rolls back', async () => {
    givenPublishedVersion(1);
    transactionSucceeds = false;

    const result = await new PublishService().publish(tree());

    // The failure that must never happen is a retired incumbent with no replacement. A rolled-back
    // swap has to leave the form exactly as it was — still serving version 1.
    expect(result.success).toBe(false);
    expect(statusOf(1)).toBe('Published');
    expect(versionRows).toHaveLength(1);
  });

  it('refuses to publish when the form\'s live version cannot be read', async () => {
    givenPublishedVersion(1);
    publishedVersionsReadSucceeds = false;

    const result = await new PublishService().publish(tree());

    // Publishing without knowing what is live is how a second Published row appears — the very
    // state this fix exists to remove.
    expect(result.success).toBe(false);
    expect(createdVersions).toHaveLength(0);
    expect(statusOf(1)).toBe('Published');
  });
});

/**
 * A rule the builder is ALREADY flagging as broken must not reach the published snapshot
 * (issue #79).
 *
 * The canvas puts a "Rule is broken" badge on the item and names the cause, but Publish neither
 * blocked nor warned: the dangling `questionId` was baked into `DefinitionSnapshot`, the widget
 * then rendered one fewer question than the author believes the form has, and the dashboard
 * reported that question as "0 answers · 100% skipped" — indistinguishable from respondents who
 * chose not to answer it.
 *
 * The gate lives in this SERVICE rather than on the button, because this is the only code that
 * writes a Published `FormVersion`. A check on the click is a check every other caller — the AI
 * builder, a template clone, whatever ships next — walks straight past.
 */
describe('PublishService — rules the builder already calls broken', () => {
  beforeEach(resetWorld);

  function question(id: string, prompt: string, rule: ConditionalRule | null): QuestionNode {
    return {
      entity: {
        ID: id,
        QuestionType: 'ShortText',
        Prompt: prompt,
        HelpText: null,
        IsRequired: false,
        DisplayOrder: 1,
        ConditionalRule: rule ? JSON.stringify(rule) : null,
        ValidationRule: null,
        Settings: null,
      } as mjBizAppsFormsFormQuestionEntity,
      options: [],
    };
  }

  /** One page carrying the given questions in the order supplied — the order the rules read in. */
  function treeOf(questions: QuestionNode[]): FormTree {
    const page: PageNode = {
      entity: {
        ID: 'page-1',
        Title: 'Page 1',
        Description: null,
        DisplayOrder: 1,
        ConditionalRule: null,
      } as mjBizAppsFormsFormPageEntity,
      questions,
    };
    return { ...tree(), pages: [page] };
  }

  /** The show rule from the issue, in shape: one equality against another question's answer. */
  const showsWhen = (questionId: string): ConditionalRule => ({
    show: { all: [{ questionId, op: 'equals', value: 'Pro' }] },
  });

  it('refuses a rule whose source question no longer exists, and says which rule', async () => {
    const form = treeOf([
      question('q-1', 'Which plan?', null),
      question('q-2', 'Want onboarding?', showsWhen('q-deleted')),
    ]);

    const result = await new PublishService().publish(form);

    expect(result.success).toBe(false);
    // Pinned in full, because the refusal IS the fix instruction: it has to say which rule and
    // what is wrong with it, in the same words the canvas badge is already using.
    expect(result.error).toBe(
      'Publish refused — 1 broken rule would ship with this form. Fix it and publish again: ' +
        'Show "Want onboarding?" when (deleted question) equals Pro — references a question that no longer exists.',
    );
    // The dangling questionId never reaches DefinitionSnapshot — the refusal is before the
    // first read, so no version entity was even asked for, let alone written.
    expect(createdVersions).toHaveLength(0);
    expect(versionRows).toHaveLength(0);
  });

  it('refuses a rule whose source is answered after the rule runs', async () => {
    // The reorder shape. The source is right there on the canvas, so nothing looks wrong — but
    // the rule runs before anything has been put in the answer map under that id, decides the
    // same way for every respondent, and then changes its mind once the source is answered.
    const form = treeOf([
      question('q-1', 'Want onboarding?', showsWhen('q-2')),
      question('q-2', 'Which plan?', null),
    ]);

    const result = await new PublishService().publish(form);

    expect(result.success).toBe(false);
    expect(result.error).toContain('answered later than this rule runs');
    expect(createdVersions).toHaveLength(0);
  });

  it('publishes a form whose rules all work, with no extra friction', async () => {
    const form = treeOf([
      question('q-1', 'Which plan?', null),
      question('q-2', 'Want onboarding?', showsWhen('q-1')),
    ]);

    const result = await new PublishService().publish(form);

    expect(result.success).toBe(true);
    expect(publishedSnapshot().pages[0].questions).toHaveLength(2);
  });
});
