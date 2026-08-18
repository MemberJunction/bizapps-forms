import { describe, it, expect } from 'vitest';
import { buildResponseRows, buildResponseDetail } from './response-aggregations';
import { renderAnswer } from '../shared/answer-values';
import {
  q,
  response,
  answer,
  upload,
  automationRun,
  bindingRecord,
} from '../shared/testing/entity-row-fixtures';
import type { ResponseDetailInput } from './response-aggregations';

/** The empty-satellite baseline; specs override just the part they exercise. */
function detailInput(overrides: Partial<ResponseDetailInput> = {}): ResponseDetailInput {
  return {
    response: response('r1', 'Complete', new Date(), new Date()),
    answers: [],
    questions: [],
    uploads: [],
    automationRuns: [],
    bindingRecords: [],
    entityNameById: new Map<string, string>(),
    ...overrides,
  };
}

describe('buildResponseRows', () => {
  it('counts answers per response', () => {
    const rows = buildResponseRows(
      [response('r1', 'Complete', new Date(), new Date())],
      [answer('r1', 'q1', { TextValue: 'x' }), answer('r1', 'q2', { TextValue: 'y' })],
    );
    expect(rows[0].answeredCount).toBe(2);
    expect(rows[0].respondent).toBe('Anonymous');
  });

  it('lists COMPLETE responses only — in-progress partials are excluded from the list', () => {
    const rows = buildResponseRows(
      [
        response('r1', 'Complete', new Date(), new Date()),
        response('r2', 'Partial', new Date(), null),
      ],
      [answer('r1', 'q1', { TextValue: 'x' })],
    );
    expect(rows.map((r) => r.responseId)).toEqual(['r1']);
  });
});

describe('renderAnswer / buildResponseDetail', () => {
  it('maps choice values to labels and renders booleans', () => {
    const choice = q('qc', 'SingleChoice', 0, [{ id: 'o1', label: 'Red', value: 'red', displayOrder: 0 }]);
    const yn = q('qy', 'YesNo', 1);
    expect(renderAnswer(choice, answer('r1', 'qc', { TextValue: 'red' }))).toBe('Red');
    expect(renderAnswer(yn, answer('r1', 'qy', { BooleanValue: false }))).toBe('No');

    const detail = buildResponseDetail(
      detailInput({
        answers: [answer('r1', 'qc', { TextValue: 'red' })],
        questions: [choice, yn],
      }),
    );
    expect(detail.answers).toHaveLength(1);
    expect(detail.answers[0]).toMatchObject({ prompt: 'Prompt qc', displayValue: 'Red' });
  });

  it('reports how many answers it could not label, so the loss is never silent', () => {
    const detail = buildResponseDetail(
      detailInput({
        answers: [
          answer('r1', 'deleted-q', { TextValue: 'orphan' }),
          answer('r1', 'kept', { TextValue: 'fine' }),
        ],
        questions: [q('kept', 'ShortText')],
      }),
    );
    expect(detail.answers).toHaveLength(1);
    expect(detail.unlabelledAnswerCount).toBe(1);
  });

  it('skips answers whose question is gone from the version being labelled', () => {
    const detail = buildResponseDetail(
      detailInput({
        answers: [answer('r1', 'deleted-q', { TextValue: 'orphan' })],
        questions: [q('kept', 'ShortText')],
      }),
    );
    expect(detail.answers).toEqual([]);
  });
});

describe('buildResponseDetail — AI scoring', () => {
  it('surfaces the score and its rationale on a scored answer', () => {
    const detail = buildResponseDetail(
      detailInput({
        answers: [answer('r1', 'qt', { TextValue: 'Great product', Score: 8.5, ScoreRationale: 'Positive sentiment' })],
        questions: [q('qt', 'LongText')],
      }),
    );
    expect(detail.answers[0].score).toBe(8.5);
    expect(detail.answers[0].scoreRationale).toBe('Positive sentiment');
  });

  it('treats a score of ZERO as scored — every scored answer in the dev DB is 0.0000', () => {
    // Not hypothetical: `Forms: Analyze Written Responses` scores junk text 0, and a
    // truthiness check anywhere on this path would hide the AI output completely.
    const detail = buildResponseDetail(
      detailInput({
        answers: [answer('r1', 'qt', { TextValue: 'test string', Score: 0, ScoreRationale: 'Not a genuine inquiry.' })],
        questions: [q('qt', 'LongText')],
      }),
    );
    expect(detail.answers[0].score).toBe(0);
    expect(detail.answers[0].score).not.toBeNull();
    expect(detail.answers[0].scoreRationale).toBe('Not a genuine inquiry.');
  });

  it('leaves score null on an unscored answer rather than defaulting it to zero', () => {
    const detail = buildResponseDetail(
      detailInput({
        answers: [answer('r1', 'qt', { TextValue: 'no score here' })],
        questions: [q('qt', 'LongText')],
      }),
    );
    expect(detail.answers[0].score).toBeNull();
    expect(detail.answers[0].scoreRationale).toBeNull();
  });
});

describe('buildResponseDetail — file answers', () => {
  it('renders the uploaded file name and size instead of the raw file id', () => {
    const detail = buildResponseDetail(
      detailInput({
        answers: [answer('r1', 'qf', { FileID: 'file-1' })],
        questions: [q('qf', 'FileUpload')],
        uploads: [upload('file-1', { FileName: 'resume.pdf', SizeBytes: 1024 })],
      }),
    );
    expect(detail.answers[0].file).toMatchObject({
      fileId: 'file-1',
      fileName: 'resume.pdf',
      sizeBytes: 1024,
      isRevoked: false,
      isResolved: true,
    });
    // The GUID must not leak into the display value — that was the old rendering.
    expect(detail.answers[0].displayValue).not.toContain('file-1');
  });

  it('flags a revoked upload so a stale link is not presented as live', () => {
    const detail = buildResponseDetail(
      detailInput({
        answers: [answer('r1', 'qf', { FileID: 'file-1' })],
        questions: [q('qf', 'FileUpload')],
        uploads: [upload('file-1', { Status: 'Revoked' })],
      }),
    );
    expect(detail.answers[0].file?.isRevoked).toBe(true);
  });

  it('matches on FileID, so an upload from another draft never attaches to this answer', () => {
    const detail = buildResponseDetail(
      detailInput({
        answers: [answer('r1', 'qf', { FileID: 'file-1' })],
        questions: [q('qf', 'FileUpload')],
        uploads: [upload('file-2', { FileName: 'someone-elses.pdf', SizeBytes: 99 })],
      }),
    );
    // The foreign upload contributes NOTHING — not its name, not its size.
    expect(detail.answers[0].file?.fileName).not.toBe('someone-elses.pdf');
    expect(detail.answers[0].file?.sizeBytes).toBeNull();
  });

  it('still shows that a file was submitted when its provenance row did not come back', () => {
    const detail = buildResponseDetail(
      detailInput({
        answers: [answer('r1', 'qf', { FileID: 'file-1' })],
        questions: [q('qf', 'FileUpload')],
        uploads: [],
      }),
    );
    // Blanking this would read as "they attached nothing", which is the opposite of true.
    // The file id is still known, so the deep link stays usable.
    expect(detail.answers[0].file).toMatchObject({ fileId: 'file-1', isResolved: false });
  });

  it('reports no file at all when the answer holds no FileID', () => {
    const detail = buildResponseDetail(
      detailInput({
        answers: [answer('r1', 'qt', { TextValue: 'just text' })],
        questions: [q('qt', 'ShortText')],
      }),
    );
    expect(detail.answers[0].file).toBeNull();
  });

  it('still names the file when the provenance row carries no FileName', () => {
    const detail = buildResponseDetail(
      detailInput({
        answers: [answer('r1', 'qf', { FileID: 'file-1' })],
        questions: [q('qf', 'FileUpload')],
        uploads: [upload('file-1', { FileName: null })],
      }),
    );
    expect(detail.answers[0].file?.fileName).toBe('Unnamed file');
  });
});

describe('buildResponseDetail — what the submission did', () => {
  it('reports each automation attempt with its status, name and duration', () => {
    const started = new Date('2026-08-18T10:00:00Z');
    const completed = new Date('2026-08-18T10:00:12Z');
    const detail = buildResponseDetail(
      detailInput({
        automationRuns: [
          automationRun('run-1', 'Succeeded', {
            StartedAt: started,
            CompletedAt: completed,
            FormAutomation: 'Send confirmation email',
            ActionExecutionLogID: 'log-1',
          }),
        ],
      }),
    );
    expect(detail.automationRuns[0]).toMatchObject({
      runId: 'run-1',
      automationName: 'Send confirmation email',
      status: 'Succeeded',
      durationSeconds: 12,
      actionExecutionLogId: 'log-1',
    });
  });

  it('leaves duration null while a run is still in flight', () => {
    const detail = buildResponseDetail(
      detailInput({
        automationRuns: [automationRun('run-1', 'Running', { StartedAt: new Date() })],
      }),
    );
    expect(detail.automationRuns[0].durationSeconds).toBeNull();
  });

  it('keeps the error message of a failed run', () => {
    const detail = buildResponseDetail(
      detailInput({
        automationRuns: [
          automationRun('run-1', 'Failed', { ErrorMessage: 'SMTP refused', AttemptCount: 3 }),
        ],
      }),
    );
    expect(detail.automationRuns[0]).toMatchObject({
      status: 'Failed',
      errorMessage: 'SMTP refused',
      attemptCount: 3,
    });
  });

  it('resolves the binding ledger target entity to its display name', () => {
    const detail = buildResponseDetail(
      detailInput({
        bindingRecords: [
          bindingRecord('br-1', 'Created', {
            TargetEntityID: 'e-people',
            TargetRecordID: 'person-9',
            WrittenFields: JSON.stringify(['FirstName', 'Email']),
          }),
        ],
        entityNameById: new Map([['e-people', 'MJ_BizApps_Common: People']]),
      }),
    );
    expect(detail.bindingRecords[0]).toMatchObject({
      outcome: 'Created',
      targetEntityName: 'MJ_BizApps_Common: People',
      targetRecordId: 'person-9',
      writtenFields: ['FirstName', 'Email'],
    });
  });

  it('leaves the entity name null when metadata cannot name it, so no broken link is offered', () => {
    const detail = buildResponseDetail(
      detailInput({ bindingRecords: [bindingRecord('br-1', 'Merged', { TargetEntityID: 'e-unknown' })] }),
    );
    expect(detail.bindingRecords[0].targetEntityName).toBeNull();
    // The id still identifies the row for anyone debugging it.
    expect(detail.bindingRecords[0].targetEntityId).toBe('e-unknown');
  });

  it('treats unparseable WrittenFields as none written rather than throwing', () => {
    const detail = buildResponseDetail(
      detailInput({ bindingRecords: [bindingRecord('br-1', 'Created', { WrittenFields: '{not json' })] }),
    );
    expect(detail.bindingRecords[0].writtenFields).toEqual([]);
  });

  it('keeps the answers when a satellite section could not be read, and names what is missing', () => {
    // Losing Read on Form Automation Runs must cost the user that SECTION, not the whole
    // response. The answers are the primary content; the sections are context.
    const detail = buildResponseDetail(
      detailInput({
        answers: [answer('r1', 'qt', { TextValue: 'still here' })],
        questions: [q('qt', 'ShortText')],
        unavailableSections: ['automation runs'],
      }),
    );
    expect(detail.answers).toHaveLength(1);
    expect(detail.automationRuns).toEqual([]);
    expect(detail.unavailableSections).toEqual(['automation runs']);
  });

  it('reports nothing unavailable on a clean load', () => {
    expect(buildResponseDetail(detailInput()).unavailableSections).toEqual([]);
  });

  it('reports no runs and no binding records for a submission that triggered nothing', () => {
    const detail = buildResponseDetail(detailInput());
    expect(detail.automationRuns).toEqual([]);
    expect(detail.bindingRecords).toEqual([]);
  });
});
