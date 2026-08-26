import {
  MAX_CONDITIONS_PER_GROUP,
  QUESTION_TYPE_BEHAVIOR,
  isAnswerableQuestionType,
  type FormQuestionType,
} from '@mj-biz-apps/forms-entities';
import { describe, expect, it } from 'vitest';
import {
  OPERATOR_CHOICES,
  coerceConditionValue,
  defaultOperatorFor,
  operatorChoicesFor,
  operatorLabel,
  operatorNeedsValue,
  operatorOfferedFor,
  toConditionalSource,
  valueInputMode,
  toggleMembership,
  valueEditorKind,
  canAddCondition,
  type ConditionalSourceKind,
} from './condition-sources';

/** Structural fakes — the module deliberately reads plain fields, not BaseEntity. */
function question(type: string): { ID: string; Prompt: string; QuestionType: string } {
  return { ID: 'q1', Prompt: 'Ticket type?', QuestionType: type };
}
function option(
  label: string,
  value: string | null,
  order = 0,
): { Label: string; Value: string | null; DisplayOrder: number } {
  return { Label: label, Value: value, DisplayOrder: order };
}

describe('toConditionalSource', () => {
  describe('happy', () => {
    it('carries published option identities for a choice question', () => {
      const source = toConditionalSource(question('SingleChoice'), [
        option('General', 'general', 0),
        option('VIP', null, 1),
      ]);
      expect(source).toEqual({
        id: 'q1',
        prompt: 'Ticket type?',
        kind: 'singleChoice',
        // null Value falls back to Label — the same fallback the publish path applies.
        options: [
          { label: 'General', value: 'general' },
          { label: 'VIP', value: 'VIP' },
        ],
      });
    });

    it('offers no options for free-input questions', () => {
      expect(toConditionalSource(question('ShortText'), []).options).toBeUndefined();
    });

    it('PictureChoice (images mode) is option-driven too', () => {
      const source = toConditionalSource(question('PictureChoice'), [option('Cat', 'cat', 0)]);
      expect(source.options).toEqual([{ label: 'Cat', value: 'cat' }]);
    });
  });

  describe('edge', () => {
    it('uniquifies duplicate values exactly like the publish path', () => {
      const source = toConditionalSource(question('Dropdown'), [
        option('Other (top)', 'Other', 0),
        option('Other (bottom)', 'Other', 1),
      ]);
      expect(source.options?.map((o) => o.value)).toEqual(['Other', 'Other (2)']);
    });

    it('orders options by DisplayOrder, not array order', () => {
      const source = toConditionalSource(question('SingleChoice'), [
        option('B', 'b', 2),
        option('A', 'a', 1),
      ]);
      expect(source.options?.map((o) => o.value)).toEqual(['a', 'b']);
    });

    it('Matrix options are axes, never comparison values', () => {
      expect(toConditionalSource(question('Matrix'), [option('Row 1', 'r1', 0)]).options).toBeUndefined();
    });
  });

  describe('worst', () => {
    it('an unknown question type from a stale row degrades to a plain source', () => {
      expect(toConditionalSource(question('NoSuchType'), [option('x', 'x', 0)])).toEqual({
        id: 'q1',
        prompt: 'Ticket type?',
        kind: 'text',
      });
    });

    it('prototype-chain names are not question types', () => {
      expect(toConditionalSource(question('toString'), [option('x', 'x', 0)]).options).toBeUndefined();
    });

    it('a choice question with zero options omits the list rather than offering an empty picker', () => {
      expect(toConditionalSource(question('SingleChoice'), []).options).toBeUndefined();
    });
  });
});

describe('source kinds', () => {
  /**
   * The kind is what makes the operator menu and the value editor correct per question, and it
   * is DERIVED from `QUESTION_TYPE_BEHAVIOR` rather than listed here — a hardcoded type list
   * silently goes stale the next time a question type ships. These specs parameterize over the
   * capability table for the same reason.
   */
  const answerableTypes = (Object.keys(QUESTION_TYPE_BEHAVIOR) as FormQuestionType[]).filter(
    isAnswerableQuestionType,
  );

  describe('happy', () => {
    it('a multi-valued option question is a multi-select', () => {
      expect(toConditionalSource(question('MultiChoice'), [option('A', 'a')]).kind).toBe('multiSelect');
      expect(toConditionalSource(question('Ranking'), [option('A', 'a')]).kind).toBe('multiSelect');
    });

    it('a single-valued option question is a single choice', () => {
      for (const type of ['SingleChoice', 'Dropdown', 'PictureChoice']) {
        expect(toConditionalSource(question(type), [option('A', 'a')]).kind).toBe('singleChoice');
      }
    });

    it('a numeric question is numeric, and a date question is a date', () => {
      for (const type of ['Number', 'Rating', 'NPS', 'OpinionScale']) {
        expect(toConditionalSource(question(type), []).kind).toBe('number');
      }
      expect(toConditionalSource(question('Date'), []).kind).toBe('date');
      expect(toConditionalSource(question('Time'), []).kind).toBe('date');
    });
  });

  describe('edge', () => {
    it('every answerable question type gets a kind — none falls through unclassified', () => {
      for (const type of answerableTypes) {
        expect(toConditionalSource(question(type), [option('A', 'a')]).kind).toBeDefined();
      }
    });

    it('a choice question with no options authored yet is still a choice, not free text', () => {
      // Its kind comes from the type, not from whether the author has filled the options in.
      // Reading it off the option list would flip the question to free text mid-authoring and
      // let a value be typed that the finished question can never produce.
      expect(toConditionalSource(question('SingleChoice'), []).kind).toBe('singleChoice');
    });
  });

  describe('worst', () => {
    it('an unknown question type degrades to text rather than guessing', () => {
      expect(toConditionalSource(question('Hologram'), []).kind).toBe('text');
    });

    it('a Matrix is not offered as an option source — its options are axes', () => {
      // A Matrix answer is an object; no operator can match an option value against it, so the
      // picker would be full of values that can never fire.
      const source = toConditionalSource(question('Matrix'), [option('Row 1', 'r1')]);
      expect(source.options).toBeUndefined();
      expect(source.kind).not.toBe('singleChoice');
      expect(source.kind).not.toBe('multiSelect');
    });
  });
});

describe('operatorChoicesFor', () => {
  const menu = (kind: ConditionalSourceKind) => operatorChoicesFor(kind).map((c) => c.op);

  describe('happy', () => {
    it('offers the membership pair for a multi-select, and neither equality operator', () => {
      // THE DEFECT THIS CLOSES. `scalarsEqual` returns false for ANY array answer, so on a
      // multi-select `equals` can never match and `notEquals` — its negation — always does.
      // Both were on the menu, and both were silently wrong in opposite directions.
      expect(menu('multiSelect')).toEqual(['in', 'notIn', 'isAnswered', 'isNotAnswered']);
    });

    it('offers ordering on numbers and dates', () => {
      expect(menu('number')).toContain('greaterThan');
      expect(menu('date')).toContain('lessThan');
    });

    it('offers no ordering on free text — a string comparison no author meant', () => {
      expect(menu('text')).toEqual(['equals', 'notEquals', 'isAnswered', 'isNotAnswered']);
    });
  });

  describe('edge', () => {
    it('every kind offers a non-empty menu of operators the contract supports', () => {
      const kinds: ConditionalSourceKind[] = ['singleChoice', 'multiSelect', 'number', 'date', 'text', 'score'];
      for (const kind of kinds) {
        const ops = menu(kind);
        expect(ops.length).toBeGreaterThan(0);
        for (const op of ops) {
          expect(OPERATOR_CHOICES.map((c) => c.op)).toContain(op);
        }
      }
    });

    it('the score has no answered-pair — the running total is always a number', () => {
      expect(menu('score')).not.toContain('isAnswered');
      expect(menu('score')).not.toContain('isNotAnswered');
    });
  });

  describe('worst', () => {
    it('names the membership operators for what they do on a multi-select', () => {
      // "is one of" is right for a single answer and wrong for a set of them. One label
      // function, keyed on the kind — never two lists that can drift.
      expect(operatorLabel('in', 'multiSelect')).toBe('includes any of');
      expect(operatorLabel('notIn', 'multiSelect')).toBe('includes none of');
      expect(operatorLabel('in', 'singleChoice')).toBe('is one of');
      expect(operatorLabel('in')).toBe('is one of');
    });

    it('defaultOperatorFor always returns an operator that kind actually offers', () => {
      const kinds: ConditionalSourceKind[] = ['singleChoice', 'multiSelect', 'number', 'date', 'text', 'score'];
      for (const kind of kinds) {
        expect(operatorOfferedFor(defaultOperatorFor(kind), kind)).toBe(true);
      }
    });

    it('operatorOfferedFor rejects an operator the kind does not offer', () => {
      expect(operatorOfferedFor('equals', 'multiSelect')).toBe(false);
      expect(operatorOfferedFor('greaterThan', 'text')).toBe(false);
    });

    it('a stored operator the kind no longer offers stays in the menu, named as unavailable', () => {
      // A `<select>` whose `[value]` is not among its options renders BLANK. A rule authored
      // before the menu narrowed — `equals` on a multi-select — would show an empty operator
      // box on a row that reads perfectly well in the database.
      const menu = operatorChoicesFor('multiSelect', 'equals');
      expect(menu.map((c) => c.op)).toContain('equals');
      expect(menu[menu.length - 1].label).toBe('equals (not available here)');
    });

    it('adds nothing when the stored operator is one the kind already offers', () => {
      expect(operatorChoicesFor('multiSelect', 'in')).toEqual(operatorChoicesFor('multiSelect'));
    });

    it('every kind can render every operator without blanking', () => {
      const kinds: ConditionalSourceKind[] = ['singleChoice', 'multiSelect', 'number', 'date', 'text', 'score'];
      for (const kind of kinds) {
        for (const choice of OPERATOR_CHOICES) {
          expect(operatorChoicesFor(kind, choice.op).map((c) => c.op)).toContain(choice.op);
        }
      }
    });
  });
});

describe('OPERATOR_CHOICES', () => {
  /**
   * The editor's menu IS the operator surface an author can reach. Twelve operators became eight
   * (RULES_SIMPLIFICATION_PLAN §2), and the four that went were the ones that only ever did
   * anything on free text — where a rule fires on whether the respondent's spelling matched the
   * author's. Pinned as a set, not a count, so dropping one and adding another cannot pass.
   */
  it('offers exactly the eight operators the contract supports', () => {
    expect(OPERATOR_CHOICES.map((choice) => choice.op)).toEqual([
      'equals',
      'notEquals',
      'in',
      'notIn',
      'greaterThan',
      'lessThan',
      'isAnswered',
      'isNotAnswered',
    ]);
  });

  it('gives no two operators the same label', () => {
    // Two menu rows reading identically is unauthorable-by-accident territory: the author picks
    // one, the summary reads back the other's meaning, and nothing about the screen says which.
    const labels = OPERATOR_CHOICES.map((choice) => choice.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('resolves a label for every operator it offers', () => {
    for (const choice of OPERATOR_CHOICES) {
      expect(operatorLabel(choice.op)).toBe(choice.label);
    }
  });
});

describe('valueEditorKind', () => {
  describe('happy', () => {
    it('equality operators on a single choice get a picker', () => {
      for (const op of ['equals', 'notEquals'] as const) {
        expect(valueEditorKind(op, 'singleChoice')).toBe('select');
      }
    });

    it('membership operators get a checklist on either option kind', () => {
      expect(valueEditorKind('in', 'singleChoice')).toBe('checklist');
      expect(valueEditorKind('in', 'multiSelect')).toBe('checklist');
      expect(valueEditorKind('notIn', 'multiSelect')).toBe('checklist');
    });

    it('free-input kinds get free text', () => {
      expect(valueEditorKind('equals', 'text')).toBe('text');
      expect(valueEditorKind('greaterThan', 'number')).toBe('text');
      expect(valueEditorKind('lessThan', 'date')).toBe('text');
      expect(valueEditorKind('greaterThan', 'score')).toBe('text');
    });
  });

  describe('edge', () => {
    it('a number gets a numeric keypad, and a free-text answer does not', () => {
      // Mobile-first: the difference between a phone showing a keypad and a full keyboard is
      // the difference between typing "18" and typing "1" then giving up.
      expect(valueInputMode('number')).toBe('numeric');
      expect(valueInputMode('score')).toBe('numeric');
      expect(valueInputMode('text')).toBeNull();
      expect(valueInputMode('date')).toBeNull();
    });
  });

  describe('worst', () => {
    it('NO operator an option source offers can ever ask for free text', () => {
      // THE "Soahm" HOLE. On a question with a fixed answer set the value must be picked: a
      // hand-typed value that misses an option's spelling fails `===` forever, silently, and
      // the author's own test submission is what convinces them the rule works.
      for (const kind of ['singleChoice', 'multiSelect'] as const) {
        for (const choice of operatorChoicesFor(kind)) {
          expect(valueEditorKind(choice.op, kind)).not.toBe('text');
        }
      }
    });

    it('valueless operators get no editor at all, whatever the kind', () => {
      const kinds: ConditionalSourceKind[] = ['singleChoice', 'multiSelect', 'number', 'date', 'text', 'score'];
      for (const kind of kinds) {
        expect(valueEditorKind('isAnswered', kind)).toBe('none');
        expect(valueEditorKind('isNotAnswered', kind)).toBe('none');
      }
    });
  });
});

describe('operatorNeedsValue', () => {
  it('only the answered-pair are valueless', () => {
    expect(operatorNeedsValue('isAnswered')).toBe(false);
    expect(operatorNeedsValue('isNotAnswered')).toBe(false);
    expect(operatorNeedsValue('equals')).toBe(true);
    expect(operatorNeedsValue('in')).toBe(true);
  });
});

describe('coerceConditionValue', () => {
  describe('happy', () => {
    it('membership operators split a comma list', () => {
      expect(coerceConditionValue('in', 'a, b , c')).toEqual(['a', 'b', 'c']);
    });

    it('scalar operators pass the string through', () => {
      expect(coerceConditionValue('equals', 'Other')).toBe('Other');
    });
  });

  describe('edge', () => {
    it('empty segments are dropped, an empty string becomes an empty list', () => {
      expect(coerceConditionValue('notIn', 'a,,b,')).toEqual(['a', 'b']);
      expect(coerceConditionValue('in', '')).toEqual([]);
    });
  });
});

describe('toggleMembership', () => {
  describe('happy', () => {
    it('checks and unchecks one option', () => {
      expect(toggleMembership(['a'], 'b', true)).toEqual(['a', 'b']);
      expect(toggleMembership(['a', 'b'], 'a', false)).toEqual(['b']);
    });
  });

  describe('edge', () => {
    it('preserves entries that are no longer options', () => {
      expect(toggleMembership(['deleted-option', 'a'], 'b', true)).toEqual(['deleted-option', 'a', 'b']);
    });

    it('unchecking the last entry leaves an empty list', () => {
      expect(toggleMembership(['a'], 'a', false)).toEqual([]);
    });
  });

  describe('worst', () => {
    it('a scalar current value is treated as empty, never crashed on', () => {
      expect(toggleMembership('not-an-array', 'a', true)).toEqual(['a']);
      expect(toggleMembership(undefined, 'a', true)).toEqual(['a']);
    });

    it('numeric arrays are stringified, and re-checking never duplicates', () => {
      expect(toggleMembership([1, 2], '1', true)).toEqual(['2', '1']);
    });
  });
});

describe('the condition cap the contract declares', () => {
  it('lets a group grow up to the cap', () => {
    expect(canAddCondition(0)).toBe(true);
    expect(canAddCondition(MAX_CONDITIONS_PER_GROUP - 1)).toBe(true);
  });

  it('stops offering another condition at the cap', () => {
    // The cap is documented as enforced "in the editor, which stops offering Add condition at
    // the cap" — which was not true of any code. It mattered because the only other stated
    // enforcement, the zod schema, does not run on the builder's publish path either: an
    // over-cap group published cleanly and then failed to parse on every public form load,
    // where a swallowed throw turned it into "no rule" and rendered the gated item to everyone.
    expect(canAddCondition(MAX_CONDITIONS_PER_GROUP)).toBe(false);
    expect(canAddCondition(MAX_CONDITIONS_PER_GROUP + 5)).toBe(false);
  });
});
