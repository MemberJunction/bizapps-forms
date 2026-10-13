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
