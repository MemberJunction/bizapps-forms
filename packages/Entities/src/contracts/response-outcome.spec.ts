import { describe, expect, it } from 'vitest';
import type { AnswerValue } from './conditional-rule';
import type { PublishedFormDefinition } from './form-definition';
import { resolveResponseOutcome } from './response-outcome';

/**
 * A scored form with a score-gated ending and a knockout. `colour` scores; `gate` decides whether
 * `extra` (also scored) is shown at all.
 */
function scoredForm(): Pick<PublishedFormDefinition, 'pages' | 'endScreens'> {
  return {
    pages: [
      {
        id: 'p1',
        displayOrder: 0,
        questions: [
          { id: 'gate', type: 'ShortText', prompt: 'Gate', isRequired: false, displayOrder: 0, options: [] },
          {
            id: 'extra',
            type: 'SingleChoice',
            prompt: 'Extra',
            isRequired: false,
            displayOrder: 1,
            scoring: { points: { big: 50 } },
            options: [{ id: 'o', label: 'Big', value: 'big', displayOrder: 0 }],
            conditionalRule: { show: { all: [{ questionId: 'gate', op: 'equals', value: 'open' }] } },
          },
          {
            id: 'colour',
            type: 'SingleChoice',
            prompt: 'Colour',
            isRequired: false,
            displayOrder: 2,
            scoring: { points: { red: 5 } },
            options: [{ id: 'r', label: 'Red', value: 'red', displayOrder: 0 }],
            conditionalRule: {
              jump: [{ when: { all: [{ questionId: 'colour', op: 'equals', value: 'none' }] }, target: { kind: 'ending', id: 'ko' } }],
            },
          },
        ],
      },
    ],
    endScreens: [
      {
        id: 'high',
        screenType: 'Ending',
        title: 'High scorer',
        displayOrder: 0,
        conditionalRule: { show: { all: [{ source: 'score', op: 'greaterThan', value: 40 }] } },
      },
      { id: 'ko', screenType: 'Ending', title: 'Not eligible', displayOrder: 1, isDisqualification: true },
      { id: 'default', screenType: 'Ending', title: 'Thanks', displayOrder: 2, isDefault: true },
    ],
  };
}

const answers = (entries: Record<string, AnswerValue>): Map<string, AnswerValue> => new Map(Object.entries(entries));

/**
 * DW13 (contracts half): the author's Preview and the live server resolve an ending through this ONE
 * function over the same settled answers, so a score-gated ending cannot differ between them (#75).
 */
describe('resolveResponseOutcome', () => {
  it('picks the score-gated ending when the visible answers reach the band', () => {
    const result = resolveResponseOutcome(scoredForm(), answers({ gate: 'open', extra: 'big', colour: 'red' }));
    expect(result.score).toBe(55);
    expect(result.outcome.screen?.id).toBe('high');
    expect(result.outcome.disqualified).toBe(false);
  });

  it('does not score a stale answer to a question that is now hidden', () => {
    // `extra` was answered while `gate` was open, then the gate closed. The raw map still holds
    // `big` (50 points); a derivation that read it would put this respondent in the high band.
    const result = resolveResponseOutcome(scoredForm(), answers({ gate: 'closed', extra: 'big', colour: 'red' }));
    expect(result.score).toBe(5);
    expect(result.outcome.screen?.id).toBe('default');
  });

  it('resolves a knockout jump to its flagged screen', () => {
    const result = resolveResponseOutcome(scoredForm(), answers({ colour: 'none' }));
    expect(result.outcome).toMatchObject({ disqualified: true, endedEarly: true });
    expect(result.outcome.screen?.id).toBe('ko');
  });

  it('gives the same verdict whether it is handed the raw answers or the settled ones', () => {
    // The widget calls this over its live (raw) answers; the server calls it over the payload,
    // which is the settled answers. Same verdict, by construction.
    const raw = answers({ gate: 'closed', extra: 'big', colour: 'red' });
    const fromRaw = resolveResponseOutcome(scoredForm(), raw);
    const fromSettled = resolveResponseOutcome(scoredForm(), fromRaw.visibility.answers);
    expect(fromSettled.outcome).toEqual(fromRaw.outcome);
    expect(fromSettled.score).toBe(fromRaw.score);
  });
});
