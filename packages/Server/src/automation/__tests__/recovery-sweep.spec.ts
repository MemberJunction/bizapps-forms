import { describe, expect, it } from 'vitest';
import { MAX_BINDING_ATTEMPTS, selectRetryCandidates } from '../recovery-sweep';

function run(overrides: Partial<Parameters<typeof selectRetryCandidates>[0][number]> = {}) {
  return {
    ID: 'run-1',
    FormAutomationID: 'auto-1',
    FormResponseID: 'resp-1',
    AttemptCount: 0,
    ErrorMessage: 'candidate: connection reset',
    ...overrides,
  };
}

describe('selectRetryCandidates', () => {
  it('retries a failure that might succeed next time', () => {
    expect(selectRetryCandidates([run()])).toHaveLength(1);
  });

  it('retries a run with no recorded reason, which is what a crash leaves behind', () => {
    // The process died between opening the run and closing it — the exact case the sweep exists
    // for, and the one where there is no message to classify.
    expect(selectRetryCandidates([run({ ErrorMessage: null })])).toHaveLength(1);
  });

  it('leaves a config failure alone, however many attempts remain', () => {
    const candidates = selectRetryCandidates([
      run({ ErrorMessage: 'config: Binding targets fields that do not exist on "X": Nope.' }),
    ]);

    // A mapping against a column that does not exist fails identically forever; retrying burns the
    // budget and buries the real signal under repeated identical errors.
    expect(candidates).toEqual([]);
  });

  it('stops at the attempt cap rather than retrying forever', () => {
    expect(selectRetryCandidates([run({ AttemptCount: MAX_BINDING_ATTEMPTS })])).toEqual([]);
    expect(selectRetryCandidates([run({ AttemptCount: MAX_BINDING_ATTEMPTS - 1 })])).toHaveLength(1);
  });

  it('carries the attempt count forward so the retry can record the next one', () => {
    expect(selectRetryCandidates([run({ AttemptCount: 2 })])[0]).toMatchObject({
      runId: 'run-1',
      automationId: 'auto-1',
      responseId: 'resp-1',
      attemptCount: 2,
    });
  });
});
