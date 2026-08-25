/**
 * The file-link reconciler's decision table.
 *
 * Every rule in `file-links.service.ts` exists because the link table has no unique constraint and
 * no owner column: nothing in the database stops a re-drive from stacking duplicate attachments on
 * a record, and nothing marks a link as Forms' to remove. Both guarantees are pure writer-side
 * policy, which makes them exactly the kind of thing that decays silently — a duplicate looks like
 * a UI glitch, and a wrong delete looks like a file that was never uploaded.
 */
import { describe, expect, it } from 'vitest';

import {
  syncFileLinks,
  type ExistingFileLink,
  type FileLinkGateway,
  type FileLinkState,
  type FileLinkTarget,
  type FileLinkWriteResult,
} from '../file-links.service';

const ENTITY_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const RECORD_ID = 'bbbbbbbb-0000-4000-8000-000000000001';
const RESPONSE_ID = 'cccccccc-0000-4000-8000-000000000001';
const FILE_A = 'dddddddd-0000-4000-8000-00000000000a';
const FILE_B = 'dddddddd-0000-4000-8000-00000000000b';

const TARGET: FileLinkTarget = { entityId: ENTITY_ID, recordId: RECORD_ID };

interface StubOptions {
  /** Simulate an unreadable target (a database blip, a permission denial). */
  loadThrows?: string;
  /** File ids whose link insert should be rejected. */
  failCreateFor?: readonly string[];
  /** Link ids whose delete should be rejected. */
  failDeleteFor?: readonly string[];
  /** Link ids another writer already removed, so the delete finds nothing to do. */
  alreadyGone?: readonly string[];
}

/** Records what the reconciler asked for, so the assertions are about decisions, not SQL. */
class StubGateway implements FileLinkGateway {
  public readonly created: string[] = [];
  public readonly deleted: string[] = [];

  constructor(
    private readonly state: FileLinkState,
    private readonly options: StubOptions = {},
  ) {}

  public async loadState(): Promise<FileLinkState> {
    if (this.options.loadThrows) {
      throw new Error(this.options.loadThrows);
    }
    return this.state;
  }

  public async createLink(_target: FileLinkTarget, fileId: string): Promise<FileLinkWriteResult> {
    if ((this.options.failCreateFor ?? []).includes(fileId)) {
      return { ok: false, message: 'FK_FileEntityRecordLink_File' };
    }
    this.created.push(fileId);
    return { ok: true };
  }

  public async deleteLink(linkId: string): Promise<FileLinkWriteResult> {
    if ((this.options.failDeleteFor ?? []).includes(linkId)) {
      return { ok: false, message: 'delete refused' };
    }
    if ((this.options.alreadyGone ?? []).includes(linkId)) {
      return { ok: true, noop: true };
    }
    this.deleted.push(linkId);
    return { ok: true };
  }
}

function state(existing: ExistingFileLink[], responseOwnedFileIds: string[]): FileLinkState {
  return { existing, responseOwnedFileIds };
}

function sync(gateway: FileLinkGateway, fileIds: readonly string[]) {
  return syncFileLinks(gateway, { target: TARGET, fileIds, responseId: RESPONSE_ID });
}

describe('syncFileLinks', () => {
  it('writes nothing when the response has no files and none were ever uploaded', async () => {
    const gateway = new StubGateway(state([], []));

    const result = await sync(gateway, []);

    expect(result).toEqual({ created: 0, deleted: 0, failures: [] });
    expect(gateway.created).toEqual([]);
    expect(gateway.deleted).toEqual([]);
  });

  it('attaches each file answer the first time it is asked', async () => {
    const gateway = new StubGateway(state([], [FILE_A, FILE_B]));

    const result = await sync(gateway, [FILE_A, FILE_B]);

    expect(gateway.created).toEqual([FILE_A, FILE_B]);
    expect(result.created).toBe(2);
    expect(result.failures).toEqual([]);
  });

  it('is idempotent: the same submission a second time writes nothing', async () => {
    // What an autosave, a promotion, or a recovery-sweep re-drive of a binding looks like. There
    // is no unique constraint to catch a second insert, so this test IS the constraint.
    const gateway = new StubGateway(state([{ linkId: 'link-a', fileId: FILE_A }], [FILE_A]));

    const result = await sync(gateway, [FILE_A]);

    expect(gateway.created).toEqual([]);
    expect(gateway.deleted).toEqual([]);
    expect(result).toEqual({ created: 0, deleted: 0, failures: [] });
  });

  it('replaces a link when the respondent replaced the file', async () => {
    const gateway = new StubGateway(state([{ linkId: 'link-a', fileId: FILE_A }], [FILE_A, FILE_B]));

    const result = await sync(gateway, [FILE_B]);

    expect(gateway.created).toEqual([FILE_B]);
    expect(gateway.deleted).toEqual(['link-a']);
    expect(result).toEqual({ created: 1, deleted: 1, failures: [] });
  });

  it('removes the last link when every file answer is cleared', async () => {
    // The case an "empty means nothing to do" short-circuit would get wrong: the respondent
    // deleted their only upload, and the old one must stop being on display.
    const gateway = new StubGateway(state([{ linkId: 'link-a', fileId: FILE_A }], [FILE_A]));

    const result = await sync(gateway, []);

    expect(gateway.deleted).toEqual(['link-a']);
    expect(result.deleted).toBe(1);
  });

  it('never removes a link to a file Forms did not upload for this response', async () => {
    // A human attached this file through the attachments panel. It is on the same record, it is
    // not in the answers, and it is emphatically not ours to delete.
    const gateway = new StubGateway(state([{ linkId: 'link-admin', fileId: FILE_A }], []));

    const result = await sync(gateway, []);

    expect(gateway.deleted).toEqual([]);
    expect(result).toEqual({ created: 0, deleted: 0, failures: [] });
  });

  it('keeps a hand-attached link while reconciling our own on the same record', async () => {
    const gateway = new StubGateway(
      state(
        [
          { linkId: 'link-admin', fileId: FILE_A },
          { linkId: 'link-ours', fileId: FILE_B },
        ],
        [FILE_B],
      ),
    );

    await sync(gateway, []);

    expect(gateway.deleted).toEqual(['link-ours']);
  });

  it('matches ids case-insensitively, so an uppercase row is not linked twice', async () => {
    // Ids are minted lowercase on the client and come back uppercase from SQL Server; comparing
    // them raw would attach the same file again on every single autosave.
    const gateway = new StubGateway(state([{ linkId: 'link-a', fileId: FILE_A.toUpperCase() }], [FILE_A]));

    const result = await sync(gateway, [FILE_A]);

    expect(gateway.created).toEqual([]);
    expect(gateway.deleted).toEqual([]);
    expect(result.failures).toEqual([]);
  });

  it('reports a rejected insert and still attempts the rest', async () => {
    const gateway = new StubGateway(state([], []), { failCreateFor: [FILE_A] });

    const result = await sync(gateway, [FILE_A, FILE_B]);

    expect(gateway.created).toEqual([FILE_B]);
    expect(result.created).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toContain(FILE_A);
    expect(result.failures[0]).toContain('FK_FileEntityRecordLink_File');
  });

  it('reports a rejected delete without abandoning the inserts', async () => {
    const gateway = new StubGateway(state([{ linkId: 'link-a', fileId: FILE_A }], [FILE_A]), {
      failDeleteFor: ['link-a'],
    });

    const result = await sync(gateway, [FILE_B]);

    expect(gateway.created).toEqual([FILE_B]);
    expect(result.created).toBe(1);
    expect(result.deleted).toBe(0);
    expect(result.failures[0]).toContain('link-a');
  });

  it('does not count — or report — a link a concurrent run already removed', async () => {
    // Two reconciles of the same response overlap (an autosave against a submit) and both plan the
    // same delete. The loser must not log a failure for the outcome it wanted, and must not claim
    // a deletion it did not perform.
    const gateway = new StubGateway(state([{ linkId: 'link-a', fileId: FILE_A }], [FILE_A]), {
      alreadyGone: ['link-a'],
    });

    const result = await sync(gateway, []);

    expect(result).toEqual({ created: 0, deleted: 0, failures: [] });
  });

  it('reports rather than throws when a gateway hands back a malformed state', async () => {
    // Rule 3 is "report, never throw", and the plan step used to sit OUTSIDE the only try/catch —
    // so a gateway whose loadState resolved without one of the arrays threw a TypeError straight
    // past both call sites' best-effort posture, failing a respondent's submit for a cosmetic
    // write. Unreachable through the production gateway; the contract is the point.
    const malformed: FileLinkGateway = {
      loadState: async () => ({ responseOwnedFileIds: [FILE_A] }) as unknown as FileLinkState,
      createLink: async () => ({ ok: true }),
      deleteLink: async () => ({ ok: true }),
    };

    const result = await syncFileLinks(malformed, { target: TARGET, fileIds: [FILE_A], responseId: RESPONSE_ID });

    expect(result.created).toBe(0);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatch(/could not/i);
  });

  it('reports an empty file id instead of attempting a link the database must reject', async () => {
    // An empty id can only come from a caller that stopped filtering. Carrying it into the wanted
    // set produced a guaranteed-failing insert whose message was about SQL rather than about the
    // real problem. Dropping it cannot cause a wrongful delete either: no link row has an empty
    // FileID, so it is never in the owned set the delete pass draws from.
    const gateway = new StubGateway(state([], []));

    const result = await sync(gateway, ['', FILE_A]);

    expect(gateway.created).toEqual([FILE_A]);
    expect(result.created).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatch(/empty/i);
  });

  it('changes nothing when the current links could not be read', async () => {
    // A failed read is not an empty record. Writing on that assumption duplicates every link
    // that is already there.
    const gateway = new StubGateway(state([], []), { loadThrows: 'view timed out' });

    const result = await sync(gateway, [FILE_A]);

    expect(gateway.created).toEqual([]);
    expect(gateway.deleted).toEqual([]);
    expect(result.failures[0]).toContain('view timed out');
  });

  it('keeps a file it could not attach in the wanted set, rather than dropping it', async () => {
    // Dropping a file whose insert failed would move it out of "wanted", where the next run reads
    // the absence as "the respondent removed this" and deletes a link that should have stayed.
    // So a rejected insert is reported and the file is still treated as an answer.
    const failing = new StubGateway(state([], [FILE_A]), { failCreateFor: [FILE_A] });
    const rejected = await sync(failing, [FILE_A]);
    expect(rejected.failures).toHaveLength(1);

    // Second run, same answers, with the earlier attempt having succeeded elsewhere: the link is
    // recognised as wanted and survives.
    const retry = new StubGateway(state([{ linkId: 'link-a', fileId: FILE_A }], [FILE_A]));
    const result = await sync(retry, [FILE_A]);

    expect(retry.deleted).toEqual([]);
    expect(result).toEqual({ created: 0, deleted: 0, failures: [] });
  });

  it('refuses a target it cannot address, without calling the gateway', async () => {
    const gateway = new StubGateway(state([], []));

    // An entity NAME where the link table wants the `MJ: Entities` row id — the mix-up worth
    // catching, because every other MJ API accepts either.
    const byName = await syncFileLinks(gateway, {
      target: { entityId: 'MJ_BizApps_Forms: Form Responses', recordId: RECORD_ID },
      fileIds: [FILE_A],
      responseId: RESPONSE_ID,
    });
    const noRecord = await syncFileLinks(gateway, {
      target: { entityId: ENTITY_ID, recordId: '  ' },
      fileIds: [FILE_A],
      responseId: RESPONSE_ID,
    });
    const noResponse = await syncFileLinks(gateway, {
      target: TARGET,
      fileIds: [FILE_A],
      responseId: '',
    });

    expect(byName.failures[0]).toContain('target entity id');
    expect(noRecord.failures[0]).toContain('target record id');
    expect(noResponse.failures[0]).toContain('response id');
    expect(gateway.created).toEqual([]);
  });

  it('collapses a file answered twice into one link', async () => {
    // Two questions on one form can carry the same upload; the record needs one attachment.
    const gateway = new StubGateway(state([], [FILE_A]));

    await sync(gateway, [FILE_A, FILE_A]);

    expect(gateway.created).toEqual([FILE_A]);
  });
});
