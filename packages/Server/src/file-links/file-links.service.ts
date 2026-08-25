/**
 * Keep MJ's file↔record links in step with one response's file answers.
 *
 * WHY THIS EXISTS. MJ's record-attachments panel (`<mj-record-attachments>`) shows the files
 * attached to a record by reading ONE table — `__mj.FileEntityRecordLink`, filtered by
 * `EntityID` + `RecordID`. Forms already knows which file belongs to which submission twice over
 * (`FormResponseAnswer.FileID`, and the `FormUpload` provenance ledger), but the panel reads
 * neither, so a résumé uploaded through a form is invisible on the response row and on any
 * business record a binding materializes from it. This module writes the rows the panel reads,
 * for both of those targets, from one definition.
 *
 * ── THE THREE RULES, WHICH ARE THE WHOLE MODULE ─────────────────────────────────────────────
 *
 * 1. IDEMPOTENCY IS THE WRITER'S JOB. `FileEntityRecordLink` carries a primary key and two
 *    foreign keys and nothing else — there is no unique constraint on (FileID, EntityID,
 *    RecordID). Every path that writes here is re-drivable (autosave, promotion, a recovery
 *    sweep re-running a binding), so a blind insert would stack duplicate attachments on a
 *    record until someone noticed. We read what is linked and insert only what is missing.
 *
 * 2. WE MAY ONLY UNLINK FILES THIS RESPONSE UPLOADED. The set of links must mirror the current
 *    answers — a respondent who replaces their upload should not leave the old one on display.
 *    But the panel also lets a human attach files to that same record by hand, and those are not
 *    ours to remove. The test is PROVENANCE, not who created the link row: removable means the
 *    file has a `FormUpload` row for THIS response. Be precise about what that does and does not
 *    cover — a file Forms uploaded for this response, re-attached to the same record by hand and
 *    then dropped from the answers, IS removed, because by that test it is ours. What is out of
 *    scope is every file this response never uploaded, which is everything a person brought from
 *    anywhere else.
 *
 * 3. REPORT, NEVER THROW. The answer row's `FileID` remains the source of truth; a link is a
 *    convenience for the attachments UI. Failing a respondent's submit — or a binding that has
 *    already written a business record — because a convenience row could not be inserted would
 *    trade a real outcome for a cosmetic one. Every failure comes back in the result with
 *    enough context to act on, and the call sites log it.
 *
 * The MJ I/O sits behind {@link FileLinkGateway} for the usual reason: the decisions above are
 * the part worth testing exhaustively, and they are the part a live database makes tedious to
 * exercise.
 */

/** MJ core's soft-link table — the one the record-attachments panel reads. */
export const FILE_ENTITY_RECORD_LINK_ENTITY = 'MJ: File Entity Record Links';

/** The record a set of files should be attached to. */
export interface FileLinkTarget {
  /** The `MJ: Entities` row id of the target entity — the panel filters on the id, not the name. */
  entityId: string;
  /** The target record's primary key, as the link table stores it (`nvarchar(750)`). */
  recordId: string;
}

/** One link row already attached to the target. */
export interface ExistingFileLink {
  linkId: string;
  fileId: string;
}

/** One round trip's worth of state: what is attached, and what Forms is allowed to detach. */
export interface FileLinkState {
  existing: readonly ExistingFileLink[];
  /**
   * The files Forms uploaded FOR THIS RESPONSE. Rule 2 above: only links to these may be
   * removed, so a hand-attached file on the same record survives every re-submission.
   */
  responseOwnedFileIds: readonly string[];
}

/** A single link write's outcome. Never throws on a rejected write — that is a result, not a fault. */
export interface FileLinkWriteResult {
  ok: boolean;
  message?: string;
  /**
   * The write found nothing to do: the row it was going to remove is already gone. Succeeded, but
   * not a deletion — two concurrent reconciles of the same response (an autosave overlapping a
   * submit, a race this codebase handles explicitly elsewhere) both plan the same delete, and
   * reporting the loser as a failure would log an error for the outcome we wanted.
   */
  noop?: boolean;
}

/** Everything this module needs from MemberJunction, and nothing it does not. */
export interface FileLinkGateway {
  /** Existing links for the target plus this response's uploads, in one round trip. */
  loadState(target: FileLinkTarget, responseId: string): Promise<FileLinkState>;
  createLink(target: FileLinkTarget, fileId: string): Promise<FileLinkWriteResult>;
  deleteLink(linkId: string): Promise<FileLinkWriteResult>;
}

export interface SyncFileLinksInput {
  target: FileLinkTarget;
  /** The files that SHOULD be attached: this response's current, verified file answers. */
  fileIds: readonly string[];
  /** The response whose upload provenance scopes what may be detached (rule 2). */
  responseId: string;
}

/** What the sync did, and everything that went wrong doing it. */
export interface SyncFileLinksResult {
  created: number;
  deleted: number;
  /** Non-empty means the caller has something to log. Order matches the order attempted. */
  failures: readonly string[];
}

/** Canonical v4/v-agnostic UUID shape. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Make the target record's attachments match this response's file answers.
 *
 * Reports rather than throws (rule 3): a caller only ever logs the result. Runs one batched read
 * even when there is nothing to attach, because "the respondent removed their only upload" and
 * "this form has no file questions" are indistinguishable from the answer list alone — and the
 * first case is precisely the one a stale link would get wrong.
 */
export async function syncFileLinks(
  gateway: FileLinkGateway,
  input: SyncFileLinksInput,
): Promise<SyncFileLinksResult> {
  const invalid = describeInvalidInput(input);
  if (invalid) {
    // A caller bug, not a runtime condition — but still reported rather than thrown, so one
    // contract covers the whole function and no call site needs a try/catch to stay safe.
    return { created: 0, deleted: 0, failures: [invalid] };
  }

  let state: FileLinkState;
  try {
    state = await gateway.loadState(input.target, input.responseId);
  } catch (error) {
    // A failed read is not an empty record. Writing on that assumption would duplicate every
    // existing link, so a read we could not complete means we change nothing.
    return { created: 0, deleted: 0, failures: [`could not read existing file links: ${detail(error)}`] };
  }

  return applyPlan(gateway, input.target, planFileLinks(foldedFileIds(input.fileIds), state));
}

/** What one sync intends to write. */
interface FileLinkPlan {
  /** File ids to attach, in the caller's spelling. */
  toCreate: readonly string[];
  /** Link row ids to remove. */
  toDelete: readonly string[];
}

/**
 * Decide the adds and removes. Pure, and the reason the gateway exists.
 *
 * A file that is already linked more than once is left exactly as it is: our own writes cannot
 * produce that, removing the extra copy is not what the caller asked for, and a duplicate row in
 * an attachments list is cosmetic where a wrong delete is not.
 */
function planFileLinks(wanted: ReadonlyMap<string, string>, state: FileLinkState): FileLinkPlan {
  const attached = new Set(state.existing.map((link) => fold(link.fileId)));
  const ours = new Set(state.responseOwnedFileIds.map(fold));

  const toCreate: string[] = [];
  for (const [folded, asGiven] of wanted) {
    if (!attached.has(folded)) {
      toCreate.push(asGiven);
    }
  }
  const toDelete = state.existing
    .filter((link) => ours.has(fold(link.fileId)) && !wanted.has(fold(link.fileId)))
    .map((link) => link.linkId);

  return { toCreate, toDelete };
}

/**
 * Run the plan, one write at a time, continuing past a failure.
 *
 * Deliberately not fail-fast: the writes are independent, and abandoning the rest because one
 * link could not be inserted would hide however many of the respondent's other files would have
 * worked. Every failure is collected instead.
 */
async function applyPlan(
  gateway: FileLinkGateway,
  target: FileLinkTarget,
  plan: FileLinkPlan,
): Promise<SyncFileLinksResult> {
  const failures: string[] = [];
  let created = 0;
  let deleted = 0;

  for (const fileId of plan.toCreate) {
    const outcome = await runWrite(
      () => gateway.createLink(target, fileId),
      `could not attach file ${fileId} to ${target.entityId}/${target.recordId}`,
    );
    if (outcome.failure) {
      failures.push(outcome.failure);
    } else if (!outcome.noop) {
      created++;
    }
  }

  for (const linkId of plan.toDelete) {
    const outcome = await runWrite(() => gateway.deleteLink(linkId), `could not remove stale file link ${linkId}`);
    if (outcome.failure) {
      failures.push(outcome.failure);
    } else if (!outcome.noop) {
      deleted++;
    }
  }

  return { created, deleted, failures };
}

/** One write's result as the caller needs it: the failure sentence, or whether it did anything. */
interface WriteOutcome {
  failure?: string;
  noop?: boolean;
}

/** Perform one write, turning a thrown error into the same shape a rejected one takes. */
async function runWrite(write: () => Promise<FileLinkWriteResult>, what: string): Promise<WriteOutcome> {
  try {
    const result = await write();
    return result.ok ? { noop: result.noop } : { failure: `${what}: ${result.message ?? 'the write reported failure'}` };
  } catch (error) {
    return { failure: `${what}: ${detail(error)}` };
  }
}

/**
 * Why this input cannot be acted on, or undefined when it can.
 *
 * `entityId` is held to the GUID shape because the mistake worth catching here is passing an
 * entity NAME where the link table wants the `MJ: Entities` row id — the two are interchangeable
 * in most MJ APIs and are not interchangeable in this one. Nothing else is shape-checked: a
 * record id may legitimately not be a GUID, and a malformed FILE id is better left in the wanted
 * set and reported by the write that rejects it. Filtering one out would move it out of "wanted",
 * where rule 2 reads the absence as "the respondent removed this file" and deletes a link that
 * should have stayed.
 */
function describeInvalidInput(input: SyncFileLinksInput): string | undefined {
  if (!input.target || !isUuid(input.target.entityId)) {
    return `file links: target entity id "${(input.target && input.target.entityId) || ''}" is not an entity id.`;
  }
  if (!isPresent(input.target.recordId)) {
    return 'file links: target record id is required.';
  }
  if (!isPresent(input.responseId)) {
    return 'file links: response id is required.';
  }
  return undefined;
}

function isPresent(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * The wanted set, keyed by folded id so a lookup is case-insensitive, valued by the original.
 *
 * Null-safe throughout, because this runs OUTSIDE the try/catch around the read and the module's
 * whole contract is that it reports rather than throws. Both callers filter for truthy ids today;
 * a rejected promise here would fail a respondent's submission, which is exactly what rule 3
 * exists to prevent — and this package compiles without `strictNullChecks`, so the types do not
 * stand in the way of a caller that stops filtering.
 */
function foldedFileIds(fileIds: readonly string[]): Map<string, string> {
  const wanted = new Map<string, string>();
  for (const fileId of fileIds ?? []) {
    const folded = fold(fileId);
    wanted.set(folded, folded ? String(fileId).trim() : '');
  }
  return wanted;
}

/**
 * GUIDs are compared case-folded because they cross the same boundary every other identifier in
 * this codebase does: minted lowercase on the client, returned uppercase by SQL Server.
 */
function fold(value: string): string {
  return (value ?? '').trim().toLowerCase();
}

function isUuid(value: string | undefined | null): boolean {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

function detail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
