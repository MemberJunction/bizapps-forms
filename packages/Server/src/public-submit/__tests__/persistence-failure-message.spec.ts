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

import { persistSubmission, SAVE_FAILED_MESSAGE, type PersistenceInputs } from '../persistence.service';
import { makeContextUser, makeDefinition, makeFakeProvider, respondentPermissions } from './fakes';

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

    const result = await persistSubmission(fake.provider, inputs(), makeContextUser());

    expect(result.ok).toBe(false);
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
