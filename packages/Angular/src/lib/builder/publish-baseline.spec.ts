import { describe, expect, it } from 'vitest';
import type { RunView, RunViewParams } from '@memberjunction/core';
import type { PublishedFormAutomation } from '@mj-biz-apps/forms-entities';
import { readDraftAutomations, readLiveSnapshot } from './publish-baseline';

/**
 * The two reads the builder compares its draft against, now that `Forms.PublishForm` does the
 * writing. Moved here from the deleted `PublishService`, with the cases that were about the DRAFT:
 * what an automation looks like once published, and "none" kept apart from "could not read".
 */

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

function automation(overrides: Partial<AutomationRow> = {}): AutomationRow {
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

const binding = {
  ID: 'binding-1',
  Name: 'Person',
  TargetEntityName: 'MJ_BizApps_Common: People',
  FieldMappings: JSON.stringify({ version: 1, fields: [{ targetField: 'Email', source: { kind: 'question', questionId: 'q-email' } }] }),
  IdentityRule: JSON.stringify({ mode: 'AlwaysCreate' }),
  MergePolicy: null,
  Status: 'Active',
};

interface ViewAnswer {
  Success: boolean;
  Results: unknown[];
  ErrorMessage?: string;
}

/** A RunView double: answers by entity name and records every request. */
function runView(answers: Record<string, ViewAnswer>): Pick<RunView, 'RunView' | 'RunViews'> & { asked: RunViewParams[] } {
  const asked: RunViewParams[] = [];
  const answer = (params: RunViewParams): ViewAnswer => {
    asked.push(params);
    return answers[params.EntityName ?? ''] ?? { Success: false, Results: [], ErrorMessage: 'unexpected view' };
  };
  const double = {
    asked,
    RunView: async (params: RunViewParams) => answer(params),
    RunViews: async (params: RunViewParams[]) => params.map(answer),
  };
  return double as unknown as Pick<RunView, 'RunView' | 'RunViews'> & { asked: RunViewParams[] };
}

const AUTOMATIONS = 'MJ_BizApps_Forms: Form Automations';
const BINDINGS = 'MJ_BizApps_Forms: Form Entity Bindings';
const VERSIONS = 'MJ_BizApps_Forms: Form Versions';

describe('readDraftAutomations', () => {
  it('shapes a configured binding step the way the published snapshot carries it', async () => {
    const rv = runView({
      [AUTOMATIONS]: { Success: true, Results: [automation()] },
      [BINDINGS]: { Success: true, Results: [binding] },
    });

    const draft = await readDraftAutomations(rv, 'form-1');

    expect(draft).toEqual<PublishedFormAutomation[]>([
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
        binding: {
          targetEntityName: 'MJ_BizApps_Common: People',
          fieldMappings: {
            version: 1,
            fields: [{ targetField: 'Email', source: { kind: 'question', questionId: 'q-email' }, required: false }],
          },
          identityRule: { mode: 'AlwaysCreate', match: [], scope: [], onMultipleMatch: 'Oldest', onMissingIdentityValue: 'Skip' },
          mergePolicy: { default: 'neverBlank', fields: {} },
          status: 'Active',
        },
      },
    ]);
    expect(rv.asked.map((p) => p.ExtraFilter)).toEqual(["FormID='form-1'", "FormID='form-1'"]);
  });

  it('answers [] for a form with no automations — a real, publishable state', async () => {
    const rv = runView({ [AUTOMATIONS]: { Success: true, Results: [] }, [BINDINGS]: { Success: true, Results: [] } });

    expect(await readDraftAutomations(rv, 'form-1')).toEqual([]);
  });

  it('keeps an inactive step rather than dropping it', async () => {
    const rv = runView({
      [AUTOMATIONS]: { Success: true, Results: [automation({ IsActive: false })] },
      [BINDINGS]: { Success: true, Results: [binding] },
    });

    expect((await readDraftAutomations(rv, 'form-1'))?.[0].isActive).toBe(false);
  });

  it('answers null — not [] — when a binding step names a binding that cannot be read', async () => {
    const rv = runView({
      [AUTOMATIONS]: { Success: true, Results: [automation()] },
      [BINDINGS]: { Success: true, Results: [] },
    });

    expect(await readDraftAutomations(rv, 'form-1')).toBeNull();
  });

  it('answers null when either read fails', async () => {
    const rv = runView({
      [AUTOMATIONS]: { Success: true, Results: [] },
      [BINDINGS]: { Success: false, Results: [], ErrorMessage: 'timeout' },
    });

    expect(await readDraftAutomations(rv, 'form-1')).toBeNull();
  });

  it('escapes the form id it filters on', async () => {
    const rv = runView({ [AUTOMATIONS]: { Success: true, Results: [] }, [BINDINGS]: { Success: true, Results: [] } });

    await readDraftAutomations(rv, "x' OR 1=1 --");

    expect(rv.asked[0].ExtraFilter).toBe("FormID='x'' OR 1=1 --'");
  });
});

describe('readLiveSnapshot', () => {
  it('returns the Published version’s snapshot', async () => {
    const rv = runView({ [VERSIONS]: { Success: true, Results: [{ DefinitionSnapshot: '{"v":3}' }] } });

    expect(await readLiveSnapshot(rv, 'form-1')).toBe('{"v":3}');
    expect(rv.asked[0].ExtraFilter).toBe("FormID='form-1' AND Status='Published'");
  });

  it('returns null for a form never published', async () => {
    const rv = runView({ [VERSIONS]: { Success: true, Results: [] } });

    expect(await readLiveSnapshot(rv, 'form-1')).toBeNull();
  });

  it('returns null when the read fails', async () => {
    const rv = runView({ [VERSIONS]: { Success: false, Results: [], ErrorMessage: 'timeout' } });

    expect(await readLiveSnapshot(rv, 'form-1')).toBeNull();
  });
});
