/**
 * Moving a stored instant in and out of an `<input type="datetime-local">`.
 *
 * The control has one hard rule that is easy to get wrong: its value is a WALL-CLOCK
 * string with no timezone — `2026-08-19T17:30` — and the browser reads and writes it in
 * the viewer's local zone. `Date.toISOString()` produces UTC, so feeding it to the input
 * shows the author a time that is not the one they set (silently correct only in London
 * in winter), and it round-trips that wrong time straight back into the database on the
 * next save. Hence a pair of functions rather than a slice of an ISO string.
 *
 * The zone that results is the AUTHOR's, which is the right answer for this field: someone
 * scheduling a form to close "Friday at 5" means five o'clock where they are. The value
 * stored is a `DATETIMEOFFSET`, so the instant is unambiguous once it lands.
 */

/** Zero-pad to two digits — the width every component of the input's format uses. */
function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * The `YYYY-MM-DDTHH:mm` an `<input type="datetime-local">` wants, in local time.
 *
 * Empty string for an absent or unparseable value, which is exactly what the input shows
 * for "not set" — so a null schedule and a cleared field are the same thing to the DOM,
 * and no special case is needed at the call site.
 */
export function toLocalInputValue(value: Date | string | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/**
 * The instant an `<input type="datetime-local">` value names, or null when it is empty.
 *
 * A bare `new Date(text)` is correct here and only here: ES parses a date-TIME form with
 * no offset as local time, which is what the control means. (The date-ONLY form is parsed
 * as UTC by the same spec — the inconsistency that makes this worth a function and a
 * comment rather than an inline call.)
 */
export function fromLocalInputValue(value: string): Date | null {
  const text = value.trim();
  if (text.length === 0) {
    return null;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}
