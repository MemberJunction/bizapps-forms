/**
 * Input validation every Forms operation shares, so each refuses a bad payload the same way: a
 * throw whose message starts with the operation key (MJ returns it as `EXECUTION_ERROR` with that
 * `ErrorMessage`, and an operator reading a log can tell which operation refused).
 *
 * The wire payload is JSON from a client, typed by the generated input interface but not checked
 * by it — so a required field can still arrive missing, null or blank.
 */

/** A required text field, trimmed, or a throw naming the field and the operation. */
export function requireTextInput(value: unknown, field: string, operationKey: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    throw new Error(`${operationKey}: ${field} is required.`);
  }
  return text;
}

/**
 * A required JSON boolean, or a throw. Nothing else is coerced: a caller that sent `"true"` or `1`
 * believed it asked for something, and guessing which is how a working copy becomes a template.
 */
export function requireBooleanInput(value: unknown, field: string, operationKey: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${operationKey}: ${field} must be true or false.`);
  }
  return value;
}

/** An optional text field, trimmed; absent, `null` or blank is `undefined`. Anything but text is refused. */
export function optionalTextInput(value: unknown, field: string, operationKey: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error(`${operationKey}: ${field} must be text when given.`);
  }
  return value.trim() || undefined;
}

/**
 * An optional field where absent and `null` mean different things — keep the existing value, and
 * clear it — and text replaces it. Returned untrimmed: it is prose, and its author's whitespace is
 * theirs to keep.
 */
export function optionalNullableTextInput(value: unknown, field: string, operationKey: string): string | null | undefined {
  if (value === undefined || value === null || typeof value === 'string') {
    return value;
  }
  throw new Error(`${operationKey}: ${field} must be text or null when given.`);
}

/** An optional JSON boolean; absent or `null` is `undefined`. Anything else is refused, as in {@link requireBooleanInput}. */
export function optionalBooleanInput(value: unknown, field: string, operationKey: string): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'boolean') {
    throw new Error(`${operationKey}: ${field} must be true or false when given.`);
  }
  return value;
}

/** An optional value from a closed set (a CHECK-constrained column); absent or `null` is `undefined`. */
export function optionalChoiceInput<T extends string>(
  value: unknown,
  choices: readonly T[],
  field: string,
  operationKey: string,
): T | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const choice = choices.find((candidate) => candidate === value);
  if (choice === undefined) {
    throw new Error(`${operationKey}: ${field} must be one of ${choices.join(', ')} when given.`);
  }
  return choice;
}

/** A whole number of at least 1, or `null` for "no bound" — which is also what absent means. */
export function nullablePositiveIntegerInput(value: unknown, field: string, operationKey: string): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error(`${operationKey}: ${field} must be a whole number of at least 1, or null.`);
  }
  return value;
}

/**
 * An ISO-8601 instant as a `Date`, or `null` — which is also what absent means. Only a string is
 * accepted: the wire is JSON, where a number could be seconds or milliseconds and a guess between
 * them moves a link's opening by a factor of a thousand.
 */
export function nullableInstantInput(value: unknown, field: string, operationKey: string): Date | null {
  if (value === undefined || value === null) {
    return null;
  }
  const instant = typeof value === 'string' && value.trim() ? new Date(value) : undefined;
  if (!instant || Number.isNaN(instant.getTime())) {
    throw new Error(`${operationKey}: ${field} must be an ISO-8601 date and time, or null.`);
  }
  return instant;
}
