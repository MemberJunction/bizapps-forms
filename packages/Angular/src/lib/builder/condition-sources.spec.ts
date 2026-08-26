import { describe, expect, it } from 'vitest';
import {
  coerceConditionValue,
  operatorNeedsValue,
  toConditionalSource,
  toggleMembership,
  valueEditorKind,
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

describe('valueEditorKind', () => {
  describe('happy', () => {
    it('equality-family operators get a picker when options exist', () => {
      for (const op of ['equals', 'notEquals', 'equalsIgnoreCase', 'contains'] as const) {
        expect(valueEditorKind(op, true)).toBe('select');
      }
    });

    it('membership operators get a checklist when options exist', () => {
      expect(valueEditorKind('in', true)).toBe('checklist');
      expect(valueEditorKind('notIn', true)).toBe('checklist');
    });

    it('free-input sources always get free text', () => {
      expect(valueEditorKind('equals', false)).toBe('text');
      expect(valueEditorKind('in', false)).toBe('text');
    });
  });

  describe('edge', () => {
    it('ordering and affix operators keep free text even with options', () => {
      for (const op of ['greaterThan', 'lessThan', 'startsWith', 'endsWith'] as const) {
        expect(valueEditorKind(op, true)).toBe('text');
      }
    });
  });

  describe('worst', () => {
    it('valueless operators get no editor at all, options or not', () => {
      expect(valueEditorKind('isAnswered', true)).toBe('none');
      expect(valueEditorKind('isNotAnswered', false)).toBe('none');
    });
  });
});

describe('operatorNeedsValue', () => {
  it('only the answered-pair are valueless', () => {
    expect(operatorNeedsValue('isAnswered')).toBe(false);
    expect(operatorNeedsValue('isNotAnswered')).toBe(false);
    expect(operatorNeedsValue('equals')).toBe(true);
    expect(operatorNeedsValue('startsWith')).toBe(true);
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
