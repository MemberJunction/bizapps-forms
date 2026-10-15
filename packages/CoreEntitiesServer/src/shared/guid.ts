/**
 * The one GUID-shape check in this package. Every id that is about to go into a SQL filter, become a
 * primary key, or be compared as an identity passes through it, so they all accept and refuse the
 * same strings (case-insensitive, hyphenated, no braces, no surrounding whitespace — trim first when
 * the input may carry it).
 */
const GUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether `value` is a string shaped like a uniqueidentifier. */
export function isGuid(value: unknown): value is string {
  return typeof value === 'string' && GUID_SHAPE.test(value);
}
