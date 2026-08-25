/**
 * Fetch one respondent-uploaded file for an authenticated reader — the service behind
 * `GET /forms/files/:fileId`.
 *
 * WHY THE ROUTE EXISTS AT ALL. The Responses tab shows a file answer as its filename, and
 * clicking it opened the `MJ: Files` RECORD — a metadata page for a row, not the résumé the
 * reviewer wanted. MJ's client-side storage API cannot close that gap: it exposes
 * `CreatePreAuthDownloadUrl` but no way to fetch bytes, and a pre-auth URL is exactly what a
 * local-disk driver cannot mint (there is no signature to put in a URL for a directory). A route
 * that streams the bytes works for every provider, and only a route can set the
 * `Content-Disposition` that makes the click SAVE the file rather than navigate to it.
 *
 * ── THE AUTHORIZATION, WHICH IS THE WHOLE DESIGN ────────────────────────────────────────────
 * This route hands out other people's uploads. Two things must both be true, and one query
 * establishes both:
 *
 *   the caller must be able to read the `FormUpload` provenance row for this file.
 *
 * The row is loaded AS THE CALLER, so MJ's own permission model decides — not a hand-rolled role
 * check that drifts from it. And because only a Forms upload has such a row, the route cannot be
 * turned into a reader for arbitrary `MJ: Files` records: no provenance row, no bytes, whatever
 * the id.
 *
 * BE PRECISE ABOUT WHAT THAT BUYS, because the granularity is easy to over-read. `Form Uploads`
 * grants `CanRead` to the `UI` role with no `ReadRLSFilterID`, exactly as `Form Responses` and
 * `Form Response Answers` do. So the question this answers is "may this person read Forms
 * uploads at all", NOT "is this particular response theirs to see": any signed-in user holding
 * `UI` can read every provenance row and therefore download every respondent's file. That is the
 * app's existing posture rather than something this route introduces — the same user can already
 * read every response and answer through the ordinary entity API — and the route deliberately
 * inherits it instead of inventing a second, divergent answer. Narrowing it is a change to the
 * Forms permission model (a row-level filter on those three entities), not to this file.
 *
 * That single check is also what excludes the anonymous respondent session, and excludes it
 * precisely. The "Form Respondent" role grants CanCreate on the two response entities and
 * nothing else, so a magic-link token — which passes MJ's unified auth exactly like an author's
 * token does — reads no provenance row and gets a 404. Had the guard instead been "is this
 * caller anonymous", it would have been a second definition of the same fact, free to disagree
 * with the one the submit path enforces.
 *
 * The `MJ: Files` row is then read ELEVATED, for the same reason the upload path writes it
 * elevated: an ordinary author role carries no `MJ: Files` grant on a clean install, so
 * requiring one would deny the very readers this exists for. Eligibility is the caller's; the
 * privileged read is the system's.
 */
import { LogError } from '@memberjunction/core';
import type { RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import { escapeSqlString } from '@mj-biz-apps/forms-entities';

import { FORM_UPLOAD_ENTITY } from '../public-submit/entity-names.js';
import { readStoredObject, type StorageReadEngine } from '../storage/read-object.js';
import { getDownloadConfig } from './config.js';

/** MJ core's file registry, read only after the provenance row has authorized the caller. */
const FILE_ENTITY = 'MJ: Files';

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The provenance columns this route reads. */
export interface UploadProvenanceRow {
  FileID: string;
  FileName: string | null;
  ContentType: string | null;
  Status: string;
}

/** The `MJ: Files` columns this route reads. */
export interface StoredFileRow {
  ID: string;
  Name: string | null;
  ContentType: string | null;
  ProviderID: string;
  ProviderKey: string | null;
  Status: string;
}

/** The narrow RunView surface the service needs, so tests need no database. */
export interface DownloadRunViewProvider {
  RunView<T = unknown>(params: RunViewParams, contextUser?: UserInfo): Promise<RunViewResult<T>>;
}

/** Injected context for one download. */
export interface DownloadContext {
  /** The authenticated caller. Authorization is decided against this principal. */
  contextUser: UserInfo;
  /** The principal the `MJ: Files` row is read as — see the class comment. */
  elevatedUser: UserInfo;
  runViewProvider: DownloadRunViewProvider;
  storage: StorageReadEngine;
}

/** What the route should send. */
export interface DownloadPayload {
  content: Buffer;
  contentType: string;
  fileName: string;
}

/** Success carries the payload; failure carries the status and the sentence to send. */
export interface DownloadResult {
  ok: boolean;
  payload?: DownloadPayload;
  failure?: { status: number; error: string };
}

function fail(status: number, error: string): DownloadResult {
  return { ok: false, failure: { status, error } };
}

/**
 * The one refusal sentence for every "you cannot have this" case.
 *
 * A malformed id, an id that is not a Forms upload, and an id the caller may not read are
 * deliberately indistinguishable. Telling the difference apart would let a caller probe which
 * file ids exist by reading the error text, which is the whole value of a 404 here.
 */
const NOT_FOUND = 'That file could not be found.';

/** Load one respondent-uploaded file, if this caller is allowed it. */
export async function loadResponseFile(ctx: DownloadContext, fileId: string): Promise<DownloadResult> {
  const wanted = fileId?.trim();
  if (!wanted || !GUID_PATTERN.test(wanted)) {
    return fail(404, NOT_FOUND);
  }

  const upload = await readProvenance(ctx, wanted);
  if (!upload) {
    return fail(404, NOT_FOUND);
  }
  if (upload.Status === 'Revoked') {
    // A different sentence on purpose: this file demonstrably existed and the reader is entitled
    // to it — it was withdrawn. "Not found" would send them looking for a mistake they did not
    // make. The detail view already badges these as revoked, so the two agree.
    return fail(410, 'That file was revoked and is no longer stored.');
  }

  const file = await readFileRecord(ctx, wanted);
  if (!file || !file.ProviderKey || file.Status === 'Deleted') {
    return fail(404, NOT_FOUND);
  }

  try {
    const content = await readStoredObject(
      ctx.storage,
      ctx.elevatedUser,
      { providerId: file.ProviderID, providerKey: file.ProviderKey },
      getDownloadConfig().storageAccountId,
    );
    return {
      ok: true,
      payload: {
        content,
        // The provenance row's copy wins: it is what the Responses tab displayed, and a download
        // whose name differs from the name that was clicked reads as the wrong file.
        contentType: (upload.ContentType || file.ContentType || '').trim() || 'application/octet-stream',
        fileName: (upload.FileName || file.Name || '').trim(),
      },
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    LogError(`[Forms] Download failed for file ${wanted}: ${detail}`);
    return fail(500, 'That file could not be read from storage.');
  }
}

/**
 * The provenance row, read as the CALLER — this is the authorization.
 *
 * A failed RunView is treated exactly like an absent row. A permission denial and a missing
 * record arrive here as the same shape, and guessing which one happened in order to say
 * something more specific is how a probe oracle gets built by accident.
 */
async function readProvenance(ctx: DownloadContext, fileId: string): Promise<UploadProvenanceRow | undefined> {
  const result = await ctx.runViewProvider.RunView<UploadProvenanceRow>(
    {
      EntityName: FORM_UPLOAD_ENTITY,
      ExtraFilter: `FileID='${escapeSqlString(fileId)}'`,
      Fields: ['FileID', 'FileName', 'ContentType', 'Status'],
      MaxRows: 1,
      ResultType: 'simple',
    },
    ctx.contextUser,
  );
  if (!result.Success) {
    LogError(`[Forms] Upload provenance unreadable for file ${fileId}: ${result.ErrorMessage ?? 'no reason given'}`);
    return undefined;
  }
  return result.Results[0];
}

/** The `MJ: Files` row, read elevated. Reached only after the caller has been authorized. */
async function readFileRecord(ctx: DownloadContext, fileId: string): Promise<StoredFileRow | undefined> {
  const result = await ctx.runViewProvider.RunView<StoredFileRow>(
    {
      EntityName: FILE_ENTITY,
      ExtraFilter: `ID='${escapeSqlString(fileId)}'`,
      Fields: ['ID', 'Name', 'ContentType', 'ProviderID', 'ProviderKey', 'Status'],
      MaxRows: 1,
      ResultType: 'simple',
    },
    ctx.elevatedUser,
  );
  if (!result.Success) {
    LogError(`[Forms] File record unreadable for ${fileId}: ${result.ErrorMessage ?? 'no reason given'}`);
    return undefined;
  }
  return result.Results[0];
}
