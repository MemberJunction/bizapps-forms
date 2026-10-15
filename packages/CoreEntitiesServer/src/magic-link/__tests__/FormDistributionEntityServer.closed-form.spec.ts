/**
 * "An archived form has no live share link", held by `FormDistributionEntityServer` itself — so a
 * PLAIN entity save (Explorer's generated form, a direct API write, `MJ.SaveEntityGraph`) cannot open
 * a link on a Closed form, not just `FormDistributionEngine` (#303 Task 6 follow-up, review Minor 9).
 *
 * Runs the real subclass over the emulated database (`forms-world.ts`), so the form it reads is the
 * row in the Forms table, read inside the save.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTHOR,
  DISTRIBUTIONS,
  FORMS,
  distributionRow,
  draftTables,
  formRow,
  formsWorld,
  rowsOf,
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
    mjBizAppsFormsFormDistributionEntity: WriteThroughEntityBase,
  };
});

const { FormEntityServer } = await import('../../entities/FormEntityServer.js');
const { FormVersionEntityServer } = await import('../../entities/FormVersionEntityServer.js');
const { FormDistributionEntityServer } = await import('../FormDistributionEntityServer.js');

const SUBCLASSES = { FormEntityServer, FormVersionEntityServer, FormDistributionEntityServer } as unknown as ServerSubclasses;

/** The saving surface of a distribution as the world hands it out. */
interface Link {
  Status: string;
  IsActive: boolean;
  ResponseCount: number;
  FormID: string;
  Name: string;
  ChannelType: string;
  ID: string;
  NewRecord(): boolean;
  Save(): Promise<boolean>;
  LatestResult: { CompleteMessage: string } | null;
}

function world(formStatus: string, links: FakeRow[], config: Partial<FakeProviderConfig> = {}) {
  return formsWorld(SUBCLASSES, { ...draftTables(), [FORMS]: [formRow({ Status: formStatus })], [DISTRIBUTIONS]: links }, config);
}

async function load(db: ReturnType<typeof world>, id: string): Promise<Link> {
  const read = await db.provider.RunView<Link>({ EntityName: DISTRIBUTIONS, ExtraFilter: `ID='${id}'`, ResultType: 'entity_object' });
  return read.Results[0];
}

const stored = (db: ReturnType<typeof world>, id: string) => rowsOf(db, DISTRIBUTIONS).find((r) => r.ID === id);

beforeEach(() => {
  logged.length = 0;
});

describe('a plain save cannot open a share link on an archived form', () => {
  it('refuses opening a closed link on a Closed form, saying why, and leaves the row as it was', async () => {
    const db = world('Closed', [distributionRow({ ID: 'd1', Status: 'Closed', IsActive: false })]);
    const link = await load(db, 'd1');

    link.Status = 'Active';
    link.IsActive = true;

    expect(await link.Save()).toBe(false);
    expect(link.LatestResult?.CompleteMessage).toMatch(/form is archived/);
    expect(stored(db, 'd1')).toMatchObject({ Status: 'Closed', IsActive: false });
  });

  it('refuses re-activating a paused link (IsActive) on a Closed form', async () => {
    const db = world('Closed', [distributionRow({ ID: 'd1', Status: 'Active', IsActive: false })]);
    const link = await load(db, 'd1');

    link.IsActive = true;

    expect(await link.Save()).toBe(false);
    expect(stored(db, 'd1')?.IsActive).toBe(false);
  });

  it('refuses creating a live link on a Closed form', async () => {
    const db = world('Closed', []);
    const link = (await db.provider.GetEntityObject(DISTRIBUTIONS)) as unknown as Link;
    link.NewRecord();
    Object.assign(link, { FormID: '4d81af18-d0fe-5b39-b7de-6a0eb70c5766', Name: 'x', ChannelType: 'PublicLink', Status: 'Active', IsActive: true, ResponseCount: 0 });

    expect(await link.Save()).toBe(false);
    expect(rowsOf(db, DISTRIBUTIONS)).toEqual([]);
  });

  it.each(['Draft', 'Published'])('lets a link open on a %s form', async (status) => {
    const db = world(status, [distributionRow({ ID: 'd1', Status: 'Closed', IsActive: false })]);
    const link = await load(db, 'd1');

    link.Status = 'Active';
    link.IsActive = true;

    expect(await link.Save()).toBe(true);
    expect(stored(db, 'd1')?.Status).toBe('Active');
  });

  it('lets a link on a Closed form be closed', async () => {
    const db = world('Closed', [distributionRow({ ID: 'd1' })]);
    const link = await load(db, 'd1');

    link.Status = 'Closed';

    expect(await link.Save()).toBe(true);
    expect(stored(db, 'd1')?.Status).toBe('Closed');
  });

  it('does not refuse a save that opens nothing — a stray live link still takes a response count', async () => {
    const db = world('Closed', [distributionRow({ ID: 'd1' })]);
    const link = await load(db, 'd1');

    link.ResponseCount = 1;

    expect(await link.Save()).toBe(true);
  });

  it('fails closed when the form cannot be read — never revealing its status', async () => {
    const db = world('Draft', [distributionRow({ ID: 'd1', Status: 'Closed', IsActive: false })], { failRunViewFor: FORMS });
    const link = await load(db, 'd1');

    link.Status = 'Active';
    link.IsActive = true;

    expect(await link.Save()).toBe(false);
    expect(link.LatestResult?.CompleteMessage).toMatch(/could not be read/);
    expect(link.LatestResult?.CompleteMessage).not.toMatch(/forced runview failure/);
    expect(logged.join('\n')).toMatch(/forced runview failure/);
  });

  it('refuses when the writer cannot see the form, with the same words as a form that is not there', async () => {
    const db = world('Draft', [distributionRow({ ID: 'd1', FormID: 'form-missing', Status: 'Closed', IsActive: false })]);
    const link = await load(db, 'd1');

    link.Status = 'Active';
    link.IsActive = true;

    expect(await link.Save()).toBe(false);
    expect(link.LatestResult?.CompleteMessage).toMatch(/form was not found/);
  });
});
