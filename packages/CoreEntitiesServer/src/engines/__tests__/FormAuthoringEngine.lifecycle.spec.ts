/**
 * `FormAuthoringEngine.Archive` and `.Restore` against the emulated database (`forms-world.ts`),
 * with the real `FormEntityServer` over every Form row — so the status machine and the
 * archive-closes-its-links rule that run are the ones a production save runs (DW15).
 *
 * Replaces the browser's `FormsHomeService.setStatus`, which wrote whatever status the list asked
 * for: restore always asked for Draft, which the status machine now refuses for a form with a live
 * version. The engine decides the destination instead.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTHOR,
  DISTRIBUTIONS,
  FORMS,
  VERSIONS,
  distributionRow,
  draftTables,
  formRow,
  formsWorld,
  rowsOf,
  versionRow,
  type ServerSubclasses,
} from '../../testing/forms-world.js';
import type { FakeProviderConfig, FakeRow } from '../../testing/index.js';

vi.mock('@memberjunction/global', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/global')>('@memberjunction/global');
  return { ...actual, RegisterClass: () => () => undefined };
});

const logged = vi.hoisted(() => [] as string[]);
vi.mock('@memberjunction/core', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
  return { ...actual, LogError: (m: string) => logged.push(m), LogStatus: (m: string) => logged.push(m) };
});

vi.mock('@mj-biz-apps/forms-entities', async () => {
  const actual = await vi.importActual<typeof import('@mj-biz-apps/forms-entities')>('@mj-biz-apps/forms-entities');
  const { WriteThroughEntityBase } = await import('../../testing/write-through-entity.js');
  return {
    ...actual,
    mjBizAppsFormsFormEntity: WriteThroughEntityBase,
    mjBizAppsFormsFormVersionEntity: WriteThroughEntityBase,
  };
});

const { FormAuthoringEngine } = await import('../FormAuthoringEngine.js');
const { FormEntityServer } = await import('../../entities/FormEntityServer.js');
const { FormVersionEntityServer } = await import('../../entities/FormVersionEntityServer.js');

const SUBCLASSES = { FormEntityServer, FormVersionEntityServer } as unknown as ServerSubclasses;

/** One form in `status`, with its versions and two Active links and a Closed one. */
function tables(status: string, versions: FakeRow[] = [], form: Partial<FakeRow> = {}): Record<string, FakeRow[]> {
  return {
    ...draftTables(),
    [FORMS]: [formRow({ Status: status, ...form })],
    [VERSIONS]: versions,
    [DISTRIBUTIONS]: [
      distributionRow({ ID: 'd1' }),
      distributionRow({ ID: 'd2' }),
      distributionRow({ ID: 'd3', Status: 'Closed' }),
      distributionRow({ ID: 'other', FormID: 'e9d89f6f-e43c-5d1d-aef7-c46815bbb36a' }),
    ],
  };
}

function world(t: Record<string, FakeRow[]>, config: Partial<FakeProviderConfig> = {}) {
  return formsWorld(SUBCLASSES, t, config);
}

const statusOf = (db: ReturnType<typeof world>, id = '4d81af18-d0fe-5b39-b7de-6a0eb70c5766') => rowsOf(db, FORMS).find((f) => f.ID === id)?.Status;
const linkStatuses = (db: ReturnType<typeof world>) => Object.fromEntries(rowsOf(db, DISTRIBUTIONS).map((d) => [d.ID, d.Status]));

beforeEach(() => {
  logged.length = 0;
});

describe('Archive', () => {
  it('closes the form and every Active link of it in the same transaction (DW15)', async () => {
    const db = world(tables('Published', [versionRow('v1', 1, 'Published')]));

    const result = await FormAuthoringEngine.Instance.Archive('4d81af18-d0fe-5b39-b7de-6a0eb70c5766', db.provider, AUTHOR);

    expect(result).toEqual({ formId: '4d81af18-d0fe-5b39-b7de-6a0eb70c5766', status: 'Closed' });
    expect(statusOf(db)).toBe('Closed');
    expect(linkStatuses(db)).toEqual({ d1: 'Closed', d2: 'Closed', d3: 'Closed', other: 'Active' });
    // The engine's unit of work, with the subclass's archive joining it as a savepoint.
    expect(db.transactions).toEqual(['begin', 'begin:nested', 'commit:nested', 'commit']);
  });

  it('archives a Draft form too', async () => {
    const db = world(tables('Draft'));

    await expect(FormAuthoringEngine.Instance.Archive('4d81af18-d0fe-5b39-b7de-6a0eb70c5766', db.provider, AUTHOR)).resolves.toEqual({ formId: '4d81af18-d0fe-5b39-b7de-6a0eb70c5766', status: 'Closed' });
  });

  it('a link that will not close rolls the whole archive back: the form and every link unchanged', async () => {
    const db = world(tables('Published', [versionRow('v1', 1, 'Published')]), {
      failSaveWhen: (entity, values) => (entity === DISTRIBUTIONS && values.ID === 'd2' ? 'link locked' : false),
    });

    await expect(FormAuthoringEngine.Instance.Archive('4d81af18-d0fe-5b39-b7de-6a0eb70c5766', db.provider, AUTHOR)).rejects.toThrow(/Could not/);

    expect(statusOf(db)).toBe('Published');
    expect(linkStatuses(db)).toEqual({ d1: 'Active', d2: 'Active', d3: 'Closed', other: 'Active' });
    expect(db.transactions.at(-1)).toBe('rollback');
  });

  it('archiving an archived form closes any link still Active, in the same transaction — a retry repairs', async () => {
    // A link left Active under a Closed form (written before archive closed links) keeps a live
    // credential for a form nobody serves. Archiving again is how an author closes it.
    const db = world(tables('Closed'));

    await expect(FormAuthoringEngine.Instance.Archive('4d81af18-d0fe-5b39-b7de-6a0eb70c5766', db.provider, AUTHOR)).resolves.toEqual({ formId: '4d81af18-d0fe-5b39-b7de-6a0eb70c5766', status: 'Closed' });

    expect(linkStatuses(db)).toEqual({ d1: 'Closed', d2: 'Closed', d3: 'Closed', other: 'Active' });
    expect(db.saved.filter((row) => row.entityName === FORMS)).toEqual([]);
    expect(db.transactions).toEqual(['begin', 'commit']);
  });

  it('that repair is all or nothing: a link that will not close leaves every link as it was', async () => {
    const db = world(tables('Closed'), {
      failSaveWhen: (entity, values) => (entity === DISTRIBUTIONS && values.ID === 'd2' ? 'link locked' : false),
    });

    await expect(FormAuthoringEngine.Instance.Archive('4d81af18-d0fe-5b39-b7de-6a0eb70c5766', db.provider, AUTHOR)).rejects.toThrow(/Could not/);

    expect(linkStatuses(db)).toEqual({ d1: 'Active', d2: 'Active', d3: 'Closed', other: 'Active' });
    expect(db.transactions).toEqual(['begin', 'rollback']);
  });

  it('an archived form with no Active link stays as it is and nothing is written', async () => {
    const db = world(tables('Closed'));
    db.tables[DISTRIBUTIONS] = [distributionRow({ ID: 'd3', Status: 'Closed' })];

    await expect(FormAuthoringEngine.Instance.Archive('4d81af18-d0fe-5b39-b7de-6a0eb70c5766', db.provider, AUTHOR)).resolves.toEqual({ formId: '4d81af18-d0fe-5b39-b7de-6a0eb70c5766', status: 'Closed' });
    expect(db.saved).toEqual([]);
  });

  it('refuses a form that does not exist', async () => {
    const db = world(tables('Draft'));

    await expect(FormAuthoringEngine.Instance.Archive('922f4b10-ac2b-5f15-869e-1fb8fbb1f7bb', db.provider, AUTHOR)).rejects.toThrow(/922f4b10-ac2b-5f15-869e-1fb8fbb1f7bb does not exist/);
  });
});

describe('Restore', () => {
  it('returns a form with a Published version to Published (DW15)', async () => {
    const db = world(tables('Closed', [versionRow('v1', 1, 'Retired'), versionRow('v2', 2, 'Published')]));

    const result = await FormAuthoringEngine.Instance.Restore('4d81af18-d0fe-5b39-b7de-6a0eb70c5766', db.provider, AUTHOR);

    expect(result).toEqual({ formId: '4d81af18-d0fe-5b39-b7de-6a0eb70c5766', status: 'Published' });
    expect(statusOf(db)).toBe('Published');
    expect(db.transactions).toEqual(['begin', 'commit']);
  });

  it('does not reopen the links the archive closed — reopening one is its own decision', async () => {
    const db = world(tables('Closed', [versionRow('v1', 1, 'Published')]));
    db.tables[DISTRIBUTIONS] = [distributionRow({ ID: 'd1', Status: 'Closed' })];

    await FormAuthoringEngine.Instance.Restore('4d81af18-d0fe-5b39-b7de-6a0eb70c5766', db.provider, AUTHOR);

    expect(linkStatuses(db)).toEqual({ d1: 'Closed' });
  });

  it('returns a form that was never published to Draft', async () => {
    const db = world(tables('Closed', [versionRow('v1', 1, 'Retired')]));

    await expect(FormAuthoringEngine.Instance.Restore('4d81af18-d0fe-5b39-b7de-6a0eb70c5766', db.provider, AUTHOR)).resolves.toEqual({ formId: '4d81af18-d0fe-5b39-b7de-6a0eb70c5766', status: 'Draft' });
    expect(statusOf(db)).toBe('Draft');
  });

  it('returns a template to Draft — a template is never Published', async () => {
    const db = world(tables('Closed', [], { IsTemplate: true }));

    await expect(FormAuthoringEngine.Instance.Restore('4d81af18-d0fe-5b39-b7de-6a0eb70c5766', db.provider, AUTHOR)).resolves.toEqual({ formId: '4d81af18-d0fe-5b39-b7de-6a0eb70c5766', status: 'Draft' });
  });

  it.each(['Draft', 'Published'])('leaves a %s form as it is — there is nothing to restore — and writes nothing', async (status) => {
    const db = world(tables(status, status === 'Published' ? [versionRow('v1', 1, 'Published')] : []));

    await expect(FormAuthoringEngine.Instance.Restore('4d81af18-d0fe-5b39-b7de-6a0eb70c5766', db.provider, AUTHOR)).resolves.toEqual({ formId: '4d81af18-d0fe-5b39-b7de-6a0eb70c5766', status });
    expect(db.saved).toEqual([]);
  });

  it('refuses rather than guess when the versions cannot be read, writing nothing', async () => {
    const db = world(tables('Closed', [versionRow('v1', 1, 'Published')]), { failRunViewFor: VERSIONS });

    await expect(FormAuthoringEngine.Instance.Restore('4d81af18-d0fe-5b39-b7de-6a0eb70c5766', db.provider, AUTHOR)).rejects.toThrow(/Could not read whether form 4d81af18-d0fe-5b39-b7de-6a0eb70c5766 has a published version/);
    expect(statusOf(db)).toBe('Closed');
  });

  it('a save the status machine refuses is reported with its reason, and nothing is written', async () => {
    // A template holding a Published version (the CHECK forbids it; the data says otherwise): the
    // machine refuses Draft because a live version exists, and the engine never asks for Published.
    const db = world(tables('Closed', [versionRow('v1', 1, 'Published')], { IsTemplate: true }));

    await expect(FormAuthoringEngine.Instance.Restore('4d81af18-d0fe-5b39-b7de-6a0eb70c5766', db.provider, AUTHOR)).rejects.toThrow(/Could not restore/);
    expect(statusOf(db)).toBe('Closed');
  });

  it('logs a failure once, with the form and the user', async () => {
    const db = world(tables('Closed', [versionRow('v1', 1, 'Published')]), { failRunViewFor: VERSIONS });

    await expect(FormAuthoringEngine.Instance.Restore('4d81af18-d0fe-5b39-b7de-6a0eb70c5766', db.provider, AUTHOR)).rejects.toThrow();

    expect(logged.filter((m) => m.includes('published version'))).toEqual([expect.stringMatching(/4d81af18-d0fe-5b39-b7de-6a0eb70c5766.*author-1/)]);
  });
});

describe('Archive / Restore — refusals before the database', () => {
  it.each(['Archive', 'Restore'] as const)('%s refuses a blank form id and a provider without transactions', async (verb) => {
    const db = world(tables('Closed'));
    const noTx = world(tables('Closed'), { noTransactions: true });

    await expect(FormAuthoringEngine.Instance[verb](' ', db.provider, AUTHOR)).rejects.toThrow(/form id is required/);
    await expect(FormAuthoringEngine.Instance[verb]('4d81af18-d0fe-5b39-b7de-6a0eb70c5766', noTx.provider, AUTHOR)).rejects.toThrow(/entity transactions/);
    expect(db.transactions).toEqual([]);
  });
});
