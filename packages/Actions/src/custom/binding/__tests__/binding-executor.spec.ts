import { describe, expect, it } from 'vitest';
import {
  CanonicalAnswers,
  parseFieldMappings,
  parseIdentityRule,
  parseMergePolicy,
  type CanonicalAnswerValue,
  type StoredAnswerRow,
} from '@mj-biz-apps/forms-entities';
import {
  executeBinding,
  type BindingConfig,
  type BindingTargetGateway,
  type MatchedRecord,
  type MatchQuery,
  type TargetFields,
} from '../binding-executor';

/** A gateway backed by a plain in-memory record, recording what it was asked to write. */
class FakeGateway implements BindingTargetGateway {
  public writes: { recordId: string | null; values: Record<string, CanonicalAnswerValue> }[] = [];
  public queries: MatchQuery[] = [];

  constructor(
    private readonly options: {
      writableFields?: string[] | null;
      temporalFields?: string[];
      match?: MatchedRecord | null;
      describeThrows?: boolean;
      matchThrows?: boolean;
      writeThrows?: boolean;
    } = {},
  ) {}

  public capabilityAsked: { create: boolean; update: boolean } | null = null;

  async describeEntity(_name: string, needs: { create: boolean; update: boolean }): Promise<TargetFields | null> {
    this.capabilityAsked = needs;
    if (this.options.describeThrows) {
      throw new Error('metadata unavailable');
    }
    if (this.options.writableFields === null) {
      return null;
    }
    return {
      names: new Set(this.options.writableFields ?? ['Email', 'FirstName', 'Phone', 'Notes', 'CompanyID', 'LeadSource']),
      temporal: new Set(this.options.temporalFields ?? []),
    };
  }

  async findMatch(query: MatchQuery): Promise<MatchedRecord | null> {
    this.queries.push(query);
    if (this.options.matchThrows) {
      throw new Error('connection reset');
    }
    return this.options.match ?? null;
  }

  async writeRecord(
    _entityName: string,
    recordId: string | null,
    values: ReadonlyMap<string, CanonicalAnswerValue>,
  ): Promise<string> {
    if (this.options.writeThrows) {
      throw new Error('save refused');
    }
    this.writes.push({ recordId, values: Object.fromEntries(values) });
    return recordId ?? 'new-record-1';
  }
}

function answersOf(rows: Partial<StoredAnswerRow>[]): CanonicalAnswers {
  return new CanonicalAnswers(rows.map((r) => ({ QuestionID: 'q', ...r }) as StoredAnswerRow));
}

function configOf(overrides: Partial<BindingConfig> = {}): BindingConfig {
  return {
    targetEntityName: 'MJ_BizApps_Common: People',
    fieldMappings: parseFieldMappings({
      version: 1,
      fields: [
        { targetField: 'Email', source: { kind: 'question', questionId: 'q-email' }, required: true },
        { targetField: 'FirstName', source: { kind: 'question', questionId: 'q-first' } },
      ],
    }),
    identityRule: parseIdentityRule({
      mode: 'MatchThenCreate',
      match: [{ targetField: 'Email', normalize: 'LowerCaseTrim' }],
    }),
    mergePolicy: parseMergePolicy(null),
    ...overrides,
  };
}

const goodAnswers = answersOf([
  { QuestionID: 'q-email', TextValue: 'a@b.com' },
  { QuestionID: 'q-first', TextValue: 'Ada' },
]);

async function run(gateway: BindingTargetGateway, config = configOf(), answers = goodAnswers, allowed = null) {
  return executeBinding({ config, answers, gateway, allowedEntities: allowed });
}

describe('executeBinding', () => {
  describe('creating', () => {
    it('creates a record when nothing matches', async () => {
      const gateway = new FakeGateway({ match: null });

      const result = await run(gateway);

      expect(result.ok && result.outcome.kind).toBe('Created');
      expect(result.ok && result.outcome.targetRecordId).toBe('new-record-1');
      expect(gateway.writes[0].values).toEqual({ Email: 'a@b.com', FirstName: 'Ada' });
    });

    it('never looks anything up in AlwaysCreate mode', async () => {
      const gateway = new FakeGateway();
      const config = configOf({ identityRule: parseIdentityRule({ mode: 'AlwaysCreate' }) });

      const result = await run(gateway, config);

      expect(result.ok && result.outcome.kind).toBe('Created');
      expect(gateway.queries).toEqual([]);
    });
  });

  describe('merging', () => {
    it('merges into a matched record and reports what it wrote', async () => {
      const gateway = new FakeGateway({
        match: { recordId: 'person-1', values: new Map([['Email', 'a@b.com'], ['FirstName', 'Someone']]), multipleFound: false },
      });

      const result = await run(gateway);

      expect(result.ok && result.outcome.kind).toBe('Merged');
      expect(result.ok && result.outcome.writtenFields).toEqual(['FirstName']);
      expect(gateway.writes[0]).toEqual({ recordId: 'person-1', values: { FirstName: 'Ada' } });
    });

    it('writes nothing at all when the matched record already agrees', async () => {
      const gateway = new FakeGateway({
        match: { recordId: 'person-1', values: new Map([['Email', 'a@b.com'], ['FirstName', 'Ada']]), multipleFound: false },
      });

      const result = await run(gateway);

      expect(result.ok && result.outcome.kind).toBe('Unchanged');
      expect(gateway.writes).toEqual([]);
    });
  });

  describe('identity', () => {
    it('passes the configured normalization to the lookup', async () => {
      const gateway = new FakeGateway();

      await run(gateway);

      expect(gateway.queries[0].criteria).toEqual([
        { field: 'Email', value: 'a@b.com', normalize: 'LowerCaseTrim' },
      ]);
    });

    it('ands the tenant scope into the lookup and stamps it on create', async () => {
      const gateway = new FakeGateway();
      const config = configOf({
        identityRule: parseIdentityRule({
          mode: 'MatchThenCreate',
          match: [{ targetField: 'Email' }],
          scope: [{ targetField: 'CompanyID', value: 'co-1' }],
        }),
      });

      const result = await run(gateway, config);

      expect(gateway.queries[0].criteria).toContainEqual({ field: 'CompanyID', value: 'co-1', normalize: 'ExactMatch' });
      expect(result.ok && gateway.writes[0].values.CompanyID).toBe('co-1');
    });

    it('skips rather than creating when the submission carries no identity value', async () => {
      const gateway = new FakeGateway();
      const answers = answersOf([{ QuestionID: 'q-first', TextValue: 'Ada' }]);
      const config = configOf({
        fieldMappings: parseFieldMappings({
          version: 1,
          fields: [
            { targetField: 'Email', source: { kind: 'question', questionId: 'q-email' } },
            { targetField: 'FirstName', source: { kind: 'question', questionId: 'q-first' } },
          ],
        }),
      });

      const result = await run(gateway, config, answers);

      // A duplicate person costs a manual merge nobody may notice; an unbound submission keeps the
      // answers and can be re-driven later.
      expect(result.ok && result.outcome.kind).toBe('Skipped');
      expect(gateway.writes).toEqual([]);
    });

    it('skips when MatchOrSkip finds nothing, rather than creating', async () => {
      const gateway = new FakeGateway({ match: null });
      const config = configOf({
        identityRule: parseIdentityRule({ mode: 'MatchOrSkip', match: [{ targetField: 'Email' }] }),
      });

      const result = await run(gateway, config);

      expect(result.ok && result.outcome.kind).toBe('Skipped');
      expect(gateway.writes).toEqual([]);
    });

    it('binds to the oldest match by default, and refuses when configured to', async () => {
      const multiple: MatchedRecord = {
        recordId: 'oldest',
        values: new Map([['Email', 'a@b.com']]),
        multipleFound: true,
      };

      const lenient = await run(new FakeGateway({ match: multiple }));
      const strict = await run(
        new FakeGateway({ match: multiple }),
        configOf({
          identityRule: parseIdentityRule({
            mode: 'MatchThenCreate',
            match: [{ targetField: 'Email' }],
            onMultipleMatch: 'Fail',
          }),
        }),
      );

      expect(lenient.ok && lenient.outcome.targetRecordId).toBe('oldest');
      expect(strict.ok).toBe(false);
    });

    it('treats a failed lookup as retryable, never as "no match"', async () => {
      const gateway = new FakeGateway({ matchThrows: true });

      const result = await run(gateway);

      // Falling through to create here would duplicate a record every time the database hiccuped.
      expect(result.ok).toBe(false);
      expect(!result.ok && result.failure.retryable).toBe(true);
      expect(gateway.writes).toEqual([]);
    });
  });

  describe('configuration failures are reported as config, not candidate', () => {
    it('refuses an entity that is not on the allow-list', async () => {
      const result = await executeBinding({
        config: configOf(),
        answers: goodAnswers,
        gateway: new FakeGateway(),
        allowedEntities: new Set(['MJ_BizApps_Forms: Forms']),
      });

      expect(!result.ok && result.failure.scope).toBe('config');
      expect(!result.ok && result.failure.retryable).toBe(false);
    });

    it('refuses an entity that does not resolve', async () => {
      const result = await run(new FakeGateway({ writableFields: null }));

      expect(!result.ok && result.failure.scope).toBe('config');
    });

    it('lists EVERY unwritable target field in one error', async () => {
      const gateway = new FakeGateway({ writableFields: ['Email'] });
      const config = configOf({
        fieldMappings: parseFieldMappings({
          version: 1,
          fields: [
            { targetField: 'Email', source: { kind: 'question', questionId: 'q-email' } },
            { targetField: 'Nope', source: { kind: 'question', questionId: 'q-first' } },
            { targetField: 'AlsoNope', source: { kind: 'static', value: 'x' } },
          ],
        }),
      });

      const result = await run(gateway, config);

      expect(!result.ok && result.failure.scope).toBe('config');
      expect(!result.ok && result.failure.message).toContain('Nope');
      expect(!result.ok && result.failure.message).toContain('AlsoNope');
      expect(gateway.writes).toEqual([]);
    });

    it('treats a metadata read failure as retryable, unlike a genuinely missing entity', async () => {
      const result = await run(new FakeGateway({ describeThrows: true }));

      expect(!result.ok && result.failure.retryable).toBe(true);
    });
  });

  describe('candidate failures', () => {
    it('refuses a submission missing a required mapped value, without partially writing', async () => {
      const gateway = new FakeGateway();
      const answers = answersOf([{ QuestionID: 'q-first', TextValue: 'Ada' }]);

      const result = await run(gateway, configOf(), answers);

      expect(!result.ok && result.failure.scope).toBe('candidate');
      expect(gateway.writes).toEqual([]);
    });

    it('reports a failed write as retryable', async () => {
      const result = await run(new FakeGateway({ writeThrows: true }));

      expect(!result.ok && result.failure.retryable).toBe(true);
    });
  });
});

describe('executeBinding — regressions found in adversarial review', () => {
  it('never creates a record when the submission supplied nothing to write', async () => {
    const gateway = new FakeGateway();
    const config = configOf({
      identityRule: parseIdentityRule({ mode: 'AlwaysCreate' }),
      fieldMappings: parseFieldMappings({
        version: 1,
        fields: [{ targetField: 'Notes', source: { kind: 'question', questionId: 'q-notes' } }],
      }),
    });

    const result = await run(gateway, config, answersOf([{ QuestionID: 'q-other', TextValue: 'x' }]));

    // A blank insert satisfies no lookup, may trip a NOT NULL column as a mystery write failure,
    // and nothing downstream can tell it from a real record.
    expect(result.ok && result.outcome.kind).toBe('Skipped');
    expect(gateway.writes).toEqual([]);
  });

  it('refuses a config whose identity field no mapping can ever supply', async () => {
    const config = configOf({
      fieldMappings: parseFieldMappings({
        version: 1,
        fields: [{ targetField: 'FirstName', source: { kind: 'question', questionId: 'q-first' } }],
      }),
      identityRule: parseIdentityRule({ mode: 'MatchThenCreate', match: [{ targetField: 'Email' }] }),
    });

    const result = await run(new FakeGateway(), config);

    // Otherwise this presents as "the respondent left it blank" on every submission forever, while
    // creating a duplicate each time because the created record never carries the match value.
    expect(!result.ok && result.failure.scope).toBe('config');
    expect(!result.ok && result.failure.message).toContain('Email');
  });

  it('does not rewrite the tenant scope field on an existing record', async () => {
    const gateway = new FakeGateway({
      match: { recordId: 'p1', values: new Map([['Email', 'a@b.com'], ['CompanyID', 'co-1']]), multipleFound: false },
    });
    const config = configOf({
      identityRule: parseIdentityRule({
        mode: 'MatchThenCreate',
        match: [{ targetField: 'Email' }],
        scope: [{ targetField: 'CompanyID', value: 'co-2' }],
      }),
    });

    await run(gateway, config);

    expect(gateway.writes[0]?.values.CompanyID).toBeUndefined();
  });

  it('refuses to map a file answer onto a field until provenance can be verified', async () => {
    const gateway = new FakeGateway();
    const config = configOf({
      fieldMappings: parseFieldMappings({
        version: 1,
        fields: [
          { targetField: 'Email', source: { kind: 'question', questionId: 'q-email' } },
          { targetField: 'Notes', source: { kind: 'question', questionId: 'q-file' } },
        ],
      }),
      identityRule: parseIdentityRule({ mode: 'AlwaysCreate' }),
    });
    const answers = answersOf([
      { QuestionID: 'q-email', TextValue: 'a@b.com' },
      { QuestionID: 'q-file', FileID: 'file-guid-1' },
    ]);

    const result = await run(gateway, config, answers);

    // __mj.File has no owner, so a submitted fileId proves existence, not authorship. Writing one
    // onto a record other users can read is cross-tenant disclosure.
    expect(!result.ok && result.failure.scope).toBe('config');
    expect(!result.ok && result.failure.message).toContain('Notes');
    expect(gateway.writes).toEqual([]);
  });

  it('writes a file answer as its bare GUID, not the wrapper object', async () => {
    const gateway = new FakeGateway();
    const config = configOf({
      fieldMappings: parseFieldMappings({
        version: 1,
        fields: [
          { targetField: 'Email', source: { kind: 'question', questionId: 'q-email' } },
          { targetField: 'Notes', source: { kind: 'question', questionId: 'q-file' } },
        ],
      }),
      identityRule: parseIdentityRule({ mode: 'AlwaysCreate' }),
    });
    const answers = answersOf([
      { QuestionID: 'q-email', TextValue: 'a@b.com' },
      { QuestionID: 'q-file', FileID: 'file-guid-1' },
    ]);

    await executeBinding({ config, answers, gateway, allowedEntities: null, allowFileAnswers: true });

    // Passed through, the wrapper reaches Set() as an object and stringifies to "[object Object]" —
    // a write that succeeds, corrupts the column and reports success.
    expect(gateway.writes[0].values.Notes).toBe('file-guid-1');
  });

  it('asks the entity only for the capability its identity mode actually needs', async () => {
    const createOnly = new FakeGateway();
    await run(createOnly, configOf({ identityRule: parseIdentityRule({ mode: 'AlwaysCreate' }) }));

    const updateOnly = new FakeGateway({ match: { recordId: 'p1', values: new Map(), multipleFound: false } });
    await run(
      updateOnly,
      configOf({ identityRule: parseIdentityRule({ mode: 'MatchOrSkip', match: [{ targetField: 'Email' }] }) }),
    );

    expect(createOnly.capabilityAsked).toEqual({ create: true, update: false });
    expect(updateOnly.capabilityAsked).toEqual({ create: false, update: true });
  });
});

describe('executeBinding — idempotent short-circuit', () => {
  it('returns the prior outcome without touching the target again', async () => {
    const gateway = Object.assign(new FakeGateway(), {
      findPriorOutcome: async () => ({ kind: 'Created' as const, targetRecordId: 'p-1', writtenFields: ['Email'] }),
    });

    const result = await executeBinding({
      config: configOf(),
      answers: goodAnswers,
      gateway,
      allowedEntities: null,
      responseId: 'resp-1',
    });

    // Re-running is already safe — the unique index and identity matching see to that. This keeps
    // it CHEAP, and keeps the reported outcome stable: re-deriving would report `Unchanged` where
    // the ledger says `Created`, which reads like the record was lost.
    expect(result.ok && result.outcome.kind).toBe('Created');
    expect(result.ok && result.outcome.targetRecordId).toBe('p-1');
    expect(gateway.queries).toEqual([]);
    expect(gateway.writes).toEqual([]);
  });

  it('executes anyway when a re-drive is explicitly forced', async () => {
    const gateway = Object.assign(new FakeGateway(), {
      findPriorOutcome: async () => ({ kind: 'Created' as const, targetRecordId: 'p-1', writtenFields: [] }),
    });

    await executeBinding({
      config: configOf(),
      answers: goodAnswers,
      gateway,
      allowedEntities: null,
      responseId: 'resp-1',
      force: true,
    });

    expect(gateway.writes).toHaveLength(1);
  });

  it('executes when the ledger read fails, rather than blocking on it', async () => {
    const gateway = Object.assign(new FakeGateway(), {
      findPriorOutcome: async () => {
        throw new Error('ledger unavailable');
      },
    });

    const result = await executeBinding({
      config: configOf(),
      answers: goodAnswers,
      gateway,
      allowedEntities: null,
      responseId: 'resp-1',
    });

    // The write path is idempotent without the ledger, so a failed read must not stop the binding.
    expect(result.ok && result.outcome.kind).toBe('Created');
  });
});

describe('a date-column answer is written in the shape the TARGET field can hold', () => {
  // The rest of #116 taught every reader that a stored `Time` is an instant on the epoch date and
  // has to be read back as its clock. Binding was the one reader left on the stored scale, and it
  // could not do better: it knew neither the question's type nor the target column's, so a `Time`
  // mapped onto a string field persisted `1970-01-01T14:30:00.000Z` — the "1970" failure the rest
  // of the PR removed, written into someone's data instead of merely displayed.
  //
  // Converting unconditionally would be worse: a `Time` mapped onto a real datetime column must
  // stay an instant, because `'14:30'` reaching a datetime field is `new Date('14:30')` all over
  // again. So the target field's type decides, which is why the gateway now reports it.
  const timeRow = { QuestionID: 'q-time', DateValue: new Date(Date.UTC(1970, 0, 1, 14, 30)) };
  const dateRow = { QuestionID: 'q-date', DateValue: new Date('2026-09-01T00:00:00Z') };

  const mappingTo = (targetField: string, questionId: string): BindingConfig => ({
    targetEntityName: 'People',
    fieldMappings: parseFieldMappings({
      version: 1,
      fields: [{ targetField, source: { kind: 'question', questionId } }],
    }),
    identityRule: parseIdentityRule({ mode: 'AlwaysCreate' }),
    mergePolicy: parseMergePolicy({ version: 1, default: 'latestWins' }),
  });

  const types = new Map([
    ['q-time', 'Time' as const],
    ['q-date', 'Date' as const],
  ]);

  it('writes a Time as its clock when the target column is not temporal', async () => {
    const gateway = new FakeGateway({ writableFields: ['Notes'], temporalFields: [] });
    await executeBinding({
      config: mappingTo('Notes', 'q-time'),
      answers: answersOf([timeRow]),
      gateway,
      allowedEntities: null,
      questionTypes: types,
    });

    expect(gateway.writes[0].values.Notes).toBe('14:30');
  });

  it('writes a Date as its calendar day when the target column is not temporal', async () => {
    const gateway = new FakeGateway({ writableFields: ['Notes'], temporalFields: [] });
    await executeBinding({
      config: mappingTo('Notes', 'q-date'),
      answers: answersOf([dateRow]),
      gateway,
      allowedEntities: null,
      questionTypes: types,
    });

    expect(gateway.writes[0].values.Notes).toBe('2026-09-01');
  });

  it('keeps the instant when the target column IS temporal', async () => {
    // The case that would break if the conversion were unconditional.
    const gateway = new FakeGateway({ writableFields: ['StartsAt'], temporalFields: ['StartsAt'] });
    await executeBinding({
      config: mappingTo('StartsAt', 'q-time'),
      answers: answersOf([timeRow]),
      gateway,
      allowedEntities: null,
      questionTypes: types,
    });

    expect(gateway.writes[0].values.StartsAt).toBe('1970-01-01T14:30:00.000Z');
  });

  it('leaves the value alone when the caller supplies no question types', async () => {
    // Backwards-compatible: a caller that cannot say what the questions are gets today's behaviour
    // rather than a guess.
    const gateway = new FakeGateway({ writableFields: ['Notes'], temporalFields: [] });
    await executeBinding({
      config: mappingTo('Notes', 'q-time'),
      answers: answersOf([timeRow]),
      gateway,
      allowedEntities: null,
    });

    expect(gateway.writes[0].values.Notes).toBe('1970-01-01T14:30:00.000Z');
  });
});
