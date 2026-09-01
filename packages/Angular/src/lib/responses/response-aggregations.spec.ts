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

describe('answeredCount counts answers, not rows', () => {
  it('ignores a row that stored nothing', () => {
    // Every answerable question a respondent reaches can leave a row behind, including the
    // ones they left blank, so counting rows reports questions SEEN rather than questions
    // answered. The list column is headed "Answered" and is the only completeness signal a
    // reader gets per response.
    const rows = buildResponseRows(
      [response('r1', 'Complete', new Date(), new Date())],
      [
        answer('r1', 'qa', { TextValue: '' }),
        answer('r1', 'qb', { TextValue: '   ' }),
        answer('r1', 'qc', { TextValue: 'real' }),
      ],
      [q('qa', 'ShortText', 0), q('qb', 'ShortText', 1), q('qc', 'ShortText', 2)],
    );
    expect(rows[0].answeredCount).toBe(1);
  });

  it('counts answers that are falsy but real', () => {
    // The trap in the fix: `0`, `false` and a stored file are all answers. Testing for
    // emptiness rather than falsiness is what keeps them counted.
    const rows = buildResponseRows(
      [response('r1', 'Complete', new Date(), new Date())],
      [
        answer('r1', 'qn', { NumericValue: 0 }),
        answer('r1', 'qb', { BooleanValue: false }),
        answer('r1', 'qf', { FileID: 'file-1' }),
      ],
      [q('qn', 'Number', 0), q('qb', 'YesNo', 1), q('qf', 'FileUpload', 2)],
    );
    expect(rows[0].answeredCount).toBe(3);
  });

  it('counts a composite answer stored as JSON', () => {
    const rows = buildResponseRows(
      [response('r1', 'Complete', new Date(), new Date())],
      [answer('r1', 'qa', { JSONValue: JSON.stringify({ city: 'Leeds' }) })],
      [q('qa', 'Address', 0)],
    );
    expect(rows[0].answeredCount).toBe(1);
  });
});

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

  it('renders a Time answer as the clock the respondent entered, from the stored UTC instant', () => {
    // Stored as the clock on the epoch date in UTC (#116). The reader has to give back `14:30`,
    // not `1970-01-01T14:30:00.000Z` — the epoch date is an anchor, not part of the answer.
    const time = q('qt', 'Time', 2);
    expect(renderAnswer(time, answer('r1', 'qt', { DateValue: new Date('1970-01-01T14:30:00.000Z') }))).toBe('14:30');
    // Over GraphQL the column arrives as a string; the same reading applies.
    expect(renderAnswer(time, answer('r1', 'qt', { DateValue: '1970-01-01T09:05:00Z' as unknown as Date }))).toBe('09:05');
    expect(renderAnswer(time, answer('r1', 'qt', { DateValue: null }))).toBe('');
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

describe('the AI score is not surfaced', () => {
  /**
   * `Forms: Analyze Written Responses` scores every ShortText answer, so a form asking
   * for a first name stamped "Soham" with a 100. The columns still exist and the
   * automation still runs; the view model deliberately does not carry them, so the
   * meaningless number cannot reappear in the detail view by accident.
   */
  it('omits score fields from the answer view even when the row carries them', () => {
    const detail = buildResponseDetail(
      detailInput({
        questions: [{ ...q('q-name', 'ShortText', 1), prompt: 'First name' }],
        answers: [
          answer('r1', 'q-name', {
            TextValue: 'Soham',
            Score: 100,
            ScoreRationale: 'A confident, well-formed first name.',
          }),
        ],
      }),
    );
    expect(detail.answers).toHaveLength(1);
    expect(detail.answers[0].displayValue).toBe('Soham');
    expect(Object.keys(detail.answers[0])).not.toContain('score');
    expect(Object.keys(detail.answers[0])).not.toContain('scoreRationale');
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

/**
 * Regressions for two bugs that shipped past the whole existing suite, because every
 * spec above happened to use one answer, or answers already in question order, or a
 * response with a linked Person.
 */
describe('answers are ordered by the form, not by the query', () => {
  /** A form asking first name then last name; the view returns them the other way round. */
  function outOfOrderInput() {
    const first = { ...q('q-first', 'ShortText', 1), prompt: 'First name' };
    const last = { ...q('q-last', 'ShortText', 2), prompt: 'Last name' };
    return detailInput({
      questions: [first, last],
      answers: [
        answer('r1', 'q-last', { TextValue: 'Desai' }),
        answer('r1', 'q-first', { TextValue: 'Soham' }),
      ],
    });
  }

  it('renders questions in display order however the answers arrive', () => {
    const detail = buildResponseDetail(outOfOrderInput());
    expect(detail.answers.map((a) => a.prompt)).toEqual(['First name', 'Last name']);
    expect(detail.answers.map((a) => a.displayValue)).toEqual(['Soham', 'Desai']);
  });

  it('skips questions this response did not answer rather than emitting blanks', () => {
    const detail = buildResponseDetail(
      detailInput({
        questions: [
          { ...q('q-first', 'ShortText', 1), prompt: 'First name' },
          { ...q('q-skipped', 'ShortText', 2), prompt: 'Middle name' },
        ],
        answers: [answer('r1', 'q-first', { TextValue: 'Soham' })],
      }),
    );
    expect(detail.answers.map((a) => a.prompt)).toEqual(['First name']);
  });

  it('still counts an answer whose question is gone from the snapshot', () => {
    const detail = buildResponseDetail(
      detailInput({
        questions: [{ ...q('q-first', 'ShortText', 1), prompt: 'First name' }],
        answers: [
          answer('r1', 'q-first', { TextValue: 'Soham' }),
          answer('r1', 'q-deleted', { TextValue: 'orphaned' }),
        ],
      }),
    );
    expect(detail.answers).toHaveLength(1);
    expect(detail.unlabelledAnswerCount).toBe(1);
  });
});

describe('a respondent who told us who they are is not "Anonymous"', () => {
  const nameQuestions = [
    { ...q('q-first', 'ShortText', 1), prompt: 'First name' },
    { ...q('q-last', 'ShortText', 2), prompt: 'Last name' },
    { ...q('q-email', 'Email', 3), prompt: 'Email address' },
  ];
  const nameAnswers = [
    answer('r1', 'q-first', { TextValue: 'Soham' }),
    answer('r1', 'q-last', { TextValue: 'Desai' }),
    answer('r1', 'q-email', { TextValue: 'soham@example.com' }),
  ];

  it('builds a name from the first/last answers on the detail view', () => {
    const detail = buildResponseDetail(
      detailInput({ questions: nameQuestions, answers: nameAnswers }),
    );
    expect(detail.respondent).toBe('Soham Desai');
  });

  it('does the same in the list, so the two surfaces never disagree', () => {
    const rows = buildResponseRows(
      [response('r1', 'Complete', new Date(), new Date())],
      nameAnswers,
      nameQuestions,
    );
    expect(rows[0].respondent).toBe('Soham Desai');
  });

  it('falls back to the email address when the form never asked for a name', () => {
    const detail = buildResponseDetail(
      detailInput({
        questions: [{ ...q('q-email', 'Email', 1), prompt: 'Email address' }],
        answers: [answer('r1', 'q-email', { TextValue: 'soham@example.com' })],
      }),
    );
    expect(detail.respondent).toBe('soham@example.com');
  });

  it('prefers the linked Person over anything the form collected', () => {
    const detail = buildResponseDetail(
      detailInput({
        response: response('r1', 'Complete', new Date(), new Date(), {
          RespondentPerson: 'Person Of Record',
        }),
        questions: nameQuestions,
        answers: nameAnswers,
      }),
    );
    expect(detail.respondent).toBe('Person Of Record');
  });

  it('still says Anonymous when the form asked for neither name nor email', () => {
    const detail = buildResponseDetail(
      detailInput({
        questions: [{ ...q('q-nps', 'NPS', 1), prompt: 'How likely are you to recommend us?' }],
        answers: [answer('r1', 'q-nps', { NumericValue: 9 })],
      }),
    );
    expect(detail.respondent).toBe('Anonymous');
  });
});
