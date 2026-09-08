/**
 * The boundary that keeps an exception from becoming the respondent's error text.
 *
 * `runSubmitPipeline` already honours this contract for everything inside the pipeline (#119), but
 * the resolver does real work OUTSIDE it: `GetReadWriteProvider`, `requireUser`, `toAnswerInputs`,
 * `UserCache.Instance.GetSystemUser()` and `currentRequestIdentity()` all run before the pipeline is
 * entered, and `toResultType` after it returns. `PublishedForm` runs entirely outside any boundary.
 * An exception from any of those reaches Apollo, which puts the exception's own `message` into
 * `errors[].message`, and the widget renders that (`mj-form.component.ts:599`, `:658`).
 * `StacktraceRedactionMiddleware` removes the frames from that response; it cannot remove the
 * sentence, because a sentence is all a thrown `Error` is.
 *
 * NOT A DEMONSTRATED LEAK, AND SAID SO ON PURPOSE. Neither gap is reachable through the schema as
 * it stands: `answers` is `[FormAnswerInputType!]!`, so graphql-js rejects a null list or element
 * before the resolver body runs, and `resolvePublishedDefinition` returns a typed failure rather
 * than throwing (`RunView` reports `Success: false`; the snapshot parser catches). This closes the
 * CLASS. The reasoning is the one `file-links.service.ts` already applies to its own read guard:
 * a contract that holds only for the current implementation is not a contract — and the thing on
 * the other side of this one is an anonymous stranger holding a link.
 *
 * ONE HELPER, NOT TWO INLINE `try`/`catch` BLOCKS. Both resolver methods need the same decision —
 * what gets logged, and what the respondent gets instead — and a decision duplicated across two
 * call sites is a decision that will diverge. Here it is made once and tested once.
 */
import { LogError } from '@memberjunction/core';

/**
 * Run a public-surface resolver body, returning `fallback` if it throws.
 *
 * `fallback` is a VALUE rather than a factory: both call sites build a small object, constructing
 * one per request costs nothing measurable, and the call site reads as "this, or this" instead of
 * carrying a thunk that exists only to defer two allocations.
 *
 * @param operation What threw, for the log — the resolver name and the argument that identifies the
 *   request (a slug), never the respondent's answers.
 * @param fallback What the respondent gets instead. Must be authored text, or `null`.
 * @param run The resolver body.
 */
export async function respondentSafe<T>(operation: string, fallback: T, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err: unknown) {
    // The stack, not just the message: the wire no longer carries one, so this line is the only
    // place the frames survive. A non-Error is stringified rather than assumed away — any library
    // may throw a bare string, and a boundary that throws while handling a throw is not a boundary.
    const detail = err instanceof Error ? (err.stack ?? err.message) : String(err);
    LogError(`[Forms] ${operation} threw: ${detail}`);
    return fallback;
  }
}
