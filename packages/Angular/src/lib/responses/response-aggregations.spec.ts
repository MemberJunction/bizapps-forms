import { describe, it, expect } from 'vitest';
import { buildResponseRows, buildResponseDetail } from './response-aggregations';
import { renderAnswer } from '../shared/answer-values';
import { q, response, answer } from '../shared/testing/entity-row-fixtures';

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
