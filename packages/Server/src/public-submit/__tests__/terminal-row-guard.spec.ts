import { describe, expect, it } from 'vitest';
import { persistSubmission } from '../persistence.service';
import { makeContextUser, makeFakeProvider, respondentPermissions } from './fakes';

/**
 * A SEALED ROW IS SEALED ON EVERY PATH INTO PERSISTENCE.
 *
 * Three writers reach a `FormResponse`: `createResponse`, `reconcileDuplicate` (its primary-key
 * collision recovery) and `updateResponse`. The middle one has always checked whether the row it
 * loaded is terminal before writing over it. `updateResponse` did not — it was written when
 * `Complete` was the only terminal status and its promotion check still says so literally, so a
 * row that reached a terminal status after the caller's lookup ran gets its status downgraded,
 * its answers deleted and replaced, and — because the check it does make asks only about
 * `Complete` — counted toward the quota a second time.
 *
 * The window is small and entirely real: the lookups that populate `existingResponseId` filter
 * `Status='Partial'`, so reaching here means the row WAS a partial a moment ago. A knockout
 * flush, a second tab, or a retry landing in between is all it takes.
 */

function contextFor(existingStatus: 'Partial' | 'Complete' | 'Disqualified') {
  const responseId = '33333333-4444-4555-8666-777777777777';
  const fake = makeFakeProvider({
    createPermissions: respondentPermissions(),
    existingResponses: [
      { ID: responseId, Status: existingStatus, FormVersionID: 'ver-1', AnonymousSessionID: 'sess-1' },
    ],
  });
  return { fake, responseId };
}

function inputsFor(responseId: string) {
  return {
    formId: 'form-1',
    formVersionId: 'ver-1',
    distributionId: 'dist-1',
    complete: true,
    sessionId: 'sess-1',
    sourceMetadata: {},
    answers: [],
    existingResponseId: responseId,
  };
}

describe('updateResponse never writes over a sealed row', () => {
  describe('worst', () => {
    it('leaves a Disqualified row Disqualified', async () => {
      const { fake, responseId } = contextFor('Disqualified');

      const result = await persistSubmission(fake.provider, inputsFor(responseId), makeContextUser());

      expect(result.ok).toBe(true);
      expect(result.status).toBe('Disqualified');
      expect(result.deduped).toBe(true);
    });

    it('leaves a Complete row Complete', async () => {
      const { fake, responseId } = contextFor('Complete');

      const result = await persistSubmission(fake.provider, inputsFor(responseId), makeContextUser());

      expect(result.status).toBe('Complete');
      expect(result.deduped).toBe(true);
    });

    it('does not count a sealed row toward the quota a second time', async () => {
      const { fake, responseId } = contextFor('Disqualified');

      await persistSubmission(fake.provider, inputsFor(responseId), makeContextUser());

      expect(fake.saved.some((r) => r.entityName.includes('Form Distributions'))).toBe(false);
    });
  });

  describe('happy', () => {
    it('still promotes a Partial row', async () => {
      const { fake, responseId } = contextFor('Partial');

      const result = await persistSubmission(fake.provider, inputsFor(responseId), makeContextUser());

      expect(result.ok).toBe(true);
      expect(result.status).toBe('Complete');
    });
  });
});
