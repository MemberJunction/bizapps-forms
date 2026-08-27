import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FORM_QUESTION_TYPES,
  QUESTION_TYPE_BEHAVIOR,
  analysisKindFor,
  answerColumnFor,
  isAnswerableQuestionType,
  isFormQuestionType,
  questionTypeBehavior,
  questionTypeHasOptions,
  ADDRESS_FIELDS,
  CONTACT_INFO_FIELDS,
  type FormQuestionType,
} from './question-types';

describe('the taxonomy and the CHECK constraint', () => {
  /**
   * THE failure this whole pairing exists to prevent: a type the code offers and the database
   * rejects. It surfaces as a `Save()` returning false with a constraint-violation message
   * naming neither the column nor the value, on a question the author just added — and because
   * the builder writes optimistically, the form looks saved until it is reloaded.
   *
   * Reads the LAST migration that redefines the constraint rather than a fixed filename, so
   * this keeps working the next time the list grows.
   */
  function checkConstraintTypes(): string[] {
    const dir = join(__dirname, '..', '..', '..', '..', 'migrations');
    const sql = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((f) => readFileSync(join(dir, f), 'utf8'))
      .join('\n');

    const matches = [...sql.matchAll(/CK_FormQuestion_QuestionType\]?\s+CHECK\s*\(QuestionType IN \(([^)]*)\)/g)];
    expect(matches.length, 'no migration defines CK_FormQuestion_QuestionType').toBeGreaterThan(0);

    return [...matches[matches.length - 1][1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  }

  it('offers exactly the types the database accepts', () => {
    expect([...checkConstraintTypes()].sort()).toEqual([...FORM_QUESTION_TYPES].sort());
  });
});

describe('QUESTION_TYPE_BEHAVIOR', () => {
  it('derives the union from the table, so the two cannot drift', () => {
    // Not a tautology at runtime — it is the compile step that carries the weight (a type
    // outside the table is not assignable to FormQuestionType). This pins the runtime half.
    expect(FORM_QUESTION_TYPES).toHaveLength(Object.keys(QUESTION_TYPE_BEHAVIOR).length);
    for (const type of FORM_QUESTION_TYPES) {
      expect(QUESTION_TYPE_BEHAVIOR[type]).toBeDefined();
    }
  });

  it('marks Statement, and only Statement, as unanswerable', () => {
    const unanswerable = FORM_QUESTION_TYPES.filter((t) => !isAnswerableQuestionType(t));
    expect(unanswerable).toEqual(['Statement']);
  });

  it('routes every option-carrying type to a real option mode and vice versa', () => {
    const withOptions = FORM_QUESTION_TYPES.filter(questionTypeHasOptions);
    expect([...withOptions].sort()).toEqual(
      ['Dropdown', 'Matrix', 'MultiChoice', 'PictureChoice', 'Ranking', 'SingleChoice'].sort(),
    );
  });

  it('gives Matrix the matrix option mode and PictureChoice the image one', () => {
    expect(questionTypeBehavior('Matrix').optionMode).toBe('matrix');
    expect(questionTypeBehavior('PictureChoice').optionMode).toBe('images');
    expect(questionTypeBehavior('Ranking').optionMode).toBe('values');
  });

  it('keeps every multi-valued type in a column that can hold a collection', () => {
    // A multi-valued answer in a scalar column is a silent truncation to its first element.
    for (const type of FORM_QUESTION_TYPES) {
      if (questionTypeBehavior(type).multiValued) {
        expect(answerColumnFor(type), `${type} is multi-valued`).toBe('json');
      }
    }
  });

  it('sends composites to json and scale types to numeric', () => {
    for (const type of ['Address', 'ContactInfo', 'Matrix'] as const) {
      expect(answerColumnFor(type)).toBe('json');
    }
    for (const type of ['Rating', 'NPS', 'OpinionScale', 'Number'] as const) {
      expect(answerColumnFor(type)).toBe('numeric');
    }
    for (const type of ['YesNo', 'Checkbox', 'Legal'] as const) {
      expect(answerColumnFor(type)).toBe('boolean');
    }
    for (const type of ['FileUpload', 'Signature'] as const) {
      expect(answerColumnFor(type)).toBe('file');
    }
  });

  // Ranking and MultiChoice were byte-identical rows — values/json/choice/multiValued — and they
  // are not the same thing at all. A MultiChoice answer is a SELECTION among the options; a
  // Ranking answer is an ORDERING of every one of them, so membership against a Ranking is true
  // for anyone who answered at all. Nothing could tell them apart until `ordered` existed.
  it('marks Ranking, and only Ranking, as an ordering of every option', () => {
    const ordered = FORM_QUESTION_TYPES.filter((t) => QUESTION_TYPE_BEHAVIOR[t].ordered);
    expect(ordered).toEqual(['Ranking']);
  });

  it('cannot order what it cannot hold several of', () => {
    for (const type of FORM_QUESTION_TYPES) {
      const behavior = QUESTION_TYPE_BEHAVIOR[type];
      if (behavior.ordered) {
        expect(behavior.multiValued).toBe(true);
        expect(behavior.optionMode).not.toBe('none');
      }
    }
  });

  it('never analyses an unanswerable type', () => {
    for (const type of FORM_QUESTION_TYPES) {
      if (!isAnswerableQuestionType(type)) {
        expect(analysisKindFor(type)).toBe('none');
      }
    }
  });

  it('keeps every new type reachable — nothing added to the union without a behaviour row', () => {
    const added: FormQuestionType[] = [
      'Website', 'Checkbox', 'Legal', 'PictureChoice', 'OpinionScale',
      'Ranking', 'Matrix', 'Address', 'ContactInfo', 'Signature',
    ];
    for (const type of added) {
      expect(FORM_QUESTION_TYPES).toContain(type);
    }
  });
});

describe('isFormQuestionType', () => {
  it('accepts a real type and rejects everything else', () => {
    expect(isFormQuestionType('ShortText')).toBe(true);
    expect(isFormQuestionType('Signature')).toBe(true);
    expect(isFormQuestionType('Payment')).toBe(false);
    expect(isFormQuestionType('')).toBe(false);
    expect(isFormQuestionType(null)).toBe(false);
    expect(isFormQuestionType(42)).toBe(false);
  });

  it('is not fooled by inherited Object properties', () => {
    // `in` walks the prototype chain, so a bare `value in QUESTION_TYPE_BEHAVIOR` would call
    // 'constructor' and 'toString' valid question types — and both reach the parser as strings
    // an attacker fully controls.
    expect(isFormQuestionType('constructor')).toBe(false);
    expect(isFormQuestionType('toString')).toBe(false);
    expect(isFormQuestionType('__proto__')).toBe(false);
  });
});

describe('questionTypeBehavior', () => {
  it('throws for an unknown type rather than defaulting', () => {
    // Defaulting would turn a typo in a stored snapshot into a text question that accepts
    // anything — silently dropping the format floor for that question.
    expect(() => questionTypeBehavior('Nope' as FormQuestionType)).toThrow(/Unknown FormQuestionType/);
  });
});

describe('composite field shapes', () => {
  it('lists address parts in the order they are rendered', () => {
    expect(ADDRESS_FIELDS).toEqual(['line1', 'line2', 'city', 'region', 'postalCode', 'country']);
  });

  it('lists contact parts in the order they are rendered', () => {
    expect(CONTACT_INFO_FIELDS).toEqual(['firstName', 'lastName', 'email', 'phone', 'company']);
  });
});

describe('the taxonomy and the generated entity', () => {
  /**
   * The third leg of the same tripod: contract table ↔ shipped migration ↔ GENERATED types.
   *
   * The migration test above compares the code to the SQL we ship. This one compares it to the
   * types CodeGen produced from the live schema, which is what catches the other half of the
   * mistake — a migration edited and committed without re-running `mj codegen`, leaving a
   * generated `QuestionType` union that silently disagrees with both.
   */
  it('matches the generated QuestionType value list', async () => {
    const { mjBizAppsFormsFormQuestionSchema } = await import('../generated/entity_subclasses');
    const field = mjBizAppsFormsFormQuestionSchema.shape.QuestionType;
    const generated = field.options.map((o) => o.value as string);
    expect([...generated].sort()).toEqual([...FORM_QUESTION_TYPES].sort());
  });
});
