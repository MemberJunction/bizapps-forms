/**
 * `buildResponseDetail` over what `Forms.GetResponseDetail` returns (#303), and the list row mapping.
 *
 * The server sends STORED rows plus the labelling definition; every rule about how they read —
 * order, labels, files, what the submission did, who responded — is the client's, and pinned here.
 * Rules the server owns (Complete-only list, answered counts, respondent label in the list) are
 * pinned by `FormReportingEngine.spec.ts`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  FormsGetResponseDetailOutput,
  FormsResponseAutomationRun,
  FormsStoredAnswer,
  PublishedFormQuestion,
} from '@mj-biz-apps/forms-entities';
import { buildResponseDetail, parseDefinitionQuestions, toResponseListRow } from './response-aggregations';
import { q } from '../shared/testing/entity-row-fixtures';

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  return { ...actual, LogError: vi.fn() };
});
const { LogError } = await import('@memberjunction/core');

afterEach(() => {
  vi.mocked(LogError).mockClear();
});

const CHOICE = q('q-colour', 'SingleChoice', 2, [
  { id: 'o1', label: 'Red', value: 'r', displayOrder: 1 },
  { id: 'o2', label: 'Green', value: 'g', displayOrder: 2 },
]);
const YESNO = q('q-return', 'YesNo', 3);
const FILE = q('q-cv', 'FileUpload', 4);
const FIRST = { ...q('q-first', 'ShortText', 0), prompt: 'First name' };
const LAST = { ...q('q-last', 'ShortText', 1), prompt: 'Last name' };
const EMAIL = { ...q('q-email', 'Email', 5), prompt: 'Email' };

function definition(questions: PublishedFormQuestion[]): string {
  return JSON.stringify({ pages: [{ id: 'p1', displayOrder: 0, questions }] });
}

function stored(questionId: string, columns: Partial<FormsStoredAnswer> = {}): FormsStoredAnswer {
  return {
    ID: `a-${questionId}`,
    QuestionID: questionId,
    TextValue: null,
    NumericValue: null,
    DateValue: null,
    BooleanValue: null,
    JSONValue: null,
    FileID: null,
    ...columns,
  };
}

function run(overrides: Partial<FormsResponseAutomationRun> = {}): FormsResponseAutomationRun {
  return {
    ID: 'run-1',
    FormAutomationID: 'auto-1',
    FormAutomation: 'Send confirmation',
    Status: 'Succeeded',
    AttemptCount: 1,
    FormAutomationEventID: null,
    StartedAt: '2026-09-01T10:00:00.000Z',
    CompletedAt: '2026-09-01T10:00:02.500Z',
    ErrorMessage: null,
    OutputSummary: null,
    ActionExecutionLogID: null,
    AIAgentRunID: null,
    ...overrides,
  };
}

function output(overrides: Partial<FormsGetResponseDetailOutput> = {}): FormsGetResponseDetailOutput {
  return {
    Response: {
      ID: 'resp-1',
      FormID: 'form-1',
      FormVersionID: 'ver-1',
      Status: 'Complete',
      StartedAt: '2026-09-01T09:58:00.000Z',
      SubmittedAt: '2026-09-01T10:00:00.000Z',
      RespondentPersonID: null,
      RespondentPerson: null,
    },
    Answers: [],
    Uploads: [],
    AutomationRuns: [],
    AutomationEvents: [],
    BindingRecords: [],
    LabelFormVersionID: 'ver-1',
    DefinitionJSON: definition([FIRST, LAST, CHOICE, YESNO, FILE, EMAIL]),
    UnavailableSections: [],
    ...overrides,
  };
}

describe('toResponseListRow', () => {
  it('carries the server-derived respondent and answered count, with instants as Dates', () => {
    expect(
      toResponseListRow({
        ResponseID: 'r1',
        Status: 'Complete',
        FormVersionID: 'v1',
        StartedAt: '2026-09-01T10:00:00.000Z',
        SubmittedAt: null,
        RespondentPersonID: null,
        Respondent: 'Ada Lovelace',
        AnsweredCount: 7,
      }),
    ).toEqual({
      responseId: 'r1',
      status: 'Complete',
      startedAt: new Date('2026-09-01T10:00:00.000Z'),
      submittedAt: null,
      respondent: 'Ada Lovelace',
      answeredCount: 7,
    });
  });
});

describe('buildResponseDetail — answers', () => {
  it('orders answers by the form, label-maps choices and renders booleans, whatever order they arrive in', () => {
    const detail = buildResponseDetail(
      output({ Answers: [stored('q-return', { BooleanValue: false }), stored('q-colour', { TextValue: 'g' }), stored('q-last', { TextValue: 'Lovelace' })] }),
    );

    expect(detail.answers.map((a) => [a.prompt, a.displayValue])).toEqual([
      ['Last name', 'Lovelace'],
      ['Prompt q-colour', 'Green'],
      ['Prompt q-return', 'No'],
    ]);
  });

  it('matches answers to questions whatever GUID casing the server read them in', () => {
    const upper = 'AAAAAAAA-0000-4000-8000-000000000001';
    const detail = buildResponseDetail(
      output({ Answers: [stored(upper, { TextValue: 'r' })], DefinitionJSON: definition([{ ...CHOICE, id: upper.toLowerCase() }]) }),
    );

    expect(detail.answers.map((a) => a.displayValue)).toEqual(['Red']);
    expect(detail.unlabelledAnswerCount).toBe(0);
  });

  it('counts an answer whose question is gone from the labelling version, rather than dropping it silently', () => {
    const detail = buildResponseDetail(output({ Answers: [stored('q-colour', { TextValue: 'r' }), stored('q-deleted', { TextValue: 'orphan' })] }));

    expect(detail.answers).toHaveLength(1);
    expect(detail.unlabelledAnswerCount).toBe(1);
    expect(detail.labelsMissing).toBe(false);
  });

  it('says the labels are missing when the version has no definition, and shows no answer under a guessed prompt', () => {
    const detail = buildResponseDetail(output({ Answers: [stored('q-colour', { TextValue: 'r' })], DefinitionJSON: null }));

    expect(detail).toMatchObject({ labelsMissing: true, answers: [], unlabelledAnswerCount: 1 });
  });

  it('treats a malformed definition the same way, and logs which version and response it was', () => {
    const detail = buildResponseDetail(output({ DefinitionJSON: '{"pages":' }));

    expect(detail.labelsMissing).toBe(true);
    expect(vi.mocked(LogError).mock.calls.flat().join(' ')).toMatch(/ver-1.*resp-1/);
  });
});

describe('buildResponseDetail — the pinned version could not be read (record view)', () => {
  it('still shows what the submission did, says the labels are missing, and names the unavailable section', () => {
    const detail = buildResponseDetail(
      output({
        Answers: [stored('q-colour', { TextValue: 'r' })],
        DefinitionJSON: null,
        UnavailableSections: ['question labels'],
        AutomationRuns: [run()],
      }),
    );

    expect(detail).toMatchObject({ labelsMissing: true, unavailableSections: ['question labels'], unlabelledAnswerCount: 1 });
    expect(detail.automationRuns).toHaveLength(1);
  });
});

describe('parseDefinitionQuestions', () => {
  it('flattens pages and questions in display order', () => {
    const json = JSON.stringify({
      pages: [
        { id: 'p2', displayOrder: 1, questions: [q('b', 'ShortText', 0)] },
        { id: 'p1', displayOrder: 0, questions: [q('a2', 'ShortText', 1), q('a1', 'ShortText', 0)] },
      ],
    });
    expect(parseDefinitionQuestions(json, 'test')?.map((x) => x.id)).toEqual(['a1', 'a2', 'b']);
  });

  it('returns null for JSON that is not a definition, and logs it', () => {
    expect(parseDefinitionQuestions('{"name":"x"}', 'version v9')).toBeNull();
    expect(vi.mocked(LogError).mock.calls.flat().join(' ')).toContain('version v9');
  });
});

describe('buildResponseDetail — file answers', () => {
  it('names the uploaded file, its size, and flags a revoked one', () => {
    const detail = buildResponseDetail(
      output({
        Answers: [stored('q-cv', { FileID: 'FILE-1' })],
        Uploads: [{ ID: 'u1', FileID: 'file-1', FileName: 'cv.pdf', ContentType: 'application/pdf', SizeBytes: 2048, Status: 'Revoked' }],
      }),
    );

    expect(detail.answers[0].file).toEqual({
      fileId: 'file-1',
      fileName: 'cv.pdf',
      contentType: 'application/pdf',
      sizeBytes: 2048,
      isRevoked: true,
      isResolved: true,
    });
  });

  it('still shows that a file was submitted when its provenance row did not come back', () => {
    const detail = buildResponseDetail(output({ Answers: [stored('q-cv', { FileID: 'file-9' })] }));

    expect(detail.answers[0].file).toMatchObject({ fileId: 'file-9', isResolved: false, fileName: 'File (details unavailable)' });
  });

  it('names an upload that carries no file name, and reports no file for an answer without one', () => {
    const named = buildResponseDetail(
      output({
        Answers: [stored('q-cv', { FileID: 'f1' })],
        Uploads: [{ ID: 'u1', FileID: 'f1', FileName: null, ContentType: null, SizeBytes: null, Status: 'Active' }],
      }),
    );
    const none = buildResponseDetail(output({ Answers: [stored('q-colour', { TextValue: 'r' })] }));

    expect(named.answers[0].file?.fileName).toBe('Unnamed file');
    expect(none.answers[0].file).toBeNull();
  });
});

describe('buildResponseDetail — what the submission did', () => {
  it('reports each step with its attempt and automation event, not a run count', () => {
    const detail = buildResponseDetail(output({ AutomationRuns: [run({ AttemptCount: 3, FormAutomationEventID: 'msg-7' })] }));

    expect(detail.automationRuns).toEqual([
      expect.objectContaining({ automationName: 'Send confirmation', status: 'Succeeded', deliveryAttempt: 3, automationEventId: 'msg-7', durationSeconds: 2.5 }),
    ]);
  });

  it('shows what a step said in words — no JSON envelope, no record id (click-through observation 2)', () => {
    const detail = buildResponseDetail(
      output({ AutomationRuns: [run({ OutputSummary: '{"summary":"Skipped 44C5700D-7BA4-4838-B00F-3B6F11D6E8C6"}' })] }),
    );

    expect(detail.automationRuns[0].outputSummary).toBe('Skipped');
  });

  it('leaves the duration null while a step is still in flight, and keeps a failure message', () => {
    const detail = buildResponseDetail(output({ AutomationRuns: [run({ Status: 'Running', CompletedAt: null, ErrorMessage: 'boom' })] }));

    expect(detail.automationRuns[0]).toMatchObject({ durationSeconds: null, errorMessage: 'boom' });
  });

  it('takes the target entity name the server resolved, and leaves it null (no link) when there was none', () => {
    const detail = buildResponseDetail(
      output({
        BindingRecords: [
          { ID: 'b1', BindingID: 'bd', Binding: 'To People', TargetEntityID: 'e1', TargetEntityName: 'MJ_BizApps_Common: People', TargetRecordID: 'p1', Outcome: 'Created', WrittenFields: '["FirstName"]' },
          { ID: 'b2', BindingID: 'bd', Binding: 'To People', TargetEntityID: 'e2', TargetEntityName: null, TargetRecordID: null, Outcome: 'Skipped', WrittenFields: 'not json' },
        ],
      }),
    );

    expect(detail.bindingRecords.map((b) => [b.targetEntityName, b.writtenFields])).toEqual([
      ['MJ_BizApps_Common: People', ['FirstName']],
      [null, []],
    ]);
    expect(vi.mocked(LogError).mock.calls.flat().join(' ')).toContain('b2');
  });

  it('carries each automation event, oldest first, with its settled instant as a Date (#311)', () => {
    const detail = buildResponseDetail(
      output({
        AutomationEvents: [
          { ID: 'evt-1', Trigger: 'OnPartial', Status: 'Complete', AttemptCount: 1, LastError: null, CompletedAt: '2026-09-01T09:59:00.000Z' },
          { ID: 'evt-2', Trigger: 'OnComplete', Status: 'DeadLetter', AttemptCount: 5, LastError: 'Provider timed out', CompletedAt: null },
        ],
      }),
    );

    expect(detail.automationEvents).toEqual([
      { eventId: 'evt-1', trigger: 'OnPartial', status: 'Complete', attemptCount: 1, lastError: null, completedAt: new Date('2026-09-01T09:59:00.000Z') },
      { eventId: 'evt-2', trigger: 'OnComplete', status: 'DeadLetter', attemptCount: 5, lastError: 'Provider timed out', completedAt: null },
    ]);
  });

  it('passes the sections the caller could not read through, so the view says MISSING rather than empty', () => {
    expect(buildResponseDetail(output({ UnavailableSections: ['automation runs'] })).unavailableSections).toEqual(['automation runs']);
  });
});

describe('who responded', () => {
  it('prefers the linked Person', () => {
    const detail = buildResponseDetail(
      output({ Response: { ...output().Response, RespondentPerson: 'Grace Hopper' }, Answers: [stored('q-first', { TextValue: 'Ada' })] }),
    );
    expect(detail.respondent).toBe('Grace Hopper');
  });

  it('builds a name from the first and last name answers, else the email, else Anonymous', () => {
    const named = buildResponseDetail(output({ Answers: [stored('q-last', { TextValue: 'Lovelace' }), stored('q-first', { TextValue: 'Ada' })] }));
    const emailed = buildResponseDetail(output({ Answers: [stored('q-email', { TextValue: 'ada@example.org' })] }));
    const anonymous = buildResponseDetail(output({ Answers: [stored('q-colour', { TextValue: 'r' })] }));

    expect([named.respondent, emailed.respondent, anonymous.respondent]).toEqual(['Ada Lovelace', 'ada@example.org', 'Anonymous']);
  });
});
