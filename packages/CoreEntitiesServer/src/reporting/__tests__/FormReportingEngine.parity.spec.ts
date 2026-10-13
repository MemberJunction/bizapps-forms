/**
 * DW16 (spec #303): `Forms.GetResponseSummary` matches the old browser aggregation on a fixture.
 *
 * The SAME fixture (`parity-fixture.ts`) goes through both:
 *  - the OLD path — forms-ng's own aggregation functions, imported from the Angular package's source
 *    and driven exactly as `FormsReportingService.loadReport` drives them (insights over the Complete
 *    responses' answers, the funnel over every answer);
 *  - the NEW path — `FormReportingEngine.GetResponseSummary` against the emulated database, its three
 *    queries answered by `reporting-world.ts`.
 * and every section is compared. The browser output is mapped to the server's shape by
 * `expectedFromBrowser`, which applies ONLY the documented differences, each named where it is applied:
 *   D1  status split — the browser's `partialResponses` is every non-Complete row; the server reports
 *       Partial and Disqualified apart (their sum is the browser figure);
 *   D2  off-list choice values fold into one "Other (not an option)" bucket (a PII rule);
 *   D3  Matrix: the browser listed rendered answers (`textAnswers`, PII); the server returns cell
 *       counts — compared to the counts this fixture's Matrix answers hold;
 *   D4  shape only: PascalCase, ISO instants, `null` where the browser left a field out, the type key
 *       where the browser had a display label.
 * One more difference — `AnsweredCount` counts responses that stored a value, where the browser
 * counted rows, blank ones too — needs a blank row to show, so it has its own test below.
 *
 * Task 10 deletes the browser functions this imports; when it does, it must turn this into a golden
 * snapshot of `expectedFromBrowser`'s output rather than delete the comparison.
 */
import { describe, expect, it, vi } from 'vitest';
import type { FormsGetResponseSummaryOutput, PublishedFormDefinition } from '@mj-biz-apps/forms-entities';
import { FormReportingEngine } from '../../engines/FormReportingEngine.js';
import { browserReport, expectedFromBrowser, FIXTURE_MATRIX_CELLS } from './browser-parity.js';
import { makeVersion } from '../../testing/index.js';
import { ANSWERS, DEFINITION, FORM_ID, Q, RESPONSES, VERSION_ID, gid, type FixtureAnswer, type FixtureResponse } from './parity-fixture.js';
import { READER, SYSTEM, reportingWorld } from './reporting-world.js';

vi.mock('@memberjunction/core', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
  return { ...actual, LogError: vi.fn(), LogStatus: vi.fn() };
});

function worldFor(responses: FixtureResponse[], answers: FixtureAnswer[], definition: PublishedFormDefinition = DEFINITION) {
  const version = { ...makeVersion(definition), ID: VERSION_ID, FormID: FORM_ID };
  return reportingWorld({
    forms: [{ ID: FORM_ID, Name: 'Parity fixture', Status: 'Published' }],
    versions: [version as unknown as { ID: string }],
    responses: responses.map((r) => ({ ...r })),
    answers: answers.map((a) => ({ ...a })),
  });
}

async function serverSummary(responses: FixtureResponse[], answers: FixtureAnswer[]): Promise<FormsGetResponseSummaryOutput> {
  const db = worldFor(responses, answers);
  return FormReportingEngine.Instance.GetResponseSummary({ formId: FORM_ID }, db.provider, READER, { systemUser: SYSTEM });
}

describe('GetResponseSummary matches the old browser aggregation on a fixture (DW16)', () => {
  const expected = expectedFromBrowser(browserReport(DEFINITION, RESPONSES, ANSWERS), FIXTURE_MATRIX_CELLS);

  it('summary: the same headline, with Partial and Disqualified reported apart (D1)', async () => {
    const { Summary } = await serverSummary(RESPONSES, ANSWERS);
    const { PartialPlusDisqualified, ...rest } = expected.Summary;

    expect(Summary).toMatchObject(rest);
    expect(Summary.PartialResponses + Summary.DisqualifiedResponses).toBe(PartialPlusDisqualified);
    // The fixture is built to exercise the rules, not to sit on a default: an epoch StartedAt is
    // excluded from the median, and both non-Complete statuses are present.
    expect(Summary).toMatchObject({ TotalResponses: 5, PartialResponses: 2, DisqualifiedResponses: 1, TypicalCompletionSeconds: 150 });
  });

  it('profile: identical', async () => {
    expect((await serverSummary(RESPONSES, ANSWERS)).Profile).toEqual(expected.Profile);
  });

  it('questions: identical, apart from Other folding (D2) and Matrix cells in place of rendered answers (D3)', async () => {
    const { Questions } = await serverSummary(RESPONSES, ANSWERS);

    expect(Questions).toEqual(expected.Questions);
    // D2 is exercised, not vacuous: the browser had a bucket labelled with the raw value.
    const browserColour = browserReport(DEFINITION, RESPONSES, ANSWERS).breakdowns.find((c) => c.questionId === Q.colour);
    expect(browserColour?.buckets.map((b) => b.label)).toContain('mauve');
    expect(JSON.stringify(Questions)).not.toContain('mauve');
  });

  it('open text: identical', async () => {
    expect((await serverSummary(RESPONSES, ANSWERS)).OpenText).toEqual(expected.OpenText);
  });

  it('funnel: identical', async () => {
    expect((await serverSummary(RESPONSES, ANSWERS)).Funnel).toEqual(expected.Funnel);
  });

  it('compares sections that actually hold something (the fixture is not vacuous)', () => {
    expect(expected.Questions.map((c) => c.Role)).toEqual(['choice', 'choice', 'scale', 'scale', 'sentiment', 'consent', 'temporal', 'temporal', 'composite', 'scale']);
    expect(expected.Profile.Metrics.map((m) => m.Label)).toEqual(['Contactable', 'Distinct people', 'Work addresses', 'Phone given', 'Address given', 'Files attached']);
    expect(expected.Profile.Distributions.map((d) => d.Title)).toEqual(['Email domains', 'Countries', 'Organisations']);
    expect(expected.OpenText.map((t) => [t.Answered, t.Themes.length])).toEqual([[3, 0], [3, 3]]);
    expect(expected.Funnel.map((s) => s.Reached)).toEqual([7, 6, 0]);
    expect(expected.Questions.find((c) => c.QuestionID === Q.nps)?.Numeric).toMatchObject({ Answered: 4, Max: 99, NPSScore: 0 });
  });

  it('labels from the Published version and reports nothing capped', async () => {
    const summary = await serverSummary(RESPONSES, ANSWERS);

    expect(summary).toMatchObject({ FormID: FORM_ID, LabelVersionID: VERSION_ID, InsightAnswersCapped: false });
  });

  it('returns no answer value from the fixture anywhere in the summary', async () => {
    const shipped = JSON.stringify(await serverSummary(RESPONSES, ANSWERS));
    const values = ANSWERS.flatMap((a) => [a.TextValue, a.JSONValue]).filter((v): v is string => typeof v === 'string');
    // Each value as the respondent typed it, except a bare option value (a single letter) that is
    // also an option's VALUE — not shipped either, but too short to search for meaningfully.
    for (const value of values.filter((v) => v.length > 3)) {
      expect(shipped, value).not.toContain(value);
    }
    for (const local of ['ada@', 'grace@', 'alan@', 'linus@', '7700', '12 Row', 'Lovelace', 'orphaned']) {
      expect(shipped).not.toContain(local);
    }
  });
});

describe('AnsweredCount counts responses that stored a value (the one difference a fixture needs a blank row to show)', () => {
  it('a blank YesNo row counted as an answer by the browser is not counted by the server', async () => {
    const blankRow: FixtureAnswer = { ...ANSWERS[0], ID: gid(7777), ResponseID: gid(1005), QuestionID: Q.yesno, TextValue: null };
    const answers = [...ANSWERS, blankRow];
    const browser = browserReport(DEFINITION, RESPONSES, answers).breakdowns.find((c) => c.questionId === Q.yesno);
    const server = (await serverSummary(RESPONSES, answers)).Questions.find((c) => c.QuestionID === Q.yesno);

    expect(browser?.answeredCount).toBe(4);
    expect(server?.AnsweredCount).toBe(3);
    // Everything else on the card is unchanged: a blank row contributed to no bucket either way.
    expect(server?.Buckets).toEqual(browser?.buckets.map((b) => ({ Label: b.label, Count: b.count, Fraction: b.fraction })));
  });
});
