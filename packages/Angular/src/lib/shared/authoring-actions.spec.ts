/**
 * `runActionByName` resolves an Action by its registered name and runs it. A name that resolves to
 * nothing, and a lookup that FAILED, are different answers and say so.
 */
import { describe, expect, it, vi } from 'vitest';
import type { RunView, RunViewParams } from '@memberjunction/core';

const ran: { actionId: string }[] = [];
vi.mock('@memberjunction/graphql-dataprovider', () => {
  class GraphQLActionClient {
    public async RunAction(actionId: string) {
      ran.push({ actionId });
      return { Success: true, Message: 'done' };
    }
  }
  return { GraphQLActionClient, GraphQLDataProvider: { Instance: {} } };
});
vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  return { ...actual, LogError: () => undefined };
});

const { runActionByName } = await import('./authoring-actions');

function reader(answer: { Success: boolean; Results: { ID: string }[]; ErrorMessage?: string }): Pick<RunView, 'RunView'> & { asked: RunViewParams[] } {
  const asked: RunViewParams[] = [];
  return {
    asked,
    RunView: (async (p: RunViewParams) => {
      asked.push(p);
      return answer;
    }) as Pick<RunView, 'RunView'>['RunView'],
  };
}

describe('runActionByName', () => {
  it('runs the action the name resolves to', async () => {
    const rv = reader({ Success: true, Results: [{ ID: 'a-1' }] });
    const outcome = await runActionByName("Forms: Create Form From Template", [], rv);
    expect(rv.asked[0].ExtraFilter).toBe("Name='Forms: Create Form From Template'");
    expect(ran.at(-1)).toEqual({ actionId: 'a-1' });
    expect(outcome.ok).toBe(true);
  });

  it('says the action is not installed when the name resolves to nothing', async () => {
    expect(await runActionByName('Forms: Missing', [], reader({ Success: true, Results: [] }))).toEqual({
      ok: false,
      message: "Action 'Forms: Missing' is not installed.",
    });
  });

  it('does not call a failed lookup "not installed"', async () => {
    const outcome = await runActionByName('Forms: X', [], reader({ Success: false, Results: [], ErrorMessage: 'timeout' }));
    expect(outcome).toEqual({ ok: false, message: "Action 'Forms: X' could not be looked up." });
  });
});
