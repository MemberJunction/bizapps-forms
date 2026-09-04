/**
 * A failed save tells the respondent one authored sentence and tells the log everything.
 *
 * `LatestResult.CompleteMessage` is MJ's OPERATOR diagnostic: the SQL provider fills it with the
 * driver's error plus the entire T-SQL batch it ran — database name, schema, table, constraint,
 * stored-procedure names, parameter values. Persistence used to return it as the failure's
 * `message`, the pipeline put it in `FormSubmissionResult.errors[]`, and the widget rendered it
 * to the anonymous respondent inside an HTTP 200 — on a production-configured host too, because
 * it is the resolver's own typed field and no Apollo setting touches it (issue #119).
 *
 * The fake's `CompleteMessage` is a stand-in for that text: what matters is that NONE of it
 * reaches the result, and ALL of it reaches the server log with the entity it came from.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { persistSubmission, SAVE_FAILED_MESSAGE, withoutQueryEcho, type PersistenceInputs } from '../persistence.service';
import { expectPersistFailure, makeContextUser, makeDefinition, makeFakeProvider, respondentPermissions } from './fakes';

const RESPONSE_ENTITY = 'MJ_BizApps_Forms: Form Responses';
const ANSWER_ENTITY = 'MJ_BizApps_Forms: Form Response Answers';
/** What `makeFakeProvider` puts on `LatestResult.CompleteMessage` when `failSaveFor` fires. */
const DRIVER_DETAIL = 'forced save failure';

function inputs(): PersistenceInputs {
  const definition = makeDefinition();
  const question = definition.pages[0].questions[0];
  return {
    formId: definition.formId,
    formVersionId: definition.formVersionId,
    distributionId: 'dist-1',
    complete: true,
    sessionId: 'session-1',
    sourceMetadata: {},
    answers: [{ question, input: { questionId: question.id, textValue: 'an answer' } }],
  };
}

let logged: string[];

beforeEach(() => {
  logged = [];
  // `LogError` always reaches console.error, in production too — unlike `LogStatus`, which MJ
  // silences under NODE_ENV=production. That is the property the assertion below depends on.
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    logged.push(args.map(String).join(' '));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a failed save never hands the respondent the driver diagnostic', () => {
  it.each([
    ['the response row', RESPONSE_ENTITY],
    ['an answer row', ANSWER_ENTITY],
  ])('returns the authored message when saving %s fails', async (_what, entityName) => {
    const fake = makeFakeProvider({ createPermissions: respondentPermissions(), failSaveFor: entityName });

    const result = expectPersistFailure(await persistSubmission(fake.provider, inputs(), makeContextUser()));

    expect(result.message).toBe(SAVE_FAILED_MESSAGE);
    expect(result.message).not.toContain(DRIVER_DETAIL);
  });

  it('logs the driver diagnostic server-side, naming the entity it came from', async () => {
    const fake = makeFakeProvider({ createPermissions: respondentPermissions(), failSaveFor: ANSWER_ENTITY });

    await persistSubmission(fake.provider, inputs(), makeContextUser());

    const line = logged.find((l) => l.includes(DRIVER_DETAIL));
    expect(line, 'the detail the respondent no longer sees must reach the log').toBeDefined();
    expect(line).toContain(ANSWER_ENTITY);
  });
});

/**
 * The log gets the operator's diagnostic — and NOT the respondent's answers.
 *
 * `SQLServerDataProvider` builds `CompleteMessage` as
 * `Error executing SQL\n    Error: <driver>\n    Query: <the whole T-SQL batch>\n    Parameters: <JSON>`,
 * and the batch has the answer values inlined (`SET @TextValue_… = N'…'`). Moving that string
 * verbatim from the wire to the log fixes the disclosure and creates a different one: on a forms
 * product an answer can be a diagnosis, a salary or a national identifier, and the host's error log
 * has a different audience, retention and export path from its database.
 *
 * The pipeline's own catch already made this call the other way — "the answers are deliberately not
 * logged (they are the respondent's data, and the failure is not about their content)". This makes
 * persistence agree with it. The driver's error line is what an operator debugs from; the echoed
 * statement is noise that happens to carry the payload.
 */
describe('withoutQueryEcho', () => {
  const DRIVER_DUMP = [
    'Error executing SQL',
    '    Error: The INSERT statement conflicted with the FOREIGN KEY constraint "FK_FormResponseAnswer_Question". The conflict occurred in database "MJ_ATS_Dev", table "__mj_BizAppsForms.FormQuestion", column \'ID\'.',
    '    Query: ',
    '                    DECLARE @ID_741ffd3b UNIQUEIDENTIFIER,',
    '        @TextValue_741ffd3b NVARCHAR(MAX)',
    "                    SET @TextValue_741ffd3b = N'my diagnosis is hypertension'",
    '                    EXEC [__mj_BizAppsForms].spCreateFormResponseAnswer @ID=@ID_741ffd3b;',
    '    Parameters: None',
  ].join('\n');

  it('keeps the driver error line, which is what an operator debugs from', () => {
    const detail = withoutQueryEcho(DRIVER_DUMP);

    expect(detail).toContain('Error executing SQL');
    expect(detail).toContain('FK_FormResponseAnswer_Question');
    expect(detail).toContain('MJ_ATS_Dev');
  });

  it('drops the echoed statement, and with it the respondent answer inlined in it', () => {
    const detail = withoutQueryEcho(DRIVER_DUMP);

    expect(detail).not.toContain('my diagnosis is hypertension');
    expect(detail).not.toContain('DECLARE @');
    expect(detail).not.toContain('spCreateFormResponseAnswer');
    expect(detail).not.toContain('Parameters:');
  });

  it('leaves a diagnostic that carries no echoed statement exactly as it was', () => {
    // MJ's own not-null and validation failures come through `CompleteMessage` too, and they are
    // short, answer-free, and the most useful thing in the log when they happen.
    const validation = 'Field Email is required and cannot be null';

    expect(withoutQueryEcho(validation)).toBe(validation);
  });

  it('never returns an empty diagnostic, whatever it is handed', () => {
    // A truncation that can erase the whole line would turn a logged failure into a silent one.
    expect(withoutQueryEcho('')).not.toBe('');
    expect(withoutQueryEcho('    Query: SELECT 1')).not.toBe('');
  });
});

describe('the logged line carries the diagnostic but not the answers', () => {
  it('does not write the echoed statement to the log', async () => {
    const fake = makeFakeProvider({ createPermissions: respondentPermissions(), failSaveFor: ANSWER_ENTITY });

    await persistSubmission(fake.provider, inputs(), makeContextUser());

    const line = logged.find((l) => l.includes('[Forms] inserting'));
    expect(line, 'the failure must still be logged').toBeDefined();
    expect(line).not.toContain('DECLARE @');
    expect(line).not.toContain('Parameters:');
  });
});
