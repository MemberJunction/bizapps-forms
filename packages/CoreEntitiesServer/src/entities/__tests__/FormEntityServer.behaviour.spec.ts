/**
 * `FormEntityServer` over a fake generated base, writing through the SHARED fake provider
 * (`../../testing`) — the same one engines and forms-server test against — so the transaction the
 * archive opens, the distribution rows it closes, and the version lookup a restore makes all run
 * against one emulated database. The status rules themselves are pinned in `form-status-rules.spec`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EntitySaveOptions } from '@memberjunction/core';
import type { FakeEntityBase } from './fake-entity-base.js';
import {
  makeFakeProvider,
  type FakeProvider,
  type FakeProviderConfig,
  type FakeRow,
  type FakeTableRecord,
} from '../../testing/index.js';
import type { IAnonymousMagicLinkMinter, InviteWriteHost } from '../../magic-link/minter.js';

vi.mock('@memberjunction/global', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/global')>('@memberjunction/global');
  return { ...actual, RegisterClass: () => () => undefined };
});

vi.mock('@memberjunction/core', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
  return { ...actual, LogError: vi.fn(), LogStatus: vi.fn() };
});

vi.mock('@mj-biz-apps/forms-entities', async () => {
  const actual = await vi.importActual<typeof import('@mj-biz-apps/forms-entities')>('@mj-biz-apps/forms-entities');
  const { FakeEntityBase } = await import('./fake-entity-base.js');
  /**
   * The generated distribution base, as the REAL FormDistributionEntityServer runs over it in the
   * end-to-end archive tests: attached to a row of the fake's distributions table, its `Save()`
   * writes the distribution's columns back through that row — so the write lands in whatever
   * transaction the fake provider holds, exactly as a real save on that provider would.
   */
  class FakeDistributionBase extends FakeEntityBase {
    public record: FakeTableRecord | null = null;
    public override async Save(): Promise<boolean> {
      this.events.push('save');
      const record = this.record;
      if (!record) {
        throw new Error('FakeDistributionBase: attach a table record before saving');
      }
      for (const column of DISTRIBUTION_COLUMNS) {
        record[column] = (this as unknown as Record<string, unknown>)[column];
      }
      const ok = await record.Save();
      if (ok) {
        this.stored = { ...this.stored, ...Object.fromEntries(DISTRIBUTION_COLUMNS.map((c) => [c, record[c]])) };
      } else {
        this.LatestResult = { CompleteMessage: record.LatestResult.CompleteMessage };
      }
      return ok;
    }
  }
  return {
    ...actual,
    mjBizAppsFormsFormEntity: FakeEntityBase,
    mjBizAppsFormsFormDistributionEntity: FakeDistributionBase,
  };
});

/** The distribution columns the fake base writes back — the ones the subclass reads or writes. */
const DISTRIBUTION_COLUMNS = ['ID', 'FormID', 'Status', 'IsActive', 'ChannelType', 'CloseAt', 'MagicLinkInviteID', 'PublicLinkToken'];

const { FormEntityServer } = await import('../FormEntityServer.js');
const { FormDistributionEntityServer } = await import('../../magic-link/FormDistributionEntityServer.js');
const { MagicLinkMinterRegistry } = await import('../../magic-link/minter.js');

const VERSIONS = 'MJ_BizApps_Forms: Form Versions';
const DISTRIBUTIONS = 'MJ_BizApps_Forms: Form Distributions';

interface FormColumns {
  ID: string;
  Name: string;
  Status: 'Draft' | 'Published' | 'Closed';
  IsTemplate: boolean;
}
type Subject = InstanceType<typeof FormEntityServer> & FakeEntityBase & FormColumns;
const Construct = FormEntityServer as unknown as new () => Subject;

function distribution(id: string, formId: string, status: 'Draft' | 'Active' | 'Closed'): FakeRow {
  return { ID: id, FormID: formId, Status: status, Name: id };
}

/** A stored form on a fake database holding `tables`. */
function form(status: FormColumns['Status'], config: Partial<FakeProviderConfig> = {}): { s: Subject; db: FakeProvider } {
  const db = makeFakeProvider({ tables: { [VERSIONS]: [], [DISTRIBUTIONS]: [] }, ...config });
  const s = new Construct().load({ ID: 'form-1', Name: 'Intake', Status: status, IsTemplate: false });
  // The fake is typed as the full DatabaseProviderBase; the entity's slot is the entity-data half.
  s.ProviderToUse = db.provider as unknown as Subject['ProviderToUse'];
  return { s, db };
}

describe('MJ runs the rules on every save', () => {
  it('opts in to async validation explicitly, and starts with the engine flag off', () => {
    const { s } = form('Draft');
    expect(s.DefaultSkipAsyncValidation).toBe(false);
    expect(s.AuthorizedByEngine).toBe(false);
  });
});

describe('ValidateAsync — the status machine, reading the row (DW15)', () => {
  it('refuses ANY update when TrackRecordChanges is off — the stored status would be the client\'s claim (fix round 1)', async () => {
    const { s } = form('Draft');
    s.EntityInfo.TrackRecordChanges = false;
    s.Name = 'Renamed';
    expect((await s.ValidateAsync()).Errors[0].Message).toMatch(/TrackRecordChanges/);
  });

  it('refuses Draft → Published from an ordinary writer, and lets the engine through', async () => {
    const { s } = form('Draft');
    s.Status = 'Published';
    expect((await s.ValidateAsync()).Errors.map((e) => e.Source)).toEqual(['Status']);
    s.AuthorizedByEngine = true;
    expect((await s.ValidateAsync()).Success).toBe(true);
  });

  it('refuses Published → Draft', async () => {
    const { s } = form('Published');
    s.Status = 'Draft';
    expect((await s.ValidateAsync()).Success).toBe(false);
  });

  it('restore: Closed → Published is allowed only when THIS form has a Published version', async () => {
    const withVersion = form('Closed', { tables: { [VERSIONS]: [{ ID: 'v1', FormID: 'form-1', Status: 'Published' }], [DISTRIBUTIONS]: [] } });
    withVersion.s.Status = 'Published';
    expect((await withVersion.s.ValidateAsync()).Success).toBe(true);

    // A Published version of ANOTHER form, and a Retired one of this form, do not count.
    const without = form('Closed', {
      tables: {
        [VERSIONS]: [
          { ID: 'v2', FormID: 'form-2', Status: 'Published' },
          { ID: 'v3', FormID: 'form-1', Status: 'Retired' },
        ],
        [DISTRIBUTIONS]: [],
      },
    });
    without.s.Status = 'Published';
    expect((await without.s.ValidateAsync()).Errors[0].Message).toMatch(/no published version/);
  });

  it('restore: Closed → Draft is refused when a Published version exists — the old builder restore (DW15)', async () => {
    const { s } = form('Closed', { tables: { [VERSIONS]: [{ ID: 'v1', FormID: 'form-1', Status: 'Published' }], [DISTRIBUTIONS]: [] } });
    s.Status = 'Draft';
    expect((await s.ValidateAsync()).Errors[0].Message).toMatch(/returns it to Published, not Draft/);
  });

  it('refuses a restore rather than guessing when the versions cannot be read', async () => {
    const { s } = form('Closed', { failRunViewFor: VERSIONS });
    s.Status = 'Draft';
    expect((await s.ValidateAsync()).Errors[0].Message).toMatch(/Could not read whether this form has a published version/);
  });

  it('does not read the versions at all for a save that is not a restore', async () => {
    const { s } = form('Draft', { failRunViewFor: VERSIONS }); // a read here would fail the save
    s.Name = 'Renamed';
    expect((await s.ValidateAsync()).Success).toBe(true);
  });

  it('refuses publishing a template, for the engine too', async () => {
    const { s } = form('Draft');
    s.IsTemplate = true;
    s.Status = 'Published';
    s.AuthorizedByEngine = true;
    expect((await s.ValidateAsync()).Errors[0].Message).toMatch(/template cannot be published/);
  });
});

describe('archiving closes every Active distribution in the same transaction (DW15)', () => {
  function archivable(config: Partial<FakeProviderConfig> = {}) {
    return form('Published', {
      tables: {
        [VERSIONS]: [],
        [DISTRIBUTIONS]: [
          distribution('d-active-1', 'form-1', 'Active'),
          distribution('d-draft', 'form-1', 'Draft'),
          distribution('d-active-2', 'form-1', 'Active'),
          distribution('d-other-form', 'form-2', 'Active'),
        ],
      },
      ...config,
    });
  }
  const statusOf = (db: FakeProvider, id: string) => db.tables[DISTRIBUTIONS].find((d) => d.ID === id)?.Status;

  it('closes exactly this form\'s Active distributions, inside one committed transaction', async () => {
    const { s, db } = archivable();
    s.Status = 'Closed';
    expect(await s.Save()).toBe(true);

    expect(db.transactions).toEqual(['begin', 'commit']);
    expect(s.events).toEqual(['save']);
    expect(statusOf(db, 'd-active-1')).toBe('Closed');
    expect(statusOf(db, 'd-active-2')).toBe('Closed');
    expect(statusOf(db, 'd-draft')).toBe('Draft');
    expect(statusOf(db, 'd-other-form')).toBe('Active');
  });

  it('a distribution that will not close rolls the WHOLE archive back, and refuses it naming that distribution', async () => {
    const { s, db } = archivable({ failSaveWhen: (_entity, values) => values.ID === 'd-active-2' });
    s.Status = 'Closed';
    expect(await s.Save()).toBe(false);

    expect(db.transactions).toEqual(['begin', 'rollback']);
    expect(statusOf(db, 'd-active-1')).toBe('Active'); // closed first, then undone with the rest
    expect(db.saved).toEqual([]);
    expect(s.LatestResult?.CompleteMessage).toMatch(/form-1[\s\S]*d-active-2[\s\S]*rolled back/);
  });

  it('a refused form save closes nothing', async () => {
    const { s, db } = archivable();
    s.saveResult = false;
    s.Status = 'Closed';
    expect(await s.Save()).toBe(false);
    expect(db.saved).toEqual([]);
    expect(statusOf(db, 'd-active-1')).toBe('Active');
  });

  it('a save that does not archive opens no transaction and touches no distribution', async () => {
    const { s, db } = archivable();
    s.Name = 'Renamed';
    expect(await s.Save()).toBe(true);
    expect(db.transactions).toEqual([]);
    expect(db.saved).toEqual([]);
  });

  it('re-saving an already-Closed form is not a second archive', async () => {
    const { s, db } = form('Closed', { tables: { [VERSIONS]: [], [DISTRIBUTIONS]: [distribution('d1', 'form-1', 'Active')] } });
    s.Name = 'Renamed';
    await s.Save();
    expect(db.transactions).toEqual([]);
  });
});

describe('a save MJ does not validate (ReplayOnly, SkipAsyncValidation) is validated here', () => {
  it('SkipAsyncValidation cannot switch the status machine off (fix round 1)', async () => {
    const { s } = form('Draft');
    s.Status = 'Published';
    expect(await s.Save({ SkipAsyncValidation: true } as EntitySaveOptions)).toBe(false);
    expect(s.events).toEqual([]);
    expect(s.LatestResult?.CompleteMessage).toMatch(/SkipAsyncValidation[\s\S]*publishing engine/);
  });

  it('refuses a replayed Draft → Published and never reaches the base save', async () => {
    const { s } = form('Draft');
    s.Status = 'Published';
    expect(await s.Save({ ReplayOnly: true } as EntitySaveOptions)).toBe(false);
    expect(s.events).toEqual([]);
    expect(s.LatestResult?.CompleteMessage).toMatch(/ReplayOnly[\s\S]*publishing engine/);
  });
});

describe('a rolled-back archive leaves no invite write behind (fix round 1, review Important 1)', () => {
  // End to end, with the REAL FormDistributionEntityServer closing each distribution: its save
  // revokes the distribution's invite through the registered minter. Two fake providers stand in
  // for two connections — `db` is the request's provider, whose transaction the archive holds, and
  // `elsewhere` is what the minter writes through when no host is handed to it (MJAPI's
  // process-global provider). A write to `elsewhere` cannot roll back with the archive.
  const INVITES = 'MJ: Magic Link Invites';
  type DistributionSubject = InstanceType<typeof FormDistributionEntityServer> & FakeEntityBase & { record: FakeTableRecord | null };
  const ConstructDistribution = FormDistributionEntityServer as unknown as new () => DistributionSubject;

  function invites(): FakeRow[] {
    return [
      { ID: 'invite-1', Status: 'Active' },
      { ID: 'invite-2', Status: 'Active' },
    ];
  }

  /** A minter that revokes the way MagicLinkInviteMinter does: on `host`, else on its own provider. */
  function revokingMinter(elsewhere: FakeProvider): IAnonymousMagicLinkMinter {
    return {
      MintAnonymousInvite: async () => ({ success: false, message: 'not exercised here' }),
      RevokeAnonymousInvite: async (credential, user, host?: InviteWriteHost) => {
        const target = host ?? elsewhere.provider;
        // The fake hands back its table record; the minter's own code would type it as the invite entity.
        const invite = (await target.GetEntityObject(INVITES, user)) as unknown as FakeTableRecord;
        await invite.Load(credential.inviteId);
        invite.Status = 'Revoked';
        return { success: await invite.Save(), changed: true };
      },
      SetAnonymousInviteExpiry: async () => ({ success: true, changed: false }),
    };
  }

  function archiveWithRealDistributions(config: Partial<FakeProviderConfig> = {}) {
    let db!: FakeProvider;
    const credentialRead = {
      // The distribution's locked re-read of its stored credential (spFormDistributionReadServerColumnsLocked).
      match: /spFormDistributionReadServerColumnsLocked/,
      rows: (sql: string) => {
        const id = /@ID = '([^']+)'/.exec(sql)?.[1];
        const row = db.tables[DISTRIBUTIONS].find((d) => d.ID === id);
        return row ? [{ MagicLinkInviteID: row.MagicLinkInviteID, PublicLinkToken: row.PublicLinkToken }] : [];
      },
    };
    db = makeFakeProvider({
      tables: {
        [VERSIONS]: [],
        [INVITES]: invites(),
        [DISTRIBUTIONS]: [
          { ...distribution('d1', 'form-1', 'Active'), ChannelType: 'PublicLink', IsActive: true, CloseAt: null, MagicLinkInviteID: 'invite-1', PublicLinkToken: 'mj_ml_1' },
          { ...distribution('d2', 'form-1', 'Active'), ChannelType: 'PublicLink', IsActive: true, CloseAt: null, MagicLinkInviteID: 'invite-2', PublicLinkToken: 'mj_ml_2' },
        ],
      },
      sql: [credentialRead],
      wrapEntity: (entityName, record) => {
        if (entityName !== DISTRIBUTIONS) {
          return record;
        }
        const d = new ConstructDistribution();
        d.load(Object.fromEntries(DISTRIBUTION_COLUMNS.map((c) => [c, record[c]])));
        d.record = record;
        d.ProviderToUse = db.provider as unknown as DistributionSubject['ProviderToUse'];
        Object.assign(d.EntityInfo, { BaseTable: 'FormDistribution' });
        return d;
      },
      ...config,
    });
    const elsewhere = makeFakeProvider({ tables: { [INVITES]: invites() } });
    MagicLinkMinterRegistry.Instance.Register(revokingMinter(elsewhere));
    const s = new Construct().load({ ID: 'form-1', Name: 'Intake', Status: 'Published', IsTemplate: false });
    s.ProviderToUse = db.provider as unknown as Subject['ProviderToUse'];
    return { s, db, elsewhere };
  }

  afterEach(() => {
    MagicLinkMinterRegistry.Instance.ClearForTests();
  });

  it('a committed archive revokes each invite INSIDE its transaction, and clears each credential', async () => {
    const { s, db, elsewhere } = archiveWithRealDistributions();
    s.Status = 'Closed';
    expect(await s.Save()).toBe(true);

    expect(db.tables[INVITES].map((i) => i.Status)).toEqual(['Revoked', 'Revoked']);
    expect(elsewhere.saved).toEqual([]); // nothing went around the transaction
    expect(db.tables[DISTRIBUTIONS].map((d) => [d.ID, d.Status, d.MagicLinkInviteID])).toEqual([
      ['d1', 'Closed', null],
      ['d2', 'Closed', null],
    ]);
    expect(db.transactions.at(-1)).toBe('commit');
  });

  it('when a later distribution will not close, the earlier one\'s revoke rolls back with the archive', async () => {
    const { s, db, elsewhere } = archiveWithRealDistributions({
      failSaveWhen: (entity, values) => entity === DISTRIBUTIONS && values.ID === 'd2',
    });
    s.Status = 'Closed';
    expect(await s.Save()).toBe(false);

    expect(db.transactions[0]).toBe('begin');
    expect(db.transactions.at(-1)).toBe('rollback');
    // d1 was closed and its invite revoked before d2 failed; all of it is undone together, so d1
    // is back to a live link holding a LIVE credential — not the #104 dead link.
    expect(db.tables[DISTRIBUTIONS].find((d) => d.ID === 'd1')).toMatchObject({
      Status: 'Active',
      MagicLinkInviteID: 'invite-1',
      PublicLinkToken: 'mj_ml_1',
    });
    expect(db.tables[INVITES].map((i) => i.Status)).toEqual(['Active', 'Active']);
    expect(elsewhere.saved).toEqual([]);
    expect(elsewhere.tables[INVITES].map((i) => i.Status)).toEqual(['Active', 'Active']);
    expect(s.LatestResult?.CompleteMessage).toMatch(/d2[\s\S]*rolled back/);
  });
});
