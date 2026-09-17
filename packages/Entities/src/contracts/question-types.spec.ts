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

/** Where the shipped migrations live, from this spec's location in the package. */
const MIGRATIONS_DIR = join(__dirname, '..', '..', '..', '..', 'migrations');

/**
 * Every shipped migration, in apply order, read once.
 *
 * Memoized because three separate readers in this file want the same bytes, and the directory is
 * 36 files including a 15k-line baseline — re-reading it per call made this spec cost ~300ms
 * against ~5ms for its neighbours.
 */
let migrationCache: { file: string; sql: string }[] | null = null;
function shippedMigrations(): { file: string; sql: string }[] {
  migrationCache ??= readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((file) => ({ file, sql: readFileSync(join(MIGRATIONS_DIR, file), 'utf8') }));
  return migrationCache;
}

/**
 * THE failure this whole pairing exists to prevent: a type the code offers and the database
 * rejects. It surfaces as a `Save()` returning false with a constraint-violation message
 * naming neither the column nor the value, on a question the author just added — and because
 * the builder writes optimistically, the form looks saved until it is reloaded.
 *
 * Reads the LAST migration that redefines the constraint rather than a fixed filename, so
 * this keeps working the next time the list grows.
 *
 * At module scope because the picklist-order suite below needs the same list: the sequences
 * CodeGen derives are a function of exactly these values.
 */
function checkConstraintTypes(): string[] {
  const sql = shippedMigrations().map((m) => m.sql).join('\n');

  const matches = [...sql.matchAll(/CK_FormQuestion_QuestionType\]?\s+CHECK\s*\(QuestionType IN \(([^)]*)\)/g)];
  expect(matches.length, 'no migration defines CK_FormQuestion_QuestionType').toBeGreaterThan(0);

  return [...matches[matches.length - 1][1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe('the taxonomy and the CHECK constraint', () => {
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
    for (const type of ['FileUpload', 'Doodle'] as const) {
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
      'Ranking', 'Matrix', 'Address', 'ContactInfo', 'Doodle',
    ];
    for (const type of added) {
      expect(FORM_QUESTION_TYPES).toContain(type);
    }
  });
});

describe('isFormQuestionType', () => {
  it('accepts a real type and rejects everything else', () => {
    expect(isFormQuestionType('ShortText')).toBe(true);
    expect(isFormQuestionType('Doodle')).toBe(true);
    expect(isFormQuestionType('Payment')).toBe(false);
    expect(isFormQuestionType('')).toBe(false);
    expect(isFormQuestionType(null)).toBe(false);
    expect(isFormQuestionType(42)).toBe(false);
  });

  /**
   * The retired `Signature` key is NOT kept alive as an alias, and that is a decision (#97).
   *
   * An alias looks like cheap insurance against a snapshot the rename's migration missed, and it
   * is not: admitted here with no row in `QUESTION_TYPE_BEHAVIOR`, it converts the parser's clean
   * fail-closed into `questionTypeBehavior` THROWING on the first `answerColumnFor` — a 500
   * instead of a handled `undefined`. Admitted WITH a row it is not a rename: the builder's total
   * `Record<FormQuestionType, …>` palette would have to offer "Signature" again and the CHECK
   * constraint would have to keep accepting it, which is the whole thing being removed.
   *
   * What makes the migration sufficient on its own: the snapshot token is written by
   * `JSON.stringify` (`publish.service.ts`), so `"type":"Signature"` has exactly one spelling and
   * a scoped REPLACE cannot miss it.
   */
  it('does not answer to the retired Signature key', () => {
    expect(isFormQuestionType('Signature')).toBe(false);
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

describe('the picklist order a host actually receives', () => {
  /**
   * #219. `mj app install` writes our schema into the host's `excludeSchemas`
   * (MJ/packages/OpenApp/Engine/src/install/install-orchestrator.ts:1987), and CodeGen's
   * constraint-sync query filters on exactly that list — `getCheckConstraintsSchemaFilter` returns
   * ` WHERE SchemaName NOT IN (…)` (SQLServerCodeGenProvider.ts:2000), consumed at
   * manage-metadata.ts:5470. So CodeGen NEVER reaches `FormQuestion.QuestionType` on a host:
   * whatever `migrations/` leaves in `EntityFieldValue.Sequence` is the order that value list is
   * rendered in, permanently.
   *
   * WHICH surface: `Sequence` orders a field's `EntityFieldValues` in MJ metadata, so it reaches
   * every metadata-driven consumer — most visibly Explorer's generated Form Question record form
   * (`<mj-form-field FieldName="QuestionType">`). It is NOT the Forms builder's "Add content"
   * palette, which is the hand-authored `Record` in `builder/question-type-catalog.ts` and reads no
   * core metadata at all. Worth stating, because the builder is the tempting place to go looking.
   *
   * `V202608301200` renamed Signature→Doodle and skipped `Sequence` on the stated premise that
   * "CodeGen re-derives the whole field's sequences … on its next run". There is no next run. The
   * rename moved the value from alphabetical slot 20 to slot 5 and left 16 of 25 rows wrong.
   *
   * This replays every migration's writes to that picklist and holds the end state to CodeGen's
   * own rule, read from `syncEntityFieldValues` (manage-metadata.ts:5656): sort the parsed CHECK
   * values with a bare `Array.prototype.sort()`, then `Sequence = 1 + index`, matching rows BY
   * VALUE — never by row id, which a host may have minted itself.
   */
  const QUESTION_TYPE_FIELD_ID = '0A4FF448-80DF-4D5D-94EC-E315822A1B45';

  type PicklistRow = { id: string; sequence: number; value: string };

  /** The end state of the QuestionType picklist after every shipped migration, keyed by value. */
  function shippedPicklist(): Map<string, PicklistRow> {
    const byId = new Map<string, PicklistRow>();

    for (const { file, sql } of shippedMigrations()) {
      // Which T-SQL variables in THIS file hold the QuestionType field id. Both the INSERT and the
      // natural-key UPDATE below are keyed on it, so that a migration renumbering some OTHER
      // field's picklist cannot be credited to this one. Values are not unique across picklists in
      // this schema — 'Date' and 'Email' appear in more than one — so matching a bare `@\w+` would
      // let a foreign write corrupt this replay, in either direction: a spurious red, or a right
      // number that masks a real QuestionType defect.
      const fieldVars = new Set(
        [...sql.matchAll(
          /DECLARE\s+@(\w+)\s+UNIQUEIDENTIFIER\s*=\s*\([^;]*?ef\.\[?Name\]?\s*=\s*N?'QuestionType'/gis,
        )].map((m) => m[1].toLowerCase()),
      );
      const keyedOnQuestionType = (token: string): boolean =>
        token.startsWith('@')
          ? fieldVars.has(token.slice(1).toLowerCase())
          : token.replace(/'/g, '').toUpperCase() === QUESTION_TYPE_FIELD_ID;

      // CodeGen's own INSERT shape, with the EntityField id as a literal.
      for (const m of sql.matchAll(
        /\(\s*'([0-9a-fA-F-]{36})'\s*,\s*'([0-9a-fA-F-]{36})'\s*,\s*(\d+)\s*,\s*'([^']*)'\s*,\s*'([^']*)'/g,
      )) {
        if (m[2].toUpperCase() !== QUESTION_TYPE_FIELD_ID) continue;
        byId.set(m[1].toLowerCase(), { id: m[1].toLowerCase(), sequence: Number(m[3]), value: m[4] });
      }

      // The same INSERT with the field id passed as a variable — the shape this repo prefers
      // (V202608252340) and the one a future question type will almost certainly arrive as.
      // Without this the replay silently misses a CORRECTLY-authored addition and then fails the
      // row-count assertion, blaming the wrong change.
      for (const m of sql.matchAll(
        /\(\s*'([0-9a-fA-F-]{36})'\s*,\s*(@\w+)\s*,\s*(\d+)\s*,\s*'([^']*)'\s*,\s*'([^']*)'/g,
      )) {
        if (!keyedOnQuestionType(m[2])) continue;
        byId.set(m[1].toLowerCase(), { id: m[1].toLowerCase(), sequence: Number(m[3]), value: m[4] });
      }

      // CodeGen's own re-sequence shape: `SET Sequence=N WHERE ID='…'`.
      for (const m of sql.matchAll(
        /EntityFieldValue\]?\s+SET\s+\[?Sequence\]?\s*=\s*(\d+)\s+WHERE\s+\[?ID\]?\s*=\s*'([0-9a-fA-F-]{36})'/gi,
      )) {
        const row = byId.get(m[2].toLowerCase());
        if (row) row.sequence = Number(m[1]);
      }

      // The Signature→Doodle rename: `SET [Value] = 'x', [Code] = 'x' WHERE [ID] = '…'`.
      for (const m of sql.matchAll(
        /EntityFieldValue\]?\s*\n?\s*SET\s+\[?Value\]?\s*=\s*'([^']*)'\s*,\s*\[?Code\]?\s*=\s*'([^']*)'\s*\n?\s*WHERE\s+\[?ID\]?\s*=\s*'([0-9a-fA-F-]{36})'/gi,
      )) {
        const row = byId.get(m[3].toLowerCase());
        if (row) row.value = m[1];
      }

      // The natural-key re-sequence shape this repo prefers (V202608252340), and the one #219's
      // repair uses: `SET [Sequence] = N WHERE [EntityFieldID] = @Var AND [Value] = 'x'`.
      // Scoped to this file's QuestionType variable (or the literal field id) for the reason above.
      for (const m of sql.matchAll(
        /EntityFieldValue\]?\s*\n?\s*SET\s+\[?Sequence\]?\s*=\s*(\d+)\s*\n?\s*WHERE\s+\[?EntityFieldID\]?\s*=\s*(@\w+|'[0-9a-fA-F-]{36}')\s+AND\s+\[?Value\]?\s*=\s*'([^']+)'/gi,
      )) {
        if (!keyedOnQuestionType(m[2])) continue;
        for (const row of byId.values()) if (row.value === m[3]) row.sequence = Number(m[1]);
      }
    }

    return new Map([...byId.values()].map((r) => [r.value, r]));
  }

  it('leaves every QuestionType row at the sequence CodeGen would derive', () => {
    const ordered = [...checkConstraintTypes()].sort(); // CodeGen: bare Array.prototype.sort()
    const shipped = shippedPicklist();

    expect(shipped.size, 'shipped picklist row count').toBe(ordered.length);

    const drifted = ordered
      .map((value, index) => ({ value, want: index + 1, have: shipped.get(value)?.sequence }))
      .filter((r) => r.have !== r.want);

    expect(
      drifted,
      'migrations leave the QuestionType picklist in an order CodeGen would rewrite, and no host ' +
        'ever runs CodeGen against our schema — so this IS the order every metadata-driven value ' +
        'list renders (Explorer\'s generated Form Question form; NOT the builder palette, which is ' +
        'hand-authored in builder/question-type-catalog.ts):\n' +
        drifted.map((d) => `  ${d.value}: shipped ${d.have}, CodeGen wants ${d.want}`).join('\n'),
    ).toEqual([]);
  });
});

describe('the repair migration applies the order it states', () => {
  /**
   * The suite above pins the NUMBERS. It reads a regex projection of the SQL, so it cannot see the
   * mechanism that delivers them — `.claude/rules/testing.md` names exactly this limit ("a test
   * that reads source text asserts presence, not behaviour").
   *
   * Four ways V202609142000 could be broken on a host while that suite stays green, all of which
   * make every UPDATE match zero rows and exit 0:
   *
   *   1. a `GO` between the `DECLARE` and the UPDATEs — `@QuestionTypeFieldID` leaves scope and
   *      every write silently compares against NULL (the file's own header calls this out);
   *   2. the wrong schema placeholder on the UPDATEs — writing to a table that is not there;
   *   3. the entity lookup keyed on the wrong `BaseTable` — THROWs on every host instead;
   *   4. the `IF … THROW` guard deleted — a missing prerequisite becomes silence again.
   *
   * These are structural, so they are checkable structurally. This is presence-testing and says so;
   * the behavioural proof is applying the file to a database, which no unit test can do here.
   */
  const REPAIR = 'V202609142000__v0.12.x__Question_Type_Picklist_Sequence.sql';

  function repairSql(): string {
    const found = shippedMigrations().find((m) => m.file === REPAIR);
    expect(found, `${REPAIR} is missing — #219's repair must not be renamed without updating this spec`).toBeDefined();
    return found!.sql;
  }

  it('keeps the field lookup and every write in one batch, so the variable stays in scope', () => {
    const sql = repairSql();
    const declareAt = sql.indexOf('DECLARE @QuestionTypeFieldID');
    const lastUpdateAt = sql.lastIndexOf('UPDATE [${mjSchema}].[EntityFieldValue]');
    expect(declareAt, 'the field lookup').toBeGreaterThan(-1);
    expect(lastUpdateAt, 'the last renumbering write').toBeGreaterThan(declareAt);

    const between = sql.slice(declareAt, lastUpdateAt);
    const batchBreak = /^\s*GO\s*$/im.test(between);
    expect(
      batchBreak,
      'a GO between the DECLARE and the last UPDATE puts @QuestionTypeFieldID out of scope: every ' +
        'write then matches nothing against NULL and the migration still exits 0',
    ).toBe(false);
  });

  it('writes every sequence to the core schema, not the app schema', () => {
    // `EntityFieldValue` lives in core. `${flyway:defaultSchema}` here would target a table that
    // does not exist there — and a no-op UPDATE against a missing row is indistinguishable from
    // success in the replay above.
    const writes = [...repairSql().matchAll(/UPDATE\s+\[([^\]]+)\]\.\[EntityFieldValue\]\s+SET\s+\[?Sequence\]?/gi)];
    expect(writes.length, 'renumbering writes found').toBe(25);
    expect([...new Set(writes.map((m) => m[1]))]).toEqual(['${mjSchema}']);
  });

  it('refuses to run in silence when its prerequisite is missing', () => {
    const sql = repairSql();
    // Keyed on BaseTable + SchemaName, never Entity.Name — the entity-name prefix is host-
    // configurable, so a name lookup matches nothing on a host configured differently.
    expect(sql).toMatch(/e\.\[BaseTable\]\s*=\s*'FormQuestion'/);
    expect(sql).toMatch(/e\.\[SchemaName\]\s*=\s*'\$\{flyway:defaultSchema\}'/);
    expect(sql, 'the missing-EntityField guard').toMatch(/IF\s+@QuestionTypeFieldID\s+IS\s+NULL\s*\n?\s*THROW/i);
    expect(sql, 'the postcondition that the 25 writes landed').toMatch(/THROW\s+51220/);
  });
});
