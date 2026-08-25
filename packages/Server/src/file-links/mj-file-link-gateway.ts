/**
 * The MemberJunction implementation of {@link FileLinkGateway} — every database call the
 * file-link reconciler needs, and no decision about what to do with the answers.
 *
 * Runs entirely under the caller's `contextUser`. That principal differs by call site and the
 * difference is deliberate: the submit path writes as the elevated system user (the anonymous
 * respondent role holds no `MJ: Files` or link-table grant at all, by design), and the binding
 * path writes as the automation service principal. Neither is ever the respondent.
 *
 * The provider is injected rather than reached for globally so the submit path uses the SAME
 * per-request provider as the rest of the submission — {@link globalFileLinkProvider} exists for
 * the automation path, which has no per-request handle and already reaches MJ this way.
 */
import { Metadata, RunView } from '@memberjunction/core';
import type { BaseEntity, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import type { MJFileEntityRecordLinkEntity } from '@memberjunction/core-entities';
import { quoteSqlString } from '@mj-biz-apps/forms-entities';

import { FORM_UPLOAD_ENTITY } from '../public-submit/entity-names.js';
import {
  FILE_ENTITY_RECORD_LINK_ENTITY,
  type FileLinkGateway,
  type FileLinkState,
  type FileLinkTarget,
  type FileLinkWriteResult,
} from './file-links.service.js';

/** The narrow MJ surface this gateway needs; `DatabaseProviderBase` satisfies it as-is. */
export interface FileLinkDataProvider {
  RunViews<T = unknown>(params: RunViewParams[], contextUser?: UserInfo): Promise<RunViewResult<T>[]>;
  GetEntityObject<T extends BaseEntity>(entityName: string, contextUser?: UserInfo): Promise<T>;
}

/**
 * The columns the two views return. Only the link view has an `ID` — one row type rather than
 * two because `RunViews` is generic over a single shape, and inventing a union here would buy
 * nothing that the two field lists below do not already state.
 */
interface FileLinkQueryRow {
  ID?: string;
  FileID: string;
}

/** MJ reached through its global provider, for call sites that hold no per-request one. */
export function globalFileLinkProvider(): FileLinkDataProvider {
  return {
    RunViews: <T,>(params: RunViewParams[], contextUser?: UserInfo): Promise<RunViewResult<T>[]> =>
      new RunView().RunViews<T>(params, contextUser),
    GetEntityObject: <T extends BaseEntity>(entityName: string, contextUser?: UserInfo): Promise<T> =>
      new Metadata().GetEntityObject<T>(entityName, contextUser),
  };
}

export class MJFileLinkGateway implements FileLinkGateway {
  constructor(
    private readonly provider: FileLinkDataProvider,
    private readonly contextUser: UserInfo,
  ) {}

  /**
   * What is attached to the target, and which of those files Forms uploaded for this response.
   *
   * Batched because the two answers are needed together and neither depends on the other: the
   * provenance view is filtered by the RESPONSE, not by the file ids we happen to be carrying,
   * which is what lets one round trip settle both the adds and the removes.
   *
   * Throws when either read fails. The reconciler catches it and changes nothing — the one thing
   * it must not do is mistake "we could not find out what is attached" for "nothing is attached".
   */
  public async loadState(target: FileLinkTarget, responseId: string): Promise<FileLinkState> {
    // ⚠️ The `?? ''` is the local escaper's `(value || '')` tolerance, preserved verbatim when that
    // copy was replaced by the shared `quoteSqlString`. It is NOT redundant with the `string` types
    // above: this package compiles without `strictNullChecks`, so an undefined id reaches here
    // silently, and the old helper turned it into `''`. Keeping it makes the consolidation a pure
    // refactor. It is arguably the wrong behaviour — an undefined `entityId` yields `EntityID=''`,
    // which matches nothing, and `loadState` then reports "nothing is attached", the one conclusion
    // this class's own comment says it must never reach by accident. Fixing that is a behaviour
    // change and belongs in its own commit; it is listed as a follow-up.
    const [links, uploads] = await this.provider.RunViews<FileLinkQueryRow>(
      [
        {
          EntityName: FILE_ENTITY_RECORD_LINK_ENTITY,
          ExtraFilter:
            `EntityID=${quoteSqlString(target.entityId ?? '')} ` +
            `AND RecordID=${quoteSqlString(target.recordId ?? '')}`,
          Fields: ['ID', 'FileID'],
          ResultType: 'simple',
        },
        {
          // Every upload Forms recorded against this response, INCLUDING revoked ones: a revoked
          // upload's link is still ours to remove, and filtering them out here would strand it.
          EntityName: FORM_UPLOAD_ENTITY,
          ExtraFilter: `ResponseDraftID=${quoteSqlString(responseId ?? '')}`,
          Fields: ['FileID'],
          ResultType: 'simple',
        },
      ],
      this.contextUser,
    );
    if (!links || !links.Success) {
      throw new Error(links?.ErrorMessage || 'the existing file links could not be read');
    }
    if (!uploads || !uploads.Success) {
      throw new Error(uploads?.ErrorMessage || 'the upload provenance for this response could not be read');
    }

    return {
      existing: (links.Results || [])
        .filter((row) => Boolean(row.ID))
        .map((row) => ({ linkId: row.ID as string, fileId: row.FileID })),
      responseOwnedFileIds: (uploads.Results || []).map((row) => row.FileID),
    };
  }

  public async createLink(target: FileLinkTarget, fileId: string): Promise<FileLinkWriteResult> {
    const link = await this.linkRecord();
    if (!link) {
      return { ok: false, message: `no entity object for "${FILE_ENTITY_RECORD_LINK_ENTITY}"` };
    }
    link.NewRecord();
    link.FileID = fileId;
    link.EntityID = target.entityId;
    link.RecordID = target.recordId;
    if (await link.Save()) {
      return { ok: true };
    }
    return { ok: false, message: link.LatestResult?.CompleteMessage || 'Save() returned false' };
  }

  public async deleteLink(linkId: string): Promise<FileLinkWriteResult> {
    const link = await this.linkRecord();
    if (!link) {
      return { ok: false, message: `no entity object for "${FILE_ENTITY_RECORD_LINK_ENTITY}"` };
    }
    if (!(await link.Load(linkId))) {
      // Already gone. Reported as a no-op rather than a failure: this is reached when a
      // concurrent reconcile of the same response removed the row first, which is the outcome we
      // wanted — logging it as an error would raise an alarm about a race that resolved itself.
      // Not counted as a deletion either, so the count stays reconcilable against the table.
      return { ok: true, noop: true };
    }
    if (await link.Delete()) {
      return { ok: true };
    }
    return { ok: false, message: link.LatestResult?.CompleteMessage || 'Delete() returned false' };
  }

  /**
   * `GetEntityObject` logs and returns null rather than throwing, so an unchecked call here would
   * fail later with a message about a property of null instead of naming the entity. The nullable
   * return type says that out loud — MJ's own signature promises a `T`, which would make both
   * callers' guards read as dead code to anyone compiling this under `strict`.
   */
  private async linkRecord(): Promise<MJFileEntityRecordLinkEntity | null> {
    return this.provider.GetEntityObject<MJFileEntityRecordLinkEntity>(
      FILE_ENTITY_RECORD_LINK_ENTITY,
      this.contextUser,
    );
  }
}
