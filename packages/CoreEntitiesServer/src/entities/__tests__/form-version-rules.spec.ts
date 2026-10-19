/**
 * The FormVersion rules as a table: every status a row can hold, every status a save can write,
 * with and without the publishing engine — so a rule that drifts is a row that goes red, not a
 * path nobody thought to test.
 */
import { describe, expect, it } from 'vitest';
import {
  FROZEN_VERSION_FIELDS,
  formVersionDeleteRefusal,
  formVersionWriteViolations,
  type FormVersionStatus,
  type FormVersionWrite,
} from '../form-version-rules.js';

const STATUSES: FormVersionStatus[] = ['Draft', 'Published', 'Retired'];

function update(stored: FormVersionStatus, status: FormVersionStatus, extra: Partial<FormVersionWrite> = {}): FormVersionWrite {
  return { isNew: false, storedStatus: stored, status, changedFields: [], authorizedByEngine: false, ...extra };
}

function insert(status: FormVersionStatus, authorizedByEngine = false): FormVersionWrite {
  return { isNew: true, storedStatus: null, status, changedFields: [], authorizedByEngine };
}

describe('creating a version', () => {
  it('as Draft is open to any writer — the AI authoring action does exactly this today', () => {
    expect(formVersionWriteViolations(insert('Draft'))).toEqual([]);
  });

  it.each(['Published', 'Retired'] as const)('as %s is refused without the engine, on Status, naming the engine', (status) => {
    const violations = formVersionWriteViolations(insert(status));
    expect(violations).toHaveLength(1);
    expect(violations[0].field).toBe('Status');
    expect(violations[0].message).toMatch(/only the publishing engine/);
  });

  it('as Published is allowed for the engine', () => {
    expect(formVersionWriteViolations(insert('Published', true))).toEqual([]);
  });
});

describe('changing a version\'s status — the full matrix', () => {
  // [from, to, engine-allowed, ordinary-writer-allowed]
  const matrix: [FormVersionStatus, FormVersionStatus, boolean, boolean][] = [
    ['Draft', 'Draft', true, true],
    ['Draft', 'Published', true, false],
    ['Draft', 'Retired', true, false],
    ['Published', 'Published', true, true],
    ['Published', 'Retired', true, false],
    ['Published', 'Draft', false, false],
    ['Retired', 'Retired', true, true],
    ['Retired', 'Draft', false, false],
    ['Retired', 'Published', false, false],
  ];

  it('covers every pair of statuses', () => {
    expect(matrix.map(([from, to]) => `${from}>${to}`).sort()).toEqual(
      STATUSES.flatMap((from) => STATUSES.map((to) => `${from}>${to}`)).sort(),
    );
  });

  it.each(matrix)('%s → %s: engine %s, ordinary writer %s', (from, to, engineAllowed, writerAllowed) => {
    expect(formVersionWriteViolations(update(from, to, { authorizedByEngine: true })).length === 0).toBe(engineAllowed);
    expect(formVersionWriteViolations(update(from, to)).length === 0).toBe(writerAllowed);
  });

  it('names the refusal for each forbidden kind of change', () => {
    expect(formVersionWriteViolations(update('Retired', 'Published', { authorizedByEngine: true }))[0].message).toMatch(
      /retired form version cannot change status/,
    );
    expect(formVersionWriteViolations(update('Published', 'Draft', { authorizedByEngine: true }))[0].message).toMatch(
      /cannot return to Draft/,
    );
    expect(formVersionWriteViolations(update('Published', 'Retired'))[0].message).toMatch(/only the publishing engine/);
  });
});

describe('a published or retired version is immutable — even to the engine', () => {
  it.each(FROZEN_VERSION_FIELDS.flatMap((field) => (['Published', 'Retired'] as const).map((s) => [s, field] as const)))(
    '%s: a change to %s is refused on that field',
    (stored, field) => {
      for (const engine of [false, true]) {
        const violations = formVersionWriteViolations(update(stored, stored, { changedFields: [field], authorizedByEngine: engine }));
        expect(violations).toEqual([{ field, message: expect.stringMatching(/Publish a new version instead/) }]);
      }
    },
  );

  it('a Draft version may change its definition, number and form freely — it is still being authored', () => {
    expect(formVersionWriteViolations(update('Draft', 'Draft', { changedFields: [...FROZEN_VERSION_FIELDS] }))).toEqual([]);
  });

  it('reports a frozen-field change AND a forbidden status change together, not just the first', () => {
    const violations = formVersionWriteViolations(update('Published', 'Draft', { changedFields: ['DefinitionSnapshot'] }));
    expect(violations.map((v) => v.field)).toEqual(['DefinitionSnapshot', 'Status']);
  });
});

describe('deleting a version', () => {
  it('a Draft may be deleted', () => {
    expect(formVersionDeleteRefusal('Draft')).toBeNull();
  });

  it.each(['Published', 'Retired'] as const)('a %s version may not — responses reference it', (stored) => {
    expect(formVersionDeleteRefusal(stored)).toMatch(/cannot be deleted: responses reference it/);
  });
});
