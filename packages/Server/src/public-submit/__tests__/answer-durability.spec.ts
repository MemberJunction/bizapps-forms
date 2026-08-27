/**
 * A stored response never holds neither its old answers nor its new ones.
 *
 * `saveResponseWithAnswers` writes in this order: save the parent row (which is what flips
 * `Status` to `Complete` and stamps `SubmittedAt`), DELETE every answer the response already
 * had, then INSERT the new ones one at a time, aborting on the first failure. There is no
 * transaction around any of it.
 *
 * So there is a window — the whole length of the delete-then-insert — in which the row is
 * already sealed and its answers are gone. A failure anywhere inside it leaves a response that
 * says `Complete`, carries a `SubmittedAt`, counts toward the quota, and has lost the answers it
 * had without gaining the ones it was sent. Nothing retries: the submit returns an error, the
 * respondent sees it, and the row stays that way.
 *
 * The same shape is also why every autosave rewrites every answer — N deletes and N inserts per
 * debounce, whether or not anything changed.
 */
import { describe, expect, it } from 'vitest';

import { persistSubmission, type PersistenceInputs } from '../persistence.service';
import {
  makeContextUser,
  makeDefinition,
  makeFakeProvider,
  respondentPermissions,
  type FakeProvider,
} from './fakes';

const RESPONSE_ENTITY = 'MJ_BizApps_Forms: Form Responses';
const ANSWER_ENTITY = 'MJ_BizApps_Forms: Form Response Answers';
const EXISTING_ID = '11111111-1111-4111-8111-111111111111';

/**
 * The three answers a respondent had already banked before this save. The first is for the same
 * question the incoming submission answers — the overwhelmingly common case, since an autosave
 * re-sends everything the respondent has typed so far.
 */
const STORED_QUESTION_ID = 'q-name';
const STORED = [
  { ID: 'a-1', QuestionID: STORED_QUESTION_ID },
  { ID: 'a-2', QuestionID: 'q-other' },
  { ID: 'a-3', QuestionID: 'q-third' },
];

function inputs(overrides?: Partial<PersistenceInputs>): PersistenceInputs {
  const definition = makeDefinition();
  const question = definition.pages[0].questions[0];
  return {
    formId: definition.formId,
    formVersionId: definition.formVersionId,
    distributionId: 'dist-1',
    complete: true,
    sessionId: 'session-1',
    sourceMetadata: {},
    existingResponseId: EXISTING_ID,
    answers: [{ question, input: { questionId: question.id, textValue: 'the new answer' } }],
    ...overrides,
  };
}

function provider(failAnswers: boolean): FakeProvider {
  return makeFakeProvider({
    createPermissions: respondentPermissions(),
    existingResponses: [
      {
        ID: EXISTING_ID,
        Status: 'Partial',
        FormVersionID: makeDefinition().formVersionId,
        AnonymousSessionID: 'session-1',
      },
    ],
    existingAnswers: STORED,
    ...(failAnswers ? { failSaveFor: ANSWER_ENTITY } : {}),
  });
}

const answerWrites = (fake: FakeProvider) => fake.saved.filter((r) => r.entityName === ANSWER_ENTITY);
const answerDeletes = (fake: FakeProvider) => fake.deleted.filter((r) => r.entityName === ANSWER_ENTITY);
const responseWrites = (fake: FakeProvider) => fake.saved.filter((r) => r.entityName === RESPONSE_ENTITY);

describe('a completion is never sealed without its answers', () => {
  describe('worst', () => {
    it('does not leave the row Complete when its answers could not be written', async () => {
      const fake = provider(true);
      const result = await persistSubmission(fake.provider, inputs(), makeContextUser());

      expect(result.ok).toBe(false);
      // The failure the caller sees is honest. What must ALSO be true is that the row it leaves
      // behind does not claim to be a finished submission.
      const sealed = responseWrites(fake).filter((r) => r.values.Status === 'Complete');
      expect(sealed, 'a Complete row was written while its answers were failing').toEqual([]);
    });

    it('does not destroy the answers it already had before the new ones are safe', async () => {
      const fake = provider(true);
      await persistSubmission(fake.provider, inputs(), makeContextUser());

      // Three banked answers, none of them replaced: deleting them bought nothing and cost
      // everything the respondent had typed.
      expect(answerDeletes(fake).length, 'prior answers were deleted despite the insert failing').toBe(0);
    });
  });
});

describe('a re-save writes only what changed', () => {
  describe('happy', () => {
    it('does not delete and re-insert answers that are already stored as sent', async () => {
      // Every autosave takes this path. Rewriting the whole set on each debounce is N deletes and
      // N inserts for a form where nothing may have changed at all — and it is the same rewrite
      // that opens the window above.
      const fake = provider(false);
      await persistSubmission(fake.provider, inputs({ complete: false }), makeContextUser());

      expect(answerDeletes(fake).length + answerWrites(fake).length).toBeLessThanOrEqual(STORED.length);
    });
  });
});
