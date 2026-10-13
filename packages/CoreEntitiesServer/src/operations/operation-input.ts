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
