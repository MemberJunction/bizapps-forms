/**
 * The one way this package runs a Forms Remote Operation (`Forms.PublishForm`, `Forms.CloneForm`, …).
 *
 * `BaseRemotableOperation.Execute()` reports a refusal as a result rather than a throw, and its
 * result has three ways to be unusable — `Success: false`, a `Success: true` with no `Output`, and a
 * transport throw before the server answered. Every caller had to remember all three, and a caller
 * that read `Output!` on a `Success: false` would have shown the author nothing at all. Folded here
 * into one discriminated outcome whose failure always carries a sentence worth showing.
 *
 * The server's `ErrorMessage` is shown as it is: Forms operations return fixed, author-facing
 * messages and keep provider detail in the server log, so there is nothing to soften. The log line
 * here names the operation and what was being done, which the author-facing message leaves out.
 *
 * A successful operation is ANNOUNCED for the entities it wrote (`forms-writes.ts`): the server
 * wrote those rows, so no client record raises the save event the other open surfaces listen for.
 *
 * Not in the `shared` barrel, which is for code that does no I/O.
 */
import { LogError, type BaseRemotableOperation, type RemoteOpResult } from '@memberjunction/core';
import { announceWrites, type FormsWriteKind } from './forms-writes';

/** What a Forms operation produced, or why it did not. */
export type OperationOutcome<TOutput> =
  | { ok: true; output: TOutput }
  | { ok: false; error: string; resultCode: string | null };

/**
 * Run `operation` with `input` and fold the result into an {@link OperationOutcome}.
 *
 * @param doing - What the call is for, with the record it acts on, for the log line
 *   (`"publishing form 7C1…"`). Never shown to the author.
 * @param writes - The entities whose rows the operation writes, announced on success. Empty for a
 *   read.
 * @param writeKind - How they are announced: `save` (the default) or `delete`, for an operation
 *   that removes the row (`Forms.DeleteTemplate`), so delete listeners hear it.
 */
export async function runOperation<TInput, TOutput>(
  operation: BaseRemotableOperation<TInput, TOutput>,
  input: TInput,
  doing: string,
  writes: readonly string[] = [],
  writeKind: FormsWriteKind = 'save',
): Promise<OperationOutcome<TOutput>> {
  let result: RemoteOpResult<TOutput>;
  try {
    result = await operation.Execute(input);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    LogError(`Forms: ${doing} (${operation.OperationKey}) did not reach the server: ${detail}`);
    return { ok: false, error: `The server could not be reached (${detail}).`, resultCode: null };
  }
  if (result.Success && result.Output !== undefined && result.Output !== null) {
    announceWrites(writes, writeKind);
    return { ok: true, output: result.Output };
  }
  const resultCode = result.ResultCode ?? null;
  const error =
    result.ErrorMessage?.trim() ||
    (result.Success ? 'The server reported success but returned no result.' : 'The server refused this with no reason given.');
  LogError(`Forms: ${doing} (${operation.OperationKey}) failed [${resultCode ?? 'no code'}]: ${error}`);
  return { ok: false, error, resultCode };
}
