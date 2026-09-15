/**
 * Coercing RunView date cells.
 *
 * A `ResultType: 'simple'` RunView returns datetime columns as strings over GraphQL but as
 * `Date` objects from a local provider, so every read path has to normalise before doing
 * date arithmetic or calling `toLocaleString()`. Three areas each grew their own copy of
 * this; this is the one.
 */

/** Coerces a possibly-string datetime into a Date, or null when absent/unparseable. */
export function toDate(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
