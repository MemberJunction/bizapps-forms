/**
 * `FormVersionEntityServer` runs over a fake generated base (see `fake-entity-base.ts`): these
 * tests pin the WIRING — that the class reads the row the way the rules expect, opts in to MJ's
 * async validation, closes the ReplayOnly hole, and refuses deletes — while `form-version-rules.spec`
 * pins the rules themselves.
 */
import { describe, expect, it, vi } from 'vitest';
import type { EntitySaveOptions } from '@memberjunction/core';
import type { FakeEntityBase } from './fake-entity-base.js';

vi.mock('@memberjunction/global', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/global')>('@memberjunction/global');
  return { ...actual, RegisterClass: () => () => undefined };
});

vi.mock('@mj-biz-apps/forms-entities', async () => {
  const actual = await vi.importActual<typeof import('@mj-biz-apps/forms-entities')>('@mj-biz-apps/forms-entities');
  const { FakeEntityBase } = await import('./fake-entity-base.js');
  return { ...actual, mjBizAppsFormsFormVersionEntity: FakeEntityBase };
});

const { FormVersionEntityServer } = await import('../FormVersionEntityServer.js');

interface VersionColumns {
  ID: string;
  FormID: string;
  VersionNumber: number;
  Status: 'Draft' | 'Published' | 'Retired';
  DefinitionSnapshot: string;
}
type Subject = InstanceType<typeof FormVersionEntityServer> & FakeEntityBase & VersionColumns;
const Construct = FormVersionEntityServer as unknown as new () => Subject;

function loaded(values: Partial<VersionColumns> = {}): Subject {
  return new Construct().load({
    ID: 'ver-1',
    FormID: 'form-1',
    VersionNumber: 1,
    Status: 'Published',
    DefinitionSnapshot: '{"pages":[]}',
    ...values,
  });
}

function created(values: Partial<VersionColumns>): Subject {
  const s = new Construct();
  Object.assign(s, { ID: 'ver-new', FormID: 'form-1', VersionNumber: 2, DefinitionSnapshot: '{}', ...values });
  return s;
}

describe('MJ runs the rules on every save', () => {
  it('opts in to async validation explicitly', () => {
    expect(loaded().DefaultSkipAsyncValidation).toBe(false);
  });

  it('the engine flag is off on a fresh instance — every writer is ordinary until the engine says otherwise', () => {
    expect(new Construct().AuthorizedByEngine).toBe(false);
  });
});

describe('ValidateAsync reads the row the way the rules expect (DW5)', () => {
  it('refuses ANY update when TrackRecordChanges is off — the stored status would be the client\'s claim (fix round 1)', async () => {
    const s = loaded({ Status: 'Draft' });
    s.EntityInfo.TrackRecordChanges = false;
    const result = await s.ValidateAsync();
    expect(result.Success).toBe(false);
    expect(result.Errors[0].Message).toMatch(/TrackRecordChanges/);
    // A create has no stored state to trust, so it is unaffected.
    const fresh = created({ Status: 'Draft' });
    fresh.EntityInfo.TrackRecordChanges = false;
    expect((await fresh.ValidateAsync()).Success).toBe(true);
  });

  it('refuses inserting a Published version without the engine flag, on Status', async () => {
    const result = await created({ Status: 'Published' }).ValidateAsync();
    expect(result.Success).toBe(false);
    expect(result.Errors.map((e) => e.Source)).toEqual(['Status']);
    expect(result.Errors[0].Message).toMatch(/only the publishing engine/);
  });

  it('lets the engine insert a Published version', async () => {
    const s = created({ Status: 'Published' });
    s.AuthorizedByEngine = true;
    expect((await s.ValidateAsync()).Success).toBe(true);
  });

  it('refuses a DefinitionSnapshot change on a Published row — the stored status, not the new one, decides', async () => {
    const s = loaded();
    s.DefinitionSnapshot = '{"pages":["tampered"]}';
    s.AuthorizedByEngine = true; // not even the engine may rewrite history
    const result = await s.ValidateAsync();
    expect(result.Success).toBe(false);
    expect(result.Errors.map((e) => e.Source)).toEqual(['DefinitionSnapshot']);
  });

  it('refuses a VersionNumber or FormID change on a Retired row', async () => {
    const s = loaded({ Status: 'Retired' });
    s.VersionNumber = 9;
    s.FormID = 'form-2';
    expect((await s.ValidateAsync()).Errors.map((e) => e.Source).sort()).toEqual(['FormID', 'VersionNumber']);
  });

  it('refuses Published → Retired without the engine; allows it with', async () => {
    const s = loaded();
    s.Status = 'Retired';
    expect((await s.ValidateAsync()).Success).toBe(false);
    s.AuthorizedByEngine = true;
    expect((await s.ValidateAsync()).Success).toBe(true);
  });

  it('refuses Retired → Published even for the engine', async () => {
    const s = loaded({ Status: 'Retired' });
    s.Status = 'Published';
    s.AuthorizedByEngine = true;
    expect((await s.ValidateAsync()).Errors[0].Message).toMatch(/retired form version cannot change status/);
  });

  it('lets a Draft be edited freely — the authoring action writes Draft v1 today', async () => {
    const s = loaded({ Status: 'Draft' });
    s.DefinitionSnapshot = '{"pages":[1]}';
    expect((await s.ValidateAsync()).Success).toBe(true);
    expect((await created({ Status: 'Draft' }).ValidateAsync()).Success).toBe(true);
  });
});

describe('a save MJ does not validate (ReplayOnly, SkipAsyncValidation) is validated here', () => {
  it('SkipAsyncValidation cannot switch the invariants off: the same check runs here and refuses (fix round 1)', async () => {
    const s = created({ Status: 'Published' });
    expect(await s.Save({ SkipAsyncValidation: true } as EntitySaveOptions)).toBe(false);
    expect(s.events).toEqual([]);
    expect(s.LatestResult?.CompleteMessage).toMatch(/SkipAsyncValidation[\s\S]*only the publishing engine/);
  });

  it('SkipAsyncValidation on a VALID save still saves, with its options intact', async () => {
    const s = created({ Status: 'Draft' });
    const options = { SkipAsyncValidation: true } as EntitySaveOptions;
    expect(await s.Save(options)).toBe(true);
    expect(s.saveOptions).toEqual([options]);
  });

  it('refuses a replayed publish and never reaches the base save', async () => {
    const s = created({ Status: 'Published' });
    expect(await s.Save({ ReplayOnly: true } as EntitySaveOptions)).toBe(false);
    expect(s.events).toEqual([]);
    expect(s.LatestResult?.CompleteMessage).toMatch(/ReplayOnly[\s\S]*only the publishing engine/);
  });

  it('lets a valid replay through, with its options intact', async () => {
    const s = created({ Status: 'Draft' });
    const options = { ReplayOnly: true } as EntitySaveOptions;
    expect(await s.Save(options)).toBe(true);
    expect(s.saveOptions).toEqual([options]);
  });

  it('an ordinary save goes straight to MJ, which runs ValidateAsync itself', async () => {
    const s = created({ Status: 'Published' }); // would be refused — but by MJ's own pipeline, not twice
    expect(await s.Save()).toBe(true);
    expect(s.events).toEqual(['save']);
  });
});

describe('deleting a version', () => {
  it.each(['Published', 'Retired'] as const)('refuses a %s version, by its STORED status, with the reason', async (status) => {
    const s = loaded({ Status: status });
    s.Status = 'Draft'; // an in-memory edit does not make a stored published version deletable
    expect(await s.Delete()).toBe(false);
    expect(s.events).toEqual([]);
    expect(s.LatestResult?.CompleteMessage).toMatch(/cannot be deleted: responses reference it/);
  });

  it('deletes a Draft', async () => {
    const s = loaded({ Status: 'Draft' });
    expect(await s.Delete()).toBe(true);
    expect(s.events).toEqual(['delete']);
  });
});
