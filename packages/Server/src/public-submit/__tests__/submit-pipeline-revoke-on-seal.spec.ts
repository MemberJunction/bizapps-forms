/**
 * Sealing a response retires the links that could reopen it (#138, decision 3 as flipped on review).
 *
 * The alternative — leaving an emailed invite Active for the rest of its 30 days so the sealed
 * answers stay readable — makes forwarding that mail a disclosure. Revoking also buys a better
 * refusal later: "this response was submitted on <date>" rather than a bare 410.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { resetPublicSubmitConfigForTests } from '../config';
import { FormsRateLimiter } from '../rate-limit.service';
import {
  runSubmitPipeline,
  resetSubmitInFlightForTests,
  type PipelineContext,
  type PipelineSubmission,
} from '../submit-pipeline';
import {
  makeContextUser,
  makeDefinition,
  makeDistribution,
  makeFakeProvider,
  makeVersion,
  respondentPermissions,
  type ExistingResponseRow,
} from './fakes';

interface Revoked {
  responseId: string;
  deviceOnly: boolean;
}

function contextWith(options: {
  revoked: Revoked[];
  throws?: boolean;
  existingResponses?: ExistingResponseRow[];
}): PipelineContext {
  const fake = makeFakeProvider({
    distribution: makeDistribution(),
    version: makeVersion(makeDefinition()),
    createPermissions: respondentPermissions(),
    existingResponses: options.existingResponses,
  });
  return {
    provider: fake.provider,
    contextUser: makeContextUser(),
    elevatedUser: makeContextUser(),
    sessionId: 'sess-abc',
    // Hooks are stubbed out so a completion does not try to resolve a service principal.
    fireHooks: async () => [],
    revokeInvites: async (args) => {
      if (options.throws) {
        throw new Error('core said no');
      }
      options.revoked.push(args);
    },
  };
}

function finalSubmission(): PipelineSubmission {
  return {
    distributionSlug: 'public-1',
    formVersionId: 'ver-1',
    answers: [{ questionId: 'q-name', textValue: 'Ada' }],
  };
}

beforeEach(() => {
  FormsRateLimiter.Instance.resetForTests();
  resetPublicSubmitConfigForTests();
  resetSubmitInFlightForTests();
});

describe('revoking a sealed response', () => {
  it('retires every live invite once the row is sealed', async () => {
    const revoked: Revoked[] = [];

    const result = await runSubmitPipeline(contextWith({ revoked }), finalSubmission());

    expect(result.success).toBe(true);
    expect(revoked).toEqual([{ responseId: result.responseId, deviceOnly: false }]);
  });

  it('does not revoke on a partial save — the draft is still being written', async () => {
    const revoked: Revoked[] = [];

    await runSubmitPipeline(contextWith({ revoked }), { ...finalSubmission(), partial: true });

    expect(revoked).toHaveLength(0);
  });

  it('answers the respondent normally even when the revoke throws', async () => {
    // The row is already written by this point. A credential that could not be retired is an
    // operator problem, not a failed submission.
    const result = await runSubmitPipeline(contextWith({ revoked: [], throws: true }), finalSubmission());

    expect(result.success).toBe(true);
  });

  it('does not revoke twice when the submission is a recognised repeat', async () => {
    // The request that actually sealed the row already retired its links.
    const revoked: Revoked[] = [];
    const sealed: ExistingResponseRow = {
      ID: 'sealed-1',
      Status: 'Complete',
      FormVersionID: 'ver-1',
      AnonymousSessionID: 'sess-abc',
    };

    const result = await runSubmitPipeline(contextWith({ revoked, existingResponses: [sealed] }), finalSubmission());

    expect(result.success).toBe(true);
    expect(result.responseId).toBe('sealed-1');
    expect(revoked).toHaveLength(0);
  });
});
