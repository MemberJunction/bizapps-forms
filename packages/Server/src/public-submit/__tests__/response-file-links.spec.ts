/**
 * Persisting a submission also attaches its uploaded files to the response record.
 *
 * A file answer has always stored its `MJ: Files` id on the answer row, and MJ's attachments
 * panel has never read answer rows — it reads `FileEntityRecordLink` for (EntityID, RecordID).
 * So a résumé was stored, downloadable through the Forms route, and invisible on the response it
 * belonged to. These tests pin the write that closes that gap, and — more importantly — pin the
 * two ways it must NOT behave: it may not duplicate on a re-save, and it may not fail a
 * submission that has already been recorded.
 */
import { describe, expect, it, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { FormAnswerInput, PublishedFormQuestion } from '@mj-biz-apps/forms-entities';

import { FILE_ENTITY_RECORD_LINK_ENTITY } from '../../file-links/file-links.service';
import { persistSubmission, type PersistenceInputs } from '../persistence.service';
import { FORM_RESPONSE_ENTITY } from '../entity-names';
import type { ValidatedAnswer } from '../validation.service';
import {
  fakeEntityId,
  makeContextUser,
  makeDistribution,
  makeFakeProvider,
  respondentPermissions,
  type FakeProviderConfig,
  type SavedRecord,
} from './fakes';

const RESPONSE_ID = 'cccccccc-0000-4000-8000-000000000001';
const FILE_A = 'dddddddd-0000-4000-8000-00000000000a';
const FILE_B = 'dddddddd-0000-4000-8000-00000000000b';

function fileQuestion(id: string): PublishedFormQuestion {
  return { id, type: 'FileUpload', prompt: 'Your résumé', isRequired: false, displayOrder: 1, options: [] };
}

function answer(questionId: string, input: FormAnswerInput): ValidatedAnswer {
  return { question: fileQuestion(questionId), input };
}

function inputs(answers: ValidatedAnswer[], overrides?: Partial<PersistenceInputs>): PersistenceInputs {
  return {
    formId: 'form-1',
    formVersionId: 'ver-1',
    distributionId: 'dist-1',
    complete: true,
    sessionId: 'sess-1',
    sourceMetadata: {},
    answers,
    clientResponseId: RESPONSE_ID,
    ...overrides,
  };
}

function provider(config?: Partial<FakeProviderConfig>) {
  return makeFakeProvider({
    distribution: makeDistribution(),
    createPermissions: respondentPermissions(),
    ...config,
  });
}

function links(saved: SavedRecord[]): Record<string, unknown>[] {
  return saved.filter((row) => row.entityName === FILE_ENTITY_RECORD_LINK_ENTITY).map((row) => row.values);
}

const contextUser: UserInfo = makeContextUser();

describe('persistSubmission — response attachments', () => {
  it('attaches a file answer to the response record it belongs to', async () => {
    const fake = provider({ responseUploads: [{ FileID: FILE_A }] });

    const result = await persistSubmission(fake.provider, inputs([answer('q-file', { questionId: 'q-file', fileId: FILE_A })]), contextUser);

    expect(result.ok).toBe(true);
    expect(links(fake.saved)).toEqual([
      // The entity's ROW ID, not its name: that is what the attachments panel filters on.
      { FileID: FILE_A, EntityID: fakeEntityId(FORM_RESPONSE_ENTITY), RecordID: RESPONSE_ID },
    ]);
  });

  it('writes no link for a submission that carries no files', async () => {
    const fake = provider();

    await persistSubmission(fake.provider, inputs([answer('q-name', { questionId: 'q-name', textValue: 'Ada' })]), contextUser);

    expect(links(fake.saved)).toEqual([]);
  });

  it('does not attach the same file twice when the submission is re-saved', async () => {
    // Autosave, promotion and a retried submit all re-run this path. There is no unique
    // constraint on the link table, so nothing but this behaviour stops them stacking up.
    const fake = provider({
      fileLinks: [{ ID: 'link-a', FileID: FILE_A }],
      responseUploads: [{ FileID: FILE_A }],
      existingResponses: [
        { ID: RESPONSE_ID, Status: 'Partial', FormVersionID: 'ver-1', AnonymousSessionID: 'sess-1' },
      ],
    });

    await persistSubmission(
      fake.provider,
      inputs([answer('q-file', { questionId: 'q-file', fileId: FILE_A })], { existingResponseId: RESPONSE_ID }),
      contextUser,
    );

    expect(links(fake.saved)).toEqual([]);
  });

  it('attaches the replacement when a respondent swaps their upload', async () => {
    const fake = provider({
      fileLinks: [{ ID: 'link-a', FileID: FILE_A }],
      responseUploads: [{ FileID: FILE_A }, { FileID: FILE_B }],
      existingResponses: [
        { ID: RESPONSE_ID, Status: 'Partial', FormVersionID: 'ver-1', AnonymousSessionID: 'sess-1' },
      ],
    });

    await persistSubmission(
      fake.provider,
      inputs([answer('q-file', { questionId: 'q-file', fileId: FILE_B })], { existingResponseId: RESPONSE_ID }),
      contextUser,
    );

    expect(links(fake.saved)).toEqual([
      { FileID: FILE_B, EntityID: fakeEntityId(FORM_RESPONSE_ENTITY), RecordID: RESPONSE_ID },
    ]);
    // ...and the superseded one stops being on display.
    expect(links(fake.deleted)).toEqual([{ ID: 'link-a' }]);
  });

  it('leaves a hand-attached file on the response alone', async () => {
    // Someone attached this through the panel; it is not in the answers and it is not Forms' to
    // remove. Only files with a `FormUpload` row for THIS response are ours.
    const fake = provider({
      fileLinks: [{ ID: 'link-admin', FileID: FILE_A }],
      responseUploads: [],
      existingResponses: [
        { ID: RESPONSE_ID, Status: 'Partial', FormVersionID: 'ver-1', AnonymousSessionID: 'sess-1' },
      ],
    });

    await persistSubmission(
      fake.provider,
      inputs([answer('q-name', { questionId: 'q-name', textValue: 'Ada' })], { existingResponseId: RESPONSE_ID }),
      contextUser,
    );

    expect(links(fake.deleted)).toEqual([]);
  });

  it('records the submission even when the attachment write is rejected', async () => {
    // The response and its answers are already saved when this runs. Reporting a failure here
    // would tell a respondent their submission failed when it did not.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fake = provider({
      failSaveFor: FILE_ENTITY_RECORD_LINK_ENTITY,
      responseUploads: [{ FileID: FILE_A }],
    });

    const result = await persistSubmission(
      fake.provider,
      inputs([answer('q-file', { questionId: 'q-file', fileId: FILE_A })]),
      contextUser,
    );

    expect(result.ok).toBe(true);
    expect(result.responseId).toBe(RESPONSE_ID);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(FILE_A));
    warn.mockRestore();
  });

  it('writes nothing for a submission a concurrent request already completed', async () => {
    // The winning request attached the files; re-attaching them from the loser would double them.
    const fake = provider({
      responseUploads: [{ FileID: FILE_A }],
      concurrentlyCreated: [
        { ID: RESPONSE_ID, Status: 'Complete', FormVersionID: 'ver-1', AnonymousSessionID: 'sess-1' },
      ],
    });

    const result = await persistSubmission(
      fake.provider,
      inputs([answer('q-file', { questionId: 'q-file', fileId: FILE_A })]),
      contextUser,
    );

    expect(result.deduped).toBe(true);
    expect(links(fake.saved)).toEqual([]);
  });
});
