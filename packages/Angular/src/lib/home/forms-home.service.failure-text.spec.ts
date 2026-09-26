/**
 * The text `FormsHomeService` RETURNS for a failed archive/restore or authoring action.
 *
 * Forms home prefixes it with what failed ("Could not archive this form: …", "The authoring
 * action failed: …" — see failureMessage in ../shared), so a fallback written as its own headline
 * would render two headlines. These pin the fallbacks as reasons, the same rule
 * forms-home.service.spec.ts pins for the loadForms fallback (#253).
 */
import '@angular/compiler';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunViewResult } from '@memberjunction/core';
import type { ActionResult } from '@memberjunction/actions-base';

interface FakeForm {
  Status: string;
  LatestResult: { CompleteMessage: string } | undefined;
  Load: (id: string) => Promise<boolean>;
  Save: () => Promise<boolean>;
}

let loads = true;
let saves = true;
let actionMessage = '';
const logged: string[] = [];

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  class Metadata {
    public async GetEntityObject(): Promise<FakeForm> {
      return {
        Status: 'Draft',
        LatestResult: undefined,
        Load: async () => loads,
        Save: async () => saves,
      };
    }
  }
  class RunView {
    public async RunView(): Promise<RunViewResult<{ ID: string; Name: string }>> {
      return { Success: true, Results: [{ ID: 'action-1', Name: 'x' }], RowCount: 1, TotalRowCount: 1, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' };
    }
  }
  return { ...actual, Metadata, RunView, LogError: (message: string) => logged.push(message) };
});

vi.mock('@memberjunction/graphql-dataprovider', () => {
  class GraphQLActionClient {
    public async RunAction(): Promise<Partial<ActionResult>> {
      return { Success: false, Message: actionMessage };
    }
  }
  return { GraphQLActionClient, GraphQLDataProvider: { Instance: {} } };
});

const { FormsHomeService } = await import('./forms-home.service');

beforeEach(() => {
  loads = true;
  saves = true;
  actionMessage = '';
  logged.length = 0;
});

describe('FormsHomeService failure text is a reason, not a second headline (#253)', () => {
  it('says the form could not be loaded, and still logs which call failed', async () => {
    loads = false;
    const failure = await new FormsHomeService().setStatus('f-1', 'Closed');
    expect(failure).toBe('form f-1 could not be loaded');
    expect(logged.join('\n')).toContain('setStatus(f-1, Closed) failed: form f-1 could not be loaded');
  });

  it('gives a reason when a save fails without saying why', async () => {
    saves = false;
    const failure = await new FormsHomeService().setStatus('f-1', 'Closed');
    expect(failure).toBe('the save reported a failure with no error message');
  });

  it('gives a reason when an authoring action fails without saying why', async () => {
    const result = await new FormsHomeService().runAuthoringAction('Forms: Generate', []);
    expect(result.success).toBe(false);
    expect(result.message).toBe('the action reported a failure with no error message');
  });

  it("passes the action's own message through when it has one", async () => {
    actionMessage = 'Brief too short';
    const result = await new FormsHomeService().runAuthoringAction('Forms: Generate', []);
    expect(result.message).toBe('Brief too short');
  });
});
