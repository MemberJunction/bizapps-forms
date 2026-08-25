/**
 * The queries and writes behind the file-link reconciler.
 *
 * `file-links.service.spec.ts` pins the DECISIONS against a stub gateway; nothing pinned the
 * gateway itself, which is where three invariants live that no type or constraint protects:
 *
 *   - the provenance view must NOT filter on `Status`. A revoked upload's link is still ours to
 *     remove, and adding `AND Status='Active'` would strand it on the record forever — a change
 *     that reads like tightening and passes every other test in this package.
 *   - a failed read must THROW. Returning an empty state would tell the reconciler "nothing is
 *     attached", and it would then re-insert every link that is already there.
 *   - a link row that is already gone is the outcome the caller wanted, not a failure to log.
 */
import { describe, expect, it } from 'vitest';
import type { BaseEntity, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';

import { FILE_ENTITY_RECORD_LINK_ENTITY } from '../file-links.service';
import { MJFileLinkGateway, type FileLinkDataProvider } from '../mj-file-link-gateway';

const ENTITY_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const RECORD_ID = 'bbbbbbbb-0000-4000-8000-000000000001';
const RESPONSE_ID = 'cccccccc-0000-4000-8000-000000000001';
const FILE_A = 'dddddddd-0000-4000-8000-00000000000a';

const contextUser = { ID: 'system', Name: 'System' } as unknown as UserInfo;
const target = { entityId: ENTITY_ID, recordId: RECORD_ID };

/** The columns the gateway asks for, in the shape `RunViews` hands back. */
interface Row {
  ID?: string;
  FileID: string;
}

function view(results: Row[], success = true): RunViewResult<Row> {
  return {
    Success: success,
    Results: results,
    RowCount: results.length,
    TotalRowCount: results.length,
    ExecutionTime: 0,
    ErrorMessage: success ? '' : 'view exploded',
  } as RunViewResult<Row>;
}

/** A link row that records what was written to it. */
class FakeLinkRecord {
  public FileID = '';
  public EntityID = '';
  public RecordID = '';
  public deleted = false;
  public LatestResult: { CompleteMessage: string } | null = null;

  constructor(
    private readonly options: { saveOk?: boolean; loadOk?: boolean; deleteOk?: boolean } = {},
  ) {}

  public NewRecord(): boolean {
    return true;
  }
  public async Load(): Promise<boolean> {
    return this.options.loadOk !== false;
  }
  public async Save(): Promise<boolean> {
    if (this.options.saveOk === false) {
      this.LatestResult = { CompleteMessage: 'FK_FileEntityRecordLink_Entity' };
      return false;
    }
    return true;
  }
  public async Delete(): Promise<boolean> {
    if (this.options.deleteOk === false) {
      this.LatestResult = { CompleteMessage: 'refused by a trigger' };
      return false;
    }
    this.deleted = true;
    return true;
  }
}

/** The narrow provider surface, captured so the tests can assert on the queries themselves. */
class StubProvider implements FileLinkDataProvider {
  public batches: RunViewParams[][] = [];

  constructor(
    private readonly views: RunViewResult<Row>[],
    public readonly record: FakeLinkRecord | null = new FakeLinkRecord(),
  ) {}

  public async RunViews<T = unknown>(params: RunViewParams[]): Promise<RunViewResult<T>[]> {
    this.batches.push(params);
    return this.views as unknown as RunViewResult<T>[];
  }

  public async GetEntityObject<T extends BaseEntity>(): Promise<T> {
    return this.record as unknown as T;
  }
}

describe('MJFileLinkGateway.loadState', () => {
  it('asks for the links and the response provenance in ONE round trip', async () => {
    const provider = new StubProvider([view([{ ID: 'link-a', FileID: FILE_A }]), view([{ FileID: FILE_A }])]);

    const state = await new MJFileLinkGateway(provider, contextUser).loadState(target, RESPONSE_ID);

    expect(provider.batches).toHaveLength(1);
    expect(provider.batches[0]).toHaveLength(2);
    expect(state.existing).toEqual([{ linkId: 'link-a', fileId: FILE_A }]);
    expect(state.responseOwnedFileIds).toEqual([FILE_A]);
  });

  it('filters the link view by both halves of the target the panel filters on', async () => {
    const provider = new StubProvider([view([]), view([])]);

    await new MJFileLinkGateway(provider, contextUser).loadState(target, RESPONSE_ID);

    const [links] = provider.batches[0];
    expect(links.EntityName).toBe(FILE_ENTITY_RECORD_LINK_ENTITY);
    expect(links.ExtraFilter).toBe(`EntityID='${ENTITY_ID}' AND RecordID='${RECORD_ID}'`);
    expect(links.Fields).toEqual(['ID', 'FileID']);
    expect(links.ResultType).toBe('simple');
  });

  it('does NOT filter the provenance view by Status, so a revoked upload stays ours to remove', async () => {
    const provider = new StubProvider([view([]), view([])]);

    await new MJFileLinkGateway(provider, contextUser).loadState(target, RESPONSE_ID);

    const [, uploads] = provider.batches[0];
    expect(uploads.ExtraFilter).toBe(`ResponseDraftID='${RESPONSE_ID}'`);
    expect(uploads.ExtraFilter).not.toMatch(/Status/i);
  });

  it('escapes a record id that carries a quote', async () => {
    const provider = new StubProvider([view([]), view([])]);

    await new MJFileLinkGateway(provider, contextUser).loadState({ entityId: ENTITY_ID, recordId: "o'brien" }, RESPONSE_ID);

    expect(provider.batches[0][0].ExtraFilter).toContain("RecordID='o''brien'");
  });

  it('throws when the links cannot be read, rather than reporting an empty record', async () => {
    // The whole reason this is a throw: an empty state reads as "nothing is attached", and the
    // reconciler would then re-insert every link already on the record.
    const provider = new StubProvider([view([], false), view([])]);

    await expect(new MJFileLinkGateway(provider, contextUser).loadState(target, RESPONSE_ID)).rejects.toThrow(
      'view exploded',
    );
  });

  it('throws when the provenance cannot be read', async () => {
    // Just as load-bearing in the other direction: an empty owned-set means nothing is removable,
    // so a stale attachment would silently survive every reconcile.
    const provider = new StubProvider([view([]), view([], false)]);

    await expect(new MJFileLinkGateway(provider, contextUser).loadState(target, RESPONSE_ID)).rejects.toThrow(
      'view exploded',
    );
  });
});

describe('MJFileLinkGateway writes', () => {
  it('writes the three columns the panel reads', async () => {
    const provider = new StubProvider([]);

    const result = await new MJFileLinkGateway(provider, contextUser).createLink(target, FILE_A);

    expect(result).toEqual({ ok: true });
    expect(provider.record).toMatchObject({ FileID: FILE_A, EntityID: ENTITY_ID, RecordID: RECORD_ID });
  });

  it('reports a rejected insert with the database\'s own message', async () => {
    const provider = new StubProvider([], new FakeLinkRecord({ saveOk: false }));

    const result = await new MJFileLinkGateway(provider, contextUser).createLink(target, FILE_A);

    expect(result.ok).toBe(false);
    expect(result.message).toContain('FK_FileEntityRecordLink_Entity');
  });

  it('names the entity when no entity object can be made', async () => {
    // `GetEntityObject` logs and returns null; unchecked, the next line fails on a property of
    // null and the error says nothing about which entity was missing.
    const provider = new StubProvider([], null);

    const result = await new MJFileLinkGateway(provider, contextUser).createLink(target, FILE_A);

    expect(result.ok).toBe(false);
    expect(result.message).toContain(FILE_ENTITY_RECORD_LINK_ENTITY);
  });

  it('deletes a link it can load', async () => {
    const provider = new StubProvider([]);

    const result = await new MJFileLinkGateway(provider, contextUser).deleteLink('link-a');

    expect(result).toEqual({ ok: true });
    expect(provider.record?.deleted).toBe(true);
  });

  it('treats an already-removed link as a no-op, not a failure', async () => {
    // A concurrent reconcile of the same response got there first. That is the outcome we wanted;
    // logging it as an error raises an alarm about a race that resolved itself.
    const provider = new StubProvider([], new FakeLinkRecord({ loadOk: false }));

    const result = await new MJFileLinkGateway(provider, contextUser).deleteLink('link-a');

    expect(result).toEqual({ ok: true, noop: true });
  });

  it('reports a refused delete', async () => {
    const provider = new StubProvider([], new FakeLinkRecord({ deleteOk: false }));

    const result = await new MJFileLinkGateway(provider, contextUser).deleteLink('link-a');

    expect(result.ok).toBe(false);
    expect(result.message).toContain('refused by a trigger');
  });
});
