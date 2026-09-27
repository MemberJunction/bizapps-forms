/**
 * Unit test for the **Forms: Send Confirmation Email** on-submit action's data-access seam
 * (bizapps-forms#260). This action's only direct data access is `loadFormResponseContext`, so the
 * one thing worth pinning here is that it reads through `RunActionParams.Provider` rather than the
 * process-global default. Behavioral coverage (recipient harvesting, message resolution, delivery
 * outcomes) already lives in `confirmation-email-sender.spec.ts`.
 */
import { describe, it, expect, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import { ActionParam, RunActionParams } from '@memberjunction/actions-base';
import type { ActionDataProvider } from '../shared/action-provider';

/** A simple field-bag for the FormResponse + Form loads. */
class FakeEntity {
  ID = '';
  FormID = 'form-1';
  Settings: string | null = null;
  async Load(id: string): Promise<boolean> {
    this.ID = id;
    return true;
  }
}

// The global Metadata/RunView both throw — the action must read exclusively through the
// caller-supplied provider, never `new Metadata()` / `new RunView()` (no args).
vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  class Metadata {
    async GetEntityObject(): Promise<never> {
      throw new Error('global provider used');
    }
  }
  class RunView {
    constructor(private readonly provider?: { RunView(p: unknown, u?: unknown): Promise<unknown> } | null) {}
    async RunView(params: unknown, user?: unknown): Promise<unknown> {
      if (!this.provider) throw new Error('global provider used');
      return this.provider.RunView(params, user);
    }
  }
  return { ...actual, Metadata, RunView };
});

/** The provider `RunActionParams.Provider` supplies. */
function fakeProvider(): ActionDataProvider {
  return {
    async GetEntityObject<T>(entityName: string): Promise<T> {
      if (entityName === 'MJ_BizApps_Forms: Form Responses' || entityName === 'MJ_BizApps_Forms: Forms') {
        return new FakeEntity() as unknown as T;
      }
      throw new Error(`Unexpected GetEntityObject('${entityName}')`);
    },
    async RunView<T>(opts: { EntityName: string }): Promise<{ Success: boolean; Results: T[] }> {
      // A response with an Email answer, so the action has a recipient to deliver to.
      if (opts.EntityName === 'MJ_BizApps_Forms: Form Response Answers') {
        return {
          Success: true,
          Results: [
            { ID: 'a1', QuestionID: 'q-email', TextValue: 'respondent@example.com', NumericValue: null, BooleanValue: null, JSONValue: null },
          ] as T[],
        };
      }
      if (opts.EntityName === 'MJ_BizApps_Forms: Form Questions') {
        return { Success: true, Results: [{ ID: 'q-email', QuestionType: 'Email', Prompt: 'Email' }] as T[] };
      }
      throw new Error(`Unexpected RunView('${opts.EntityName}')`);
    },
    // Present only so `isActionDataProvider` accepts this fake — the action never calls it.
    async RunViews(): Promise<never> {
      throw new Error('RunViews was not expected to be called');
    },
  } as unknown as ActionDataProvider;
}

// Import the action AFTER the mock is declared so it binds to the mocked core.
const { SendConfirmationEmailAction } = await import('./send-confirmation-email.action');

const fakeUser = { Name: 'tester' } as unknown as UserInfo;

function makeParams(): RunActionParams {
  return Object.assign(new RunActionParams(), {
    ContextUser: fakeUser,
    Filters: [],
    Provider: fakeProvider(),
    Params: [
      Object.assign(new ActionParam(), { Name: 'FormResponseID', Value: 'resp-1', Type: 'Input' }),
      Object.assign(new ActionParam(), { Name: 'Message', Value: 'Thanks!', Type: 'Input' }),
    ],
  });
}

describe('Forms: Send Confirmation Email', () => {
  it('runs all data access on RunActionParams.Provider, never the global Metadata/RunView (#260)', async () => {
    // The mocked global Metadata/RunView both throw 'global provider used'. Reaching a non-thrown
    // outcome proves the response/form/answers/questions load ran on `params.Provider` — a
    // fall-back to the global would have thrown instead.
    const params = makeParams();

    const result = await new SendConfirmationEmailAction().Run(params);

    // The default sender is a no-op (delivered:false) — SUCCESS here means loadFormResponseContext
    // completed via the provider, which is the only thing this test is pinning.
    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('NOT_SENT');
  });
});
