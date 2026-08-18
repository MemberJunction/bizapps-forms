import { describe, expect, it, vi } from 'vitest';
import type { PublishedFormAutomation, PublishedFormDefinition } from '@mj-biz-apps/forms-entities';
import type { FormTree } from './builder-models';

/**
 * Publish is the only place the authored automation rows become executable.
 *
 * Automations run from the `FormVersion.DefinitionSnapshot`, never from the live `FormAutomation`
 * rows — so a binding an author configures in the On Submit tab does nothing at all until a
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
/** Every EntityName the service asked RunView for, so we can assert it queried at all. */
const queriedEntities: string[] = [];

class FakeVersion {
  public ID = 'version-1';
  public FormID = '';
  public VersionNumber = 0;
  public Status = '';
  public PublishedAt: Date | null = null;
  public DefinitionSnapshot = '';
  public LatestResult = { CompleteMessage: '' };
  public NewRecord(): void {}
  public async Save(): Promise<boolean> {
    return true;
  }
}

const savedVersion = new FakeVersion();

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  class Metadata {
    public CurrentUser = { Name: 'tester' };
    public async GetEntityObject(): Promise<FakeVersion> {
      return savedVersion;
    }
  }
  class RunView {
    public async RunView(params: { EntityName: string }): Promise<{ Success: boolean; Results: unknown[] }> {
      queriedEntities.push(params.EntityName);
      if (params.EntityName === 'MJ_BizApps_Forms: Form Automations') {
        return { Success: true, Results: automationRows };
      }
      // The version-number probe: no prior versions.
      return { Success: true, Results: [] };
    }
  }
  return { ...actual, Metadata, RunView, LogError: () => {} };
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
  return JSON.parse(savedVersion.DefinitionSnapshot) as PublishedFormDefinition;
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
    automationRows.length = 0;
    automationRows.push(...rows);
    queriedEntities.length = 0;
    savedVersion.DefinitionSnapshot = '';
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
