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
  conditionValueFor,
  toggleMembership,
  valueEditorKind,
  canAddCondition,
  staleSourceLabel,
  defaultConditionSource,
  newCondition,
  SCORE_SOURCE,
  SCORE_SOURCE_ID,
  type ConditionalSourceKind,
  type ConditionalSourceQuestion,
} from './condition-sources';

/** Structural fakes — the module deliberately reads plain fields, not BaseEntity. */
function question(
  type: string,
  settings?: Record<string, number>,
): { ID: string; Prompt: string; QuestionType: string; Settings: string | null } {
  return {
    ID: 'q1',
    Prompt: 'Ticket type?',
    QuestionType: type,
    Settings: settings ? JSON.stringify(settings) : null,
  };
}

/** The source a type produces, for specs that only care about one field of it. */
function sourceOf(type: string, settings?: Record<string, number>) {
  const source = toConditionalSource(question(type, settings), []);
  if (!source) {
    throw new Error(`${type} produced no source`);
  }
  return source;
}
function option(
  label: string,
  value: string | null,
  order = 0,
): { Label: string; Value: string | null; DisplayOrder: number } {
  return { Label: label, Value: value, DisplayOrder: order };
}

/**
 * Every source kind there is, spelled out ONCE.
 *
 * Written by hand rather than derived, deliberately: this is the list a spec parameterizes over
 * to prove no kind was left unhandled, and deriving it from the same module under test would
 * make it agree with a bug. Adding a kind without adding it here is caught by the exhaustiveness
 * spec below, which counts.
 */
const EVERY_KIND: ConditionalSourceKind[] = [
  'singleChoice',
  'multiSelect',
  'scale',
  'boolean',
  'number',
  'date',
  'time',
  'text',
  'presence',
  'score',
];

/**
 * `toConditionalSource` returns `undefined` for a question that cannot be a condition source; every
 * case below that reads `.options` is asserting about a question that CAN be, so the narrowing is
 * itself an assertion rather than a cast.
 */
function definedSource(...args: Parameters<typeof toConditionalSource>): NonNullable<ReturnType<typeof toConditionalSource>> {
  const source = toConditionalSource(...args);
  expect(source).toBeDefined();
  if (!source) throw new Error('unreachable: asserted defined');
  return source;
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
      expect(definedSource(question('ShortText'), []).options).toBeUndefined();
    });

    it('PictureChoice (images mode) is option-driven too', () => {
      const source = definedSource(question('PictureChoice'), [option('Cat', 'cat', 0)]);
      expect(source.options).toEqual([{ label: 'Cat', value: 'cat' }]);
    });
  });

  describe('edge', () => {
    it('uniquifies duplicate values exactly like the publish path', () => {
      const source = definedSource(question('Dropdown'), [
        option('Other (top)', 'Other', 0),
        option('Other (bottom)', 'Other', 1),
      ]);
      expect(source.options?.map((o) => o.value)).toEqual(['Other', 'Other (2)']);
    });

    it('orders options by DisplayOrder, not array order', () => {
      const source = definedSource(question('SingleChoice'), [
        option('B', 'b', 2),
        option('A', 'a', 1),
      ]);
      expect(source.options?.map((o) => o.value)).toEqual(['a', 'b']);
    });

    it('Matrix options are axes, never comparison values', () => {
      expect(definedSource(question('Matrix'), [option('Row 1', 'r1', 0)]).options).toBeUndefined();
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
      expect(definedSource(question('toString'), [option('x', 'x', 0)]).options).toBeUndefined();
    });

    it('a choice question with zero options omits the list rather than offering an empty picker', () => {
      expect(definedSource(question('SingleChoice'), []).options).toBeUndefined();
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
      expect(toConditionalSource(question('MultiChoice'), [option('A', 'a')])?.kind).toBe('multiSelect');
    });

    it('a single-valued option question is a single choice', () => {
      for (const type of ['SingleChoice', 'Dropdown', 'PictureChoice']) {
        expect(toConditionalSource(question(type), [option('A', 'a')])?.kind).toBe('singleChoice');
      }
    });

    it('an open number is a number, and a scale question is a scale', () => {
      // The difference is whether the TYPE fixes the answers. Any number answers a `Number`;
      // only 1..max answers a `Rating`, which makes its comparison value something to pick.
      expect(sourceOf('Number').kind).toBe('number');
      for (const type of ['Rating', 'NPS', 'OpinionScale']) {
        expect(sourceOf(type).kind).toBe('scale');
      }
    });

    it('a date is a date and a time is a time — they are not the same control', () => {
      expect(sourceOf('Date').kind).toBe('date');
      expect(sourceOf('Time').kind).toBe('time');
    });

    it('a yes/no question is a boolean, not free text', () => {
      for (const type of ['YesNo', 'Checkbox', 'Legal']) {
        expect(sourceOf(type).kind).toBe('boolean');
      }
    });

    it('an answer nothing can be compared against offers presence only', () => {
      // Composites and files are objects and GUIDs; a Ranking answer is EVERY option in the
      // order they were put, so membership against it is true for anyone who answered at all.
      for (const type of ['Address', 'ContactInfo', 'Matrix', 'FileUpload', 'Doodle', 'Ranking']) {
        expect(sourceOf(type).kind).toBe('presence');
      }
    });
  });

  describe('edge', () => {
    it('every answerable question type gets a kind — none falls through unclassified', () => {
      for (const type of answerableTypes) {
        expect(toConditionalSource(question(type), [option('A', 'a')])?.kind).toBeDefined();
      }
    });

    it('a question that collects no answer is not a source at all', () => {
      // A Statement never reaches the answer map, so every operator on it is a constant:
      // `isAnswered` false for everyone, `notEquals` true for everyone. Offering it in the
      // question dropdown is offering a rule that cannot mean anything.
      const unanswerable = (Object.keys(QUESTION_TYPE_BEHAVIOR) as FormQuestionType[]).filter(
        (t) => !isAnswerableQuestionType(t),
      );
      expect(unanswerable.length).toBeGreaterThan(0);
      for (const type of unanswerable) {
        expect(toConditionalSource(question(type), [])).toBeUndefined();
      }
    });

    it('a scale question carries its points as typed values, ready to be picked', () => {
      expect(sourceOf('Rating', { max: 3 }).options).toEqual([
        { label: '1', value: 1 },
        { label: '2', value: 2 },
        { label: '3', value: 3 },
      ]);
    });

    it('a boolean question carries the two answers it has, labelled for a human', () => {
      expect(sourceOf('YesNo').options).toEqual([
        { label: 'Yes', value: true },
        { label: 'No', value: false },
      ]);
      expect(sourceOf('Legal').options?.map((o) => o.label)).toEqual(['Accepted', 'Declined']);
      expect(sourceOf('Checkbox').options?.map((o) => o.label)).toEqual(['Checked', 'Not checked']);
    });

    it('a choice question with no options authored yet is still a choice, not free text', () => {
      // Its kind comes from the type, not from whether the author has filled the options in.
      // Reading it off the option list would flip the question to free text mid-authoring and
      // let a value be typed that the finished question can never produce.
      expect(toConditionalSource(question('SingleChoice'), [])?.kind).toBe('singleChoice');
    });
  });

  describe('worst', () => {
    it('an unknown question type degrades to text rather than guessing', () => {
      expect(toConditionalSource(question('Hologram'), [])?.kind).toBe('text');
    });

    it('an unreadable Settings blob leaves the scale on its defaults, never throws', () => {
      // Settings is open JSON reached by API, paste and hand-edit. A rating whose settings are
      // corrupt is still a five-star rating; a builder that threw here would take the whole
      // rules dialog down with it.
      const broken = { ID: 'q1', Prompt: 'Rate us', QuestionType: 'Rating', Settings: '{not json' };
      expect(() => toConditionalSource(broken, [])).not.toThrow();
      expect(toConditionalSource(broken, [])?.options).toHaveLength(5);
    });

    it('a Matrix is not offered as an option source — its options are axes', () => {
      // A Matrix answer is an object; no operator can match an option value against it, so the
      // picker would be full of values that can never fire.
      const source = toConditionalSource(question('Matrix'), [option('Row 1', 'r1')]);
      expect(source?.options).toBeUndefined();
      expect(source?.kind).not.toBe('singleChoice');
      expect(source?.kind).not.toBe('multiSelect');
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
      const kinds: ConditionalSourceKind[] = EVERY_KIND;
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
      const kinds: ConditionalSourceKind[] = EVERY_KIND;
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
      const kinds: ConditionalSourceKind[] = EVERY_KIND;
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

    it('a fixed answer set is always picked, never typed', () => {
      expect(valueEditorKind('equals', 'scale')).toBe('select');
      expect(valueEditorKind('greaterThan', 'scale')).toBe('select');
      expect(valueEditorKind('equals', 'boolean')).toBe('select');
    });

    it('an open answer gets the control its own keyboard belongs to', () => {
      expect(valueEditorKind('equals', 'text')).toBe('text');
      expect(valueEditorKind('greaterThan', 'number')).toBe('number');
      expect(valueEditorKind('greaterThan', 'score')).toBe('number');
      expect(valueEditorKind('lessThan', 'date')).toBe('date');
      expect(valueEditorKind('lessThan', 'time')).toBe('time');
    });
  });

  describe('edge', () => {
    it('a presence-only source never asks for a value, whatever it is asked', () => {
      // Belt as well as braces: its operator menu offers nothing that takes a value, so this
      // is unreachable through the UI — and it is exactly the sort of thing a later operator
      // added to the menu would break silently.
      for (const choice of OPERATOR_CHOICES) {
        expect(valueEditorKind(choice.op, 'presence')).toBe('none');
      }
    });
  });

  describe('worst', () => {
    it('NO operator an option source offers can ever ask for free text', () => {
      // THE "Soahm" HOLE. On a question with a fixed answer set the value must be picked: a
      // hand-typed value that misses an option's spelling fails `===` forever, silently, and
      // the author's own test submission is what convinces them the rule works.
      for (const kind of ['singleChoice', 'multiSelect', 'scale', 'boolean'] as const) {
        for (const choice of operatorChoicesFor(kind)) {
          expect(valueEditorKind(choice.op, kind)).not.toBe('text');
        }
      }
    });

    it('valueless operators get no editor at all, whatever the kind', () => {
      const kinds: ConditionalSourceKind[] = EVERY_KIND;
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

describe('defaultConditionSource', () => {
  const q = (id: string, kind: ConditionalSourceKind = 'text'): ConditionalSourceQuestion => ({
    id,
    prompt: `${id}?`,
    kind,
  });

  describe('happy', () => {
    it('picks the item the rule belongs to, when the item is one of its own sources', () => {
      // A question's JUMP rule reads its OWN answer — "if this answer is X, go to Y" is the
      // whole shape of it. Opening on the first question of the form made an author repoint
      // every rule they wrote before they could write it.
      expect(defaultConditionSource([q('q1'), q('q2'), q('q3')], 'q3')?.id).toBe('q3');
    });
  });

  describe('edge', () => {
    it('falls back to the NEAREST source, not the first, when the subject is not among them', () => {
      // A SHOW gate's source list stops one question early (a question cannot gate itself on
      // its own answer), so the subject is genuinely absent here. The nearest preceding
      // question is the one an author is overwhelmingly likely to mean.
      expect(defaultConditionSource([q('q1'), q('q2')], 'q3')?.id).toBe('q2');
    });

    it('never opens on the running score while a real question is on offer', () => {
      // An ending's source list carries SCORE_SOURCE last, so "the nearest" alone would open
      // every ending rule on the score.
      expect(defaultConditionSource([q('q1'), SCORE_SOURCE], null)?.id).toBe('q1');
    });

    it('still offers the score when it is the only source there is', () => {
      expect(defaultConditionSource([SCORE_SOURCE], null)?.id).toBe(SCORE_SOURCE_ID);
    });

    it('a subject naming a deleted question falls back rather than returning the ghost', () => {
      expect(defaultConditionSource([q('q1'), q('q2')], 'deleted-id')?.id).toBe('q2');
    });
  });

  describe('worst', () => {
    it('has nothing to offer when the item may read nothing', () => {
      expect(defaultConditionSource([], 'q1')).toBeUndefined();
    });
  });
});

describe('newCondition', () => {
  describe('happy', () => {
    it('names the question and opens on an operator that question can actually satisfy', () => {
      // `equals` against a multi-select answer never matches (the evaluator compares scalars
      // and an array answer fails every one), so a fresh row must not start there.
      expect(newCondition({ id: 'q7', prompt: 'Topics', kind: 'multiSelect' })).toEqual({
        questionId: 'q7',
        op: 'in',
        value: [],
      });
    });
  });

  describe('edge', () => {
    it('reads the running score through the score key, never through a questionId', () => {
      expect(newCondition(SCORE_SOURCE)).toEqual({
        source: 'score',
        op: defaultOperatorFor('score'),
        value: '',
      });
    });

    it('gives a scalar source an empty scalar, not an empty list', () => {
      expect(newCondition({ id: 'q1', prompt: 'Age', kind: 'number' }).value).toBe('');
    });
  });
});


describe('every kind is accounted for', () => {
  // The three tables that switch on kind — the operator menu, the value editor, the default
  // operator — are the ones a new kind gets forgotten in. A miss is silent: the source falls
  // to whatever the fallback arm gives it, which is how a five-star rating came to offer a
  // free-text box in the first place.
  it('offers a menu, an editor and a starting operator for each', () => {
    for (const kind of EVERY_KIND) {
      const menu = operatorChoicesFor(kind);
      expect(menu.length, kind).toBeGreaterThan(0);
      expect(operatorOfferedFor(defaultOperatorFor(kind), kind), kind).toBe(true);
      for (const choice of menu) {
        expect(valueEditorKind(choice.op, kind), `${kind}/${choice.op}`).toBeDefined();
      }
    }
  });

  it('gives every answerable question type one of them', () => {
    const kinds = new Set(EVERY_KIND);
    for (const type of Object.keys(QUESTION_TYPE_BEHAVIOR) as FormQuestionType[]) {
      if (!isAnswerableQuestionType(type)) {
        continue;
      }
      const source = toConditionalSource(question(type, { max: 4 }), [option('A', 'a')]);
      expect(source, type).toBeDefined();
      expect(kinds.has(source!.kind), `${type} -> ${source!.kind}`).toBe(true);
    }
  });
});

describe('the operators a kind offers are the ones that can fire', () => {
  const menu = (kind: ConditionalSourceKind) => operatorChoicesFor(kind).map((c) => c.op);

  describe('happy', () => {
    it('a scale can be equalled and ordered — "rated 3 or more" is the point of it', () => {
      expect(menu('scale')).toContain('equals');
      expect(menu('scale')).toContain('greaterThan');
      expect(menu('scale')).toContain('lessThan');
    });

    it('a time can be ordered, now that a clock reading compares as one', () => {
      expect(menu('time')).toContain('greaterThan');
      expect(menu('time')).toContain('lessThan');
    });
  });

  describe('edge', () => {
    it('a boolean is equalled, never ordered — there is no "greater than yes"', () => {
      expect(menu('boolean')).toContain('equals');
      expect(menu('boolean')).not.toContain('greaterThan');
      expect(menu('boolean')).not.toContain('lessThan');
    });

    it('a scale is not a menu of options — "is one of these stars" is not a question', () => {
      expect(menu('scale')).not.toContain('in');
      expect(menu('boolean')).not.toContain('in');
    });
  });

  describe('worst', () => {
    it('a presence-only source offers the answered pair and NOTHING else', () => {
      // Every other operator on an object, a file id or a full ranking is a constant: `equals`
      // false for everyone, `notEquals` true for everyone. A rule that always fires is worse
      // than no rule, because it reads like a decision.
      expect(menu('presence')).toEqual(['isAnswered', 'isNotAnswered']);
    });
  });
});

describe('conditionValueFor', () => {
  const scale = toConditionalSource(question('Rating', { max: 5 }), [])!;
  const yesNo = toConditionalSource(question('YesNo'), [])!;
  const number = toConditionalSource(question('Number'), [])!;
  const text = toConditionalSource(question('ShortText'), [])!;
  const choice = toConditionalSource(question('SingleChoice'), [option('VIP', 'vip')])!;

  describe('happy', () => {
    it('stores a scale value as the number the answer is stored as', () => {
      expect(conditionValueFor(scale, 'equals', '3')).toBe(3);
    });

    it('stores a boolean value as a boolean', () => {
      expect(conditionValueFor(yesNo, 'equals', 'true')).toBe(true);
      expect(conditionValueFor(yesNo, 'equals', 'false')).toBe(false);
    });

    it('stores an open number as a number', () => {
      expect(conditionValueFor(number, 'greaterThan', '18')).toBe(18);
    });

    it('leaves text, dates and option values as the strings they are stored as', () => {
      expect(conditionValueFor(text, 'equals', 'Acme')).toBe('Acme');
      expect(conditionValueFor(choice, 'equals', 'vip')).toBe('vip');
    });
  });

  describe('edge', () => {
    it('an empty box is empty, not zero — the row is unfinished and gets dropped on save', () => {
      expect(conditionValueFor(scale, 'equals', '')).toBe('');
      expect(conditionValueFor(number, 'equals', '')).toBe('');
      expect(conditionValueFor(yesNo, 'equals', '')).toBe('');
    });

    it('membership still splits a comma list, on any source', () => {
      expect(conditionValueFor(choice, 'in', 'a, b')).toEqual(['a', 'b']);
      expect(conditionValueFor(undefined, 'in', 'a, b')).toEqual(['a', 'b']);
    });

    it('a condition on a deleted question keeps whatever it is given', () => {
      expect(conditionValueFor(undefined, 'equals', '5')).toBe('5');
    });
  });

  describe('worst', () => {
    it('never invents a value the source cannot produce', () => {
      // A select can only hand back one of its own option values, but the setter is reachable
      // from a stored rule and from a repointed row too. Anything off the list stays as it
      // arrived rather than being coerced into a neighbouring point.
      expect(conditionValueFor(scale, 'equals', '9')).toBe('9');
      expect(conditionValueFor(yesNo, 'equals', 'Yes')).toBe('Yes');
    });

    it('never turns unparseable text into NaN', () => {
      expect(conditionValueFor(number, 'greaterThan', 'eighteen')).toBe('eighteen');
      expect(Number.isNaN(conditionValueFor(number, 'greaterThan', 'eighteen'))).toBe(false);
    });
  });
});

describe('a new condition on a fixed-answer source', () => {
  it('opens on an operator that source can satisfy, with nothing picked yet', () => {
    const scale = toConditionalSource(question('Rating', { max: 5 }), [])!;
    const condition = newCondition(scale);
    expect(operatorOfferedFor(condition.op, 'scale')).toBe(true);
    expect(condition.value).toBe('');
  });

  it('opens a presence-only source on an operator that needs no value', () => {
    const upload = toConditionalSource(question('FileUpload'), [])!;
    expect(operatorNeedsValue(newCondition(upload).op)).toBe(false);
  });
});

/**
 * What the picker calls a stored source it is not offering.
 *
 * Issue #73. The disabled option has always read "(question no longer available)", which after a
 * REORDER is simply false — the question is two rows down the canvas, in plain sight. A picker
 * that says a visible question does not exist is a picker nobody believes on the day it is right.
 */
describe('staleSourceLabel', () => {
  const src = (id: string, prompt: string): ConditionalSourceQuestion => ({ id, prompt, kind: 'text' });
  const q1 = src('q1', 'Ticket type');
  const q2 = src('q2', 'Age');
  const q3 = src('q3', 'Interests');
  const FORM = [q1, q2, q3];

  describe('happy', () => {
    it('names a question that exists but is answered after the rule runs', () => {
      expect(staleSourceLabel('q3', [q1, q2], FORM)).toBe('Interests — answered after this rule runs');
    });

    it('says a question is gone when it is gone from the whole form', () => {
      expect(staleSourceLabel('deleted', [q1, q2], FORM)).toBe('(question no longer available)');
    });
  });

  describe('edge', () => {
    it('keeps the gone wording for a source that collects no answer', () => {
      // A `Statement` is dropped by `toConditionalSource`, so it is in NEITHER list and lands
      // here. Telling it apart would mean threading the raw question list in to serve a case no
      // reorder can create — and "not available as a source" is true of a Statement.
      expect(staleSourceLabel('statement-id', [q1], FORM)).toBe('(question no longer available)');
    });

    it('falls back to the gone wording when the form list is empty', () => {
      // The safe default for any caller that has not wired the form-wide list: the old label,
      // never a claim about ordering it has no evidence for.
      expect(staleSourceLabel('q3', [q1], [])).toBe('(question no longer available)');
    });
  });

  describe('worst', () => {
    it('is never asked about a source that IS offered, and says nothing useful if it is', () => {
      // The caller only reaches here when the select has no matching option. Guarding anyway,
      // because a label that contradicts a visible, selectable option is the worst of the three.
      expect(staleSourceLabel('q1', [q1, q2], FORM)).toBe('');
    });
  });
});
