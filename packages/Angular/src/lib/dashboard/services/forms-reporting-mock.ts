/**
 * Seeded mock data for the Forms reporting dashboard (WP-F).
 *
 * Lets the dashboard render end-to-end before any real responses exist in the
 * DB. The swap to live data is trivial: the dashboard calls
 * `FormsReportingService` when `useMock` is false and these builders when true.
 * The shapes returned here are EXACTLY what the service produces, so no UI code
 * changes between the two modes.
 */
import type {
  PublishedFormDefinition,
  PublishedFormQuestion,
  mjBizAppsFormsFormResponseEntityType,
  mjBizAppsFormsFormResponseAnswerEntityType,
} from '@mj-biz-apps/forms-entities';
import type { FormReportData, ReportableForm } from '../models/reporting.model';
import {
  flattenQuestions,
  buildSummary,
  buildBreakdowns,
  buildFunnel,
  buildResponseRows,
} from './reporting-aggregations';

const MOCK_FORM: ReportableForm = {
  formId: 'mock-form-0001',
  formVersionId: 'mock-version-0001',
  name: 'Customer Satisfaction Survey (sample)',
  responseCount: 42,
};

/** Builds the sample published definition used by the mock report. */
export function mockDefinition(): PublishedFormDefinition {
  const q = (
    id: string,
    type: PublishedFormQuestion['type'],
    prompt: string,
    options: { id: string; label: string; value: string; displayOrder: number }[] = [],
    displayOrder = 0,
  ): PublishedFormQuestion => ({
    id,
    type,
    prompt,
    isRequired: false,
    displayOrder,
    options,
    settings: {},
  });

  return {
    formId: MOCK_FORM.formId,
    formVersionId: MOCK_FORM.formVersionId,
    name: MOCK_FORM.name,
    renderMode: 'Scroll',
    settings: { anonymousAllowed: true, captchaRequired: false },
    styleTokens: { cssVariables: {} },
    pages: [
      {
        id: 'pg-1',
        title: 'About you',
        displayOrder: 0,
        questions: [
          q('q-channel', 'SingleChoice', 'How did you hear about us?', [
            { id: 'o1', label: 'Search', value: 'search', displayOrder: 0 },
            { id: 'o2', label: 'Social media', value: 'social', displayOrder: 1 },
            { id: 'o3', label: 'Friend', value: 'friend', displayOrder: 2 },
            { id: 'o4', label: 'Other', value: 'other', displayOrder: 3 },
          ], 0),
          q('q-features', 'MultiChoice', 'Which features do you use?', [
            { id: 'f1', label: 'Reporting', value: 'reporting', displayOrder: 0 },
            { id: 'f2', label: 'Forms', value: 'forms', displayOrder: 1 },
            { id: 'f3', label: 'Automation', value: 'automation', displayOrder: 2 },
          ], 1),
        ],
      },
      {
        id: 'pg-2',
        title: 'Your experience',
        displayOrder: 1,
        questions: [
          q('q-rating', 'Rating', 'Rate your overall experience (1-5)', [], 0),
          q('q-nps', 'NPS', 'How likely are you to recommend us? (0-10)', [], 1),
          q('q-recommend', 'YesNo', 'Would you use us again?', [], 2),
          q('q-comments', 'LongText', 'Any additional comments?', [], 3),
        ],
      },
    ],
  };
}

/** Builds the full mock report bundle. */
export function mockReport(): FormReportData {
  const definition = mockDefinition();
  const questions = flattenQuestions(definition);
  const responses = mockResponses();
  const answers = mockAnswers(responses);

  return {
    form: MOCK_FORM,
    questions,
    summary: buildSummary(responses),
    breakdowns: buildBreakdowns(questions, answers),
    funnel: buildFunnel(definition, answers),
    responses: buildResponseRows(responses, answers),
  };
}

/** The single mock reportable form (for the picker). */
export function mockReportableForms(): ReportableForm[] {
  return [MOCK_FORM];
}

type ResponseRow = mjBizAppsFormsFormResponseEntityType;
type AnswerRow = mjBizAppsFormsFormResponseAnswerEntityType;

function mockResponses(): ResponseRow[] {
  const rows: ResponseRow[] = [];
  const now = Date.now();
  for (let i = 0; i < 42; i++) {
    const complete = i % 4 !== 0; // ~75% complete
    const started = new Date(now - i * 3_600_000);
    const submitted = complete ? new Date(started.getTime() + (90 + (i % 7) * 30) * 1000) : null;
    rows.push(stubResponse(`r-${i}`, complete ? 'Complete' : 'Partial', started, submitted, i));
  }
  return rows;
}

function stubResponse(
  id: string,
  status: 'Complete' | 'Partial',
  started: Date,
  submitted: Date | null,
  i: number,
): ResponseRow {
  return {
    ID: id,
    FormID: MOCK_FORM.formId,
    FormVersionID: MOCK_FORM.formVersionId,
    Status: status,
    AnonymousSessionID: `sess-${id}`,
    RespondentPersonID: null,
    StartedAt: started,
    SubmittedAt: submitted,
    SourceMetadata: null,
    __mj_CreatedAt: started,
    __mj_UpdatedAt: submitted ?? started,
    Form: MOCK_FORM.name,
    RespondentPerson: i % 5 === 0 ? `Sample Person ${i}` : null,
  };
}

function mockAnswers(responses: ResponseRow[]): AnswerRow[] {
  const channels = ['search', 'social', 'friend', 'other'];
  const out: AnswerRow[] = [];
  let aid = 0;
  for (let i = 0; i < responses.length; i++) {
    const r = responses[i];
    const push = (
      questionId: string,
      vals: Partial<Pick<AnswerRow, 'TextValue' | 'NumericValue' | 'BooleanValue' | 'JSONValue'>>,
    ) => out.push(stubAnswer(`a-${aid++}`, r.ID, questionId, vals));

    // Page 1 — everyone answers
    push('q-channel', { TextValue: channels[i % channels.length] });
    push('q-features', { JSONValue: JSON.stringify(i % 2 === 0 ? ['reporting', 'forms'] : ['automation']) });

    // Page 2 — only complete responses go this far (drives the funnel)
    if (r.Status === 'Complete') {
      push('q-rating', { NumericValue: 1 + (i % 5) });
      push('q-nps', { NumericValue: i % 11 });
      push('q-recommend', { BooleanValue: i % 3 !== 0 });
      if (i % 2 === 0) {
        push('q-comments', { TextValue: `Sample comment from respondent ${i}.` });
      }
    }
  }
  return out;
}

function stubAnswer(
  id: string,
  responseId: string,
  questionId: string,
  vals: Partial<Pick<AnswerRow, 'TextValue' | 'NumericValue' | 'BooleanValue' | 'JSONValue'>>,
): AnswerRow {
  const now = new Date();
  return {
    ID: id,
    ResponseID: responseId,
    QuestionID: questionId,
    TextValue: vals.TextValue ?? null,
    NumericValue: vals.NumericValue ?? null,
    DateValue: null,
    BooleanValue: vals.BooleanValue ?? null,
    JSONValue: vals.JSONValue ?? null,
    FileID: null,
    Score: null,
    ScoreRationale: null,
    __mj_CreatedAt: now,
    __mj_UpdatedAt: now,
    File: null,
  };
}
