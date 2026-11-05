/**
 * The Form status machine as a table: every (from, to) pair, with and without the publishing
 * engine, and — for the two exits from Closed — with and without a Published version.
 */
import { describe, expect, it } from 'vitest';
import {
  closesForm,
  formStatusViolations,
  needsPublishedVersionCheck,
  type FormStatus,
  type FormStatusWrite,
} from '../form-status-rules.js';

const STATUSES: FormStatus[] = ['Draft', 'Published', 'Closed'];

function update(stored: FormStatus, status: FormStatus, extra: Partial<FormStatusWrite> = {}): FormStatusWrite {
  return { isNew: false, storedStatus: stored, status, isTemplate: false, authorizedByEngine: false, ...extra };
}

const allowed = (write: FormStatusWrite): boolean => formStatusViolations(write).length === 0;

describe('the transition matrix', () => {
  // [from, to, ordinary writer, engine] — exits from Closed are covered below, by version presence.
  const matrix: [FormStatus, FormStatus, boolean, boolean][] = [
    ['Draft', 'Draft', true, true],
    ['Draft', 'Published', false, true],
    ['Draft', 'Closed', true, true],
    ['Published', 'Published', true, true],
    ['Published', 'Closed', true, true],
    ['Published', 'Draft', false, false],
    ['Closed', 'Closed', true, true],
  ];

  it.each(matrix)('%s → %s: ordinary writer %s, engine %s', (from, to, writer, engine) => {
    expect(allowed(update(from, to))).toBe(writer);
    expect(allowed(update(from, to, { authorizedByEngine: true }))).toBe(engine);
  });

  it('Draft → Published without the engine names the engine; Published → Draft says to archive', () => {
    expect(formStatusViolations(update('Draft', 'Published'))[0]).toEqual({
      field: 'Status',
      message: expect.stringMatching(/Only the publishing engine/),
    });
    expect(formStatusViolations(update('Published', 'Draft'))[0].message).toMatch(/Archive it instead/);
  });
});

describe('leaving Closed (restore) — decided by whether a Published version exists', () => {
  it('reads the versions only for an exit from Closed', () => {
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        expect(needsPublishedVersionCheck({ isNew: false, storedStatus: from, status: to })).toBe(from === 'Closed' && to !== 'Closed');
      }
    }
    expect(needsPublishedVersionCheck({ isNew: true, storedStatus: null, status: 'Draft' })).toBe(false);
  });

  it('Closed → Published when a Published version exists; refused when none does', () => {
    expect(allowed(update('Closed', 'Published', { publishedVersionExists: true }))).toBe(true);
    expect(formStatusViolations(update('Closed', 'Published', { publishedVersionExists: false }))[0].message).toMatch(
      /no published version, so restoring it returns it to Draft/,
    );
  });

  it('Closed → Draft when no Published version exists; refused when one does', () => {
    expect(allowed(update('Closed', 'Draft', { publishedVersionExists: false }))).toBe(true);
    expect(formStatusViolations(update('Closed', 'Draft', { publishedVersionExists: true }))[0].message).toMatch(
      /has a published version, so restoring it returns it to Published/,
    );
  });

  it('refuses rather than guesses when the versions could not be read', () => {
    for (const to of ['Draft', 'Published'] as const) {
      expect(formStatusViolations(update('Closed', to))[0].message).toMatch(/Could not read whether this form has a published version/);
    }
  });

  it('the engine flag does not bypass the version rule — restore is not a publish', () => {
    expect(allowed(update('Closed', 'Published', { publishedVersionExists: false, authorizedByEngine: true }))).toBe(false);
  });
});

describe('creating a form', () => {
  it.each(['Draft', 'Closed'] as const)('as %s is open to any writer', (status) => {
    expect(allowed({ isNew: true, storedStatus: null, status, isTemplate: false, authorizedByEngine: false })).toBe(true);
  });

  it('as Published needs the engine', () => {
    const write: FormStatusWrite = { isNew: true, storedStatus: null, status: 'Published', isTemplate: false, authorizedByEngine: false };
    expect(formStatusViolations(write)[0].message).toMatch(/Only the publishing engine may create one as Published/);
    expect(allowed({ ...write, authorizedByEngine: true })).toBe(true);
  });
});

describe('a template is never published', () => {
  it('refuses Published on a template — for the engine too, and on create', () => {
    expect(formStatusViolations(update('Draft', 'Published', { isTemplate: true, authorizedByEngine: true }))).toEqual([
      { field: 'Status', message: expect.stringMatching(/template cannot be published/) },
    ]);
    expect(
      allowed({ isNew: true, storedStatus: null, status: 'Published', isTemplate: true, authorizedByEngine: true }),
    ).toBe(false);
  });

  it('refuses turning a published form INTO a template', () => {
    expect(allowed(update('Published', 'Published', { isTemplate: true }))).toBe(false);
  });

  it('a Draft template saves freely', () => {
    expect(allowed(update('Draft', 'Draft', { isTemplate: true }))).toBe(true);
  });
});

describe('closesForm — the transition that closes the form\'s distributions', () => {
  it('is any move INTO Closed from a stored form, and nothing else', () => {
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        expect(closesForm({ isNew: false, storedStatus: from, status: to })).toBe(to === 'Closed' && from !== 'Closed');
      }
    }
  });

  it('is never a create — a new form has no distributions to close', () => {
    expect(closesForm({ isNew: true, storedStatus: null, status: 'Closed' })).toBe(false);
  });
});
