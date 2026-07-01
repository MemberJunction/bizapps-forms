import { describe, it, expect } from 'vitest';
import type {
  PublishedFormDefinition,
  PublishedFormQuestion,
  mjBizAppsFormsFormResponseEntityType,
  mjBizAppsFormsFormResponseAnswerEntityType,
} from '@mj-biz-apps/forms-entities';
import {
  flattenQuestions,
  breakdownKindFor,
  buildSummary,
  buildBreakdowns,
  buildFunnel,
  buildResponseRows,
  buildResponseDetail,
  renderAnswer,
} from './reporting-aggregations';

type ResponseRow = mjBizAppsFormsFormResponseEntityType;
type AnswerRow = mjBizAppsFormsFormResponseAnswerEntityType;

function q(
  id: string,
  type: PublishedFormQuestion['type'],
  displayOrder = 0,
  options: { id: string; label: string; value: string; displayOrder: number }[] = [],
): PublishedFormQuestion {
  return { id, type, prompt: `Prompt ${id}`, isRequired: false, displayOrder, options };
}

function response(id: string, status: 'Complete' | 'Partial', started: Date | null, submitted: Date | null): ResponseRow {
  return {
    ID: id,
    FormID: 'f1',
    FormVersionID: 'v1',
    Status: status,
    AnonymousSessionID: `s-${id}`,
    RespondentPersonID: null,
    StartedAt: started,
    SubmittedAt: submitted,
    SourceMetadata: null,
    __mj_CreatedAt: started ?? new Date(),
    __mj_UpdatedAt: submitted ?? new Date(),
    Form: 'Test Form',
    RespondentPerson: null,
  };
}

function answer(responseId: string, questionId: string, vals: Partial<AnswerRow>): AnswerRow {
  const now = new Date();
  return {
    ID: `${responseId}-${questionId}`,
    ResponseID: responseId,
    QuestionID: questionId,
    TextValue: null,
    NumericValue: null,
    DateValue: null,
    BooleanValue: null,
    JSONValue: null,
    FileID: null,
    Score: null,
    ScoreRationale: null,
    __mj_CreatedAt: now,
    __mj_UpdatedAt: now,
    File: null,
    ...vals,
  };
}

describe('breakdownKindFor', () => {
  it('maps types to kinds', () => {
    expect(breakdownKindFor('SingleChoice')).toBe('distribution');
    expect(breakdownKindFor('MultiChoice')).toBe('distribution');
    expect(breakdownKindFor('Dropdown')).toBe('distribution');
    expect(breakdownKindFor('YesNo')).toBe('boolean');
    expect(breakdownKindFor('Number')).toBe('numeric');
    expect(breakdownKindFor('Rating')).toBe('numeric');
    expect(breakdownKindFor('NPS')).toBe('numeric');
    expect(breakdownKindFor('LongText')).toBe('freeText');
    expect(breakdownKindFor('Email')).toBe('freeText');
  });
});

describe('flattenQuestions', () => {
  it('flattens pages in display order', () => {
    const def: PublishedFormDefinition = {
      formId: 'f1',
      formVersionId: 'v1',
      name: 'F',
      renderMode: 'Scroll',
      settings: { anonymousAllowed: true, captchaRequired: false },
      styleTokens: { cssVariables: {} },
      pages: [
        { id: 'p2', displayOrder: 1, questions: [q('q3', 'Number', 0)] },
        { id: 'p1', displayOrder: 0, questions: [q('q2', 'Email', 1), q('q1', 'ShortText', 0)] },
      ],
    };
    expect(flattenQuestions(def).map((x) => x.id)).toEqual(['q1', 'q2', 'q3']);
  });
});

describe('buildSummary', () => {
  it('headline total counts COMPLETE only; partials feed partialResponses + completionRate', () => {
    const start = new Date('2026-01-01T00:00:00Z');
    const rows: ResponseRow[] = [
      response('r1', 'Complete', start, new Date(start.getTime() + 60_000)),
      response('r2', 'Complete', start, new Date(start.getTime() + 120_000)),
      response('r3', 'Partial', start, null),
    ];
    const s = buildSummary(rows);
    // Headline total EXCLUDES the in-progress partial (regression: partials must not inflate it).
    expect(s.totalResponses).toBe(2);
    expect(s.completeResponses).toBe(2);
    expect(s.partialResponses).toBe(1);
    // completionRate keeps the started (complete + partial) denominator as the drop-off signal.
    expect(s.completionRate).toBeCloseTo(2 / 3);
    expect(s.averageCompletionSeconds).toBe(90); // (60 + 120) / 2
  });

  it('handles zero responses', () => {
    const s = buildSummary([]);
    expect(s.totalResponses).toBe(0);
    expect(s.completionRate).toBe(0);
    expect(s.averageCompletionSeconds).toBeNull();
    expect(s.lastSubmittedAt).toBeNull();
  });

  it('counts nothing as a response when only partials exist', () => {
    const s = buildSummary([response('p1', 'Partial', new Date(), null)]);
    expect(s.totalResponses).toBe(0);
    expect(s.partialResponses).toBe(1);
    expect(s.completionRate).toBe(0);
  });
});

describe('buildBreakdowns', () => {
  const choice = q('qc', 'SingleChoice', 0, [
    { id: 'o1', label: 'Red', value: 'red', displayOrder: 0 },
    { id: 'o2', label: 'Blue', value: 'blue', displayOrder: 1 },
  ]);
  const multi = q('qm', 'MultiChoice', 1, [
    { id: 'a', label: 'A', value: 'a', displayOrder: 0 },
    { id: 'b', label: 'B', value: 'b', displayOrder: 1 },
  ]);
  const nps = q('qn', 'NPS', 2);
  const yn = q('qy', 'YesNo', 3);
  const text = q('qt', 'LongText', 4);

  const answers: AnswerRow[] = [
    answer('r1', 'qc', { TextValue: 'red' }),
    answer('r2', 'qc', { TextValue: 'red' }),
    answer('r3', 'qc', { TextValue: 'blue' }),
    answer('r1', 'qm', { JSONValue: JSON.stringify(['a', 'b']) }),
    answer('r2', 'qm', { JSONValue: JSON.stringify(['a']) }),
    answer('r1', 'qn', { NumericValue: 10 }),
    answer('r2', 'qn', { NumericValue: 8 }),
    answer('r3', 'qn', { NumericValue: 0 }),
    answer('r1', 'qy', { BooleanValue: true }),
    answer('r2', 'qy', { BooleanValue: false }),
    answer('r1', 'qt', { TextValue: 'hello' }),
  ];

  const breakdowns = buildBreakdowns([choice, multi, nps, yn, text], answers);

  it('builds choice distribution with option labels, sorted by count', () => {
    const b = breakdowns.find((x) => x.questionId === 'qc')!;
    expect(b.kind).toBe('distribution');
    expect(b.buckets[0]).toMatchObject({ label: 'Red', count: 2 });
    expect(b.buckets[1]).toMatchObject({ label: 'Blue', count: 1 });
  });

  it('counts multi-select selections from JSON', () => {
    const b = breakdowns.find((x) => x.questionId === 'qm')!;
    const a = b.buckets.find((x) => x.label === 'A')!;
    const bb = b.buckets.find((x) => x.label === 'B')!;
    expect(a.count).toBe(2);
    expect(bb.count).toBe(1);
  });

  it('computes NPS score and segments', () => {
    const b = breakdowns.find((x) => x.questionId === 'qn')!;
    expect(b.numeric).not.toBeNull();
    expect(b.numeric!.npsSegments).toEqual({ detractors: 1, passives: 1, promoters: 1 });
    // (1 promoter - 1 detractor) / 3 * 100 = 0
    expect(b.numeric!.npsScore).toBe(0);
  });

  it('builds boolean buckets for YesNo', () => {
    const b = breakdowns.find((x) => x.questionId === 'qy')!;
    expect(b.kind).toBe('boolean');
    expect(b.buckets).toEqual([
      { label: 'Yes', count: 1, fraction: 0.5 },
      { label: 'No', count: 1, fraction: 0.5 },
    ]);
  });

  it('lists free-text answers', () => {
    const b = breakdowns.find((x) => x.questionId === 'qt')!;
    expect(b.kind).toBe('freeText');
    expect(b.textAnswers).toEqual(['hello']);
  });
});

describe('buildFunnel', () => {
  it('computes reach, retention and drop-off across pages', () => {
    const def: PublishedFormDefinition = {
      formId: 'f1',
      formVersionId: 'v1',
      name: 'F',
      renderMode: 'Scroll',
      settings: { anonymousAllowed: true, captchaRequired: false },
      styleTokens: { cssVariables: {} },
      pages: [
        { id: 'p1', title: 'One', displayOrder: 0, questions: [q('q1', 'ShortText', 0)] },
        { id: 'p2', title: 'Two', displayOrder: 1, questions: [q('q2', 'ShortText', 0)] },
      ],
    };
    // r1 + r2 answered page 1; only r1 answered page 2
    const answers: AnswerRow[] = [
      answer('r1', 'q1', { TextValue: 'a' }),
      answer('r2', 'q1', { TextValue: 'b' }),
      answer('r1', 'q2', { TextValue: 'c' }),
    ];
    const funnel = buildFunnel(def, answers);
    expect(funnel[0]).toMatchObject({ reached: 2, retention: 1, dropOff: 0 });
    expect(funnel[1].reached).toBe(1);
    expect(funnel[1].retention).toBe(0.5);
    expect(funnel[1].dropOff).toBe(0.5);
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
      response('r1', 'Complete', new Date(), new Date()),
      [answer('r1', 'qc', { TextValue: 'red' })],
      [choice, yn],
    );
    expect(detail.answers).toHaveLength(1);
    expect(detail.answers[0]).toMatchObject({ prompt: 'Prompt qc', displayValue: 'Red' });
  });
});
