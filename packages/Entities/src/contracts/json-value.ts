/**
 * A precise, recursive type for genuinely-open JSON blobs (e.g. per-question-type
 * `settings`). Use this anywhere we would otherwise be tempted to reach for `any`
 * or `unknown` to describe arbitrary-but-structured JSON read from the database.
 *
 * This is the canonical JSON value type for the Forms contract. It is intentionally
 * exhaustive of the JSON data model: primitives, arrays, and string-keyed objects.
 */
export type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue };

/** A JSON object (string-keyed map of {@link JSONValue}). */
export type JSONObject = { [key: string]: JSONValue };
