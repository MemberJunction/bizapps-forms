/**
 * The FormVersion rules as a table: every status a row can hold, every status a save can write,
 * with and without the publishing engine — so a rule that drifts is a row that goes red, not a
 * path nobody thought to test.
 */
import { describe, expect, it } from 'vitest';
import {
  ENGINE_ONLY_VERSION_FIELDS,
  FROZEN_VERSION_FIELDS,
  formVersionDeleteRefusal,
  formVersionWriteViolations,
  type FormVersionStatus,
  type FormVersionWrite,
} from '../form-version-rules.js';

const STATUSES: FormVersionStatus[] = ['Draft', 'InReview', 'Published', 'Retired', 'Rejected'];

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
    ['Draft', 'InReview', true, false],
    ['Draft', 'Published', true, false],
    ['Draft', 'Retired', true, false],
    ['Draft', 'Rejected', true, false],
    ['InReview', 'Draft', false, false],
    ['InReview', 'InReview', true, true],
    ['InReview', 'Published', true, false],
    ['InReview', 'Retired', false, false],
    ['InReview', 'Rejected', true, false],
    ['Published', 'Draft', false, false],
    ['Published', 'InReview', false, false],
    ['Published', 'Published', true, true],
    ['Published', 'Retired', true, false],
    ['Published', 'Rejected', false, false],
    ['Retired', 'Draft', false, false],
    ['Retired', 'InReview', false, false],
    ['Retired', 'Published', false, false],
    ['Retired', 'Retired', true, true],
    ['Retired', 'Rejected', false, false],
    ['Rejected', 'Draft', false, false],
    ['Rejected', 'InReview', false, false],
    ['Rejected', 'Published', false, false],
    ['Rejected', 'Retired', false, false],
    ['Rejected', 'Rejected', true, true],
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
    expect(formVersionWriteViolations(update('Rejected', 'Published', { authorizedByEngine: true }))[0].message).toMatch(
      /rejected form version cannot change status/,
    );
    expect(formVersionWriteViolations(update('InReview', 'Draft', { authorizedByEngine: true }))[0].message).toMatch(
      /settled by its review/,
    );
    expect(formVersionWriteViolations(update('Published', 'InReview', { authorizedByEngine: true }))[0].message).toMatch(
      /cannot go back to review/,
    );
  });
});

describe('the review columns are the engine\'s alone', () => {
  it.each(ENGINE_ONLY_VERSION_FIELDS)('a writer setting %s is refused on that field; the engine is not', (field) => {
    expect(formVersionWriteViolations(update('InReview', 'InReview', { engineOnlyFields: [field] }))).toEqual([
      { field, message: expect.stringMatching(/only the publishing engine writes it/) },
    ]);
    expect(formVersionWriteViolations(update('InReview', 'InReview', { engineOnlyFields: [field], authorizedByEngine: true }))).toEqual([]);
  });

  it('applies on insert too, alongside a forbidden status', () => {
    const violations = formVersionWriteViolations({ ...insert('InReview'), engineOnlyFields: ['ApprovalWorkflowTaskID'] });
    expect(violations.map((v) => v.field)).toEqual(['Status', 'ApprovalWorkflowTaskID']);
  });
});

describe('a version in review, published, retired or rejected is immutable — even to the engine', () => {
  it.each(FROZEN_VERSION_FIELDS.flatMap((field) => (['Published', 'Retired', 'InReview', 'Rejected'] as const).map((s) => [s, field] as const)))(
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
  it.each(['Draft', 'Rejected'] as const)('a %s version may be deleted', (stored) => {
    expect(formVersionDeleteRefusal(stored)).toBeNull();
  });

  it('a version in review may not — its approval is still open', () => {
    expect(formVersionDeleteRefusal('InReview')).toMatch(/approval is still open/);
  });

  it.each(['Published', 'Retired'] as const)('a %s version may not — responses reference it', (stored) => {
    expect(formVersionDeleteRefusal(stored)).toMatch(/cannot be deleted: responses reference it/);
  });
});
