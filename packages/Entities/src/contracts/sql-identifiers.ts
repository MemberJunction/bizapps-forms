/**
 * Guarding the ids that get interpolated into a `RunView` filter string.
 *
 * ── WHY THIS EXISTS AS A SHARED THING. ───────────────────────────────────────────────────────
 * `RunView.ExtraFilter` takes SQL text, so every id that reaches one is a potential injection
 * sink, and this codebase reaches them from both the server and the browser. The guard was written
 * twice — once in the asset route, once in the Builder — and then MISSED a third time in the chat,
 * where a client-supplied `FormID` flowed into a filter unchecked. That is the argument for one
 * exported function rather than a habit.
 *
 * ── THE GUARD IS THE PATTERN, NOT AN ESCAPE. ─────────────────────────────────────────────────
 * A value matching this pattern cannot contain a quote, so it cannot terminate the literal it sits
 * in. That is a stronger property than escaping and needs no second rule to keep right — escaping
 * has to be applied at every site and is silently absent when it is not, whereas a non-GUID is
 * rejected outright.
 *
 * ── WHAT THE MISSED CASE ACTUALLY COST. ──────────────────────────────────────────────────────
 * Worth recording, because it is the kind of thing that reads as theoretical until it is written
 * down. `FormID` of `x' OR '1'='1` produced
 *
 *     UserID='<caller>' AND ExternalID='mj-forms:form:x' OR '1'='1' AND IsArchived = 0
 *
 * and SQL binds AND tighter than OR, so that is `(mine) OR (every unarchived conversation)`. The
 * caller's own user id — the thing that looked like the access control — was bypassed entirely,
 * and the chat would then have read another user's thread and handed it to the assistant.
 */

/** The canonical 8-4-4-4-12 form. Anchored, so a value cannot carry anything either side of it. */
export const GUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Whether `value` is a GUID and therefore safe to interpolate into a filter. */
export function isGuid(value: string | null | undefined): value is string {
  return typeof value === 'string' && GUID_PATTERN.test(value);
}

/**
 * `value` if it is a GUID, otherwise `undefined`.
 *
 * For the callers where a bad id means "no such thing" rather than "something is wrong" — an
 * optional `FormID` on a chat message, say. They carry on without it, which is the same behaviour
 * an id naming a form that does not exist would produce.
 */
export function guidOrUndefined(value: string | null | undefined): string | undefined {
  return isGuid(value) ? value : undefined;
}

/**
 * Throw unless `value` is a GUID.
 *
 * For the callers where a bad id means a programming error upstream — an id the code itself just
 * minted and is about to query back. Naming `what` matters: "Refusing to query with a page id" is
 * findable, "invalid input" is not.
 */
export function assertGuid(value: string | null | undefined, what: string): asserts value is string {
  if (!isGuid(value)) {
    throw new Error(`Refusing to build a query with a ${what} that is not a GUID: ${JSON.stringify(value)}`);
  }
}
