/**
 * The `date` answer column — what travels on the wire, what is stored, and how it is read back.
 *
 * `FormResponseAnswer.DateValue` is a `DATETIMEOFFSET`, and it is the column both `Date` and
 * `Time` route to (`QUESTION_TYPE_BEHAVIOR.answerColumn`). The transport field that feeds it,
 * `FormAnswerInput.dateValue`, is a plain GraphQL `String` — wider than the column, and the only
 * typed column for which that is true. So the string has to be turned into an instant somewhere,
 * and that somewhere has to agree with every other reader of the value. It did not (#116): the
 * conditional evaluator knew a Time answer as the `14:30` its control emits, the validator had no
 * opinion on `Time` at all, and persistence did `new Date('14:30')` — an Invalid Date that threw
 * `RangeError: Invalid time value` from inside `Save()`, unattributed, making every form carrying
 * a Time question unsubmittable. This module is the one place the decision lives; the widget, the
 * server's validator, its persistence layer, the evaluator and the dashboard all read through it.
 *
 * WIRE FORMAT — `dateValue` carries what the respondent's control produced, untouched:
 *   - `Date`: a calendar date, `2026-09-01` (or any string `Date.parse` reads as an instant).
 *   - `Time`: a bare 24-hour clock reading, `14:30`, or `14:30:15` from the browsers that add
 *     seconds. Nothing else — an ISO instant on a Time question is refused, because the evaluator
 *     compares it on the date scale and a rule written against `14:30` would never match it.
 *
 * STORED FORMAT — one rule for the whole column: **the UTC fields of the stored instant are what
 * the respondent entered.**
 *   - `Date`: `new Date('2026-09-01')` is UTC midnight of that day; unchanged from before.
 *   - `Time`: the clock reading on the Unix epoch date, in UTC — `14:30` → `1970-01-01T14:30:00Z`.
 *     The epoch rather than the submission date, so two respondents who both answered `09:00`
 *     store the same value and compare equal in reporting. UTC rather than a zone, because the
 *     server's zone is deployment trivia and the respondent's is unknown to the server.
 *
 * READING IT BACK — through `getUTC*` or the `Z` clock, never the viewer's local time: a stored
 * `14:30Z` read with `getHours()` in Chicago is 08:30, and the dashboard would band an afternoon
 * as a morning. {@link clockTimeOf} is the read for `Time`.
 *
 * Kept free of imports from `conditional-rule.ts` and `answer-format.ts` on purpose: both of
 * those import THIS module, and the evaluator's clock parse has to be the validator's.
 */
import type { FormQuestionType } from './question-types';

/** A 24-hour clock reading, as parsed from the wire. */
export interface ClockTime {
  readonly hours: number;
  readonly minutes: number;
  readonly seconds: number;
}

/**
 * A whole clock reading, as `<input type="time">` emits it. Anchored and range-checked rather than
 * loose, so `25:00` and `14:60` are refused instead of ordering as if someone could have answered
 * them. Two-digit hours only, for the same reason: `9:00` is not something the control produces.
 */
const CLOCK_TIME = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

/** Read a `Time` answer's wire string, or `undefined` when it is not a clock reading. */
export function parseClockTime(text: string): ClockTime | undefined {
  const match = CLOCK_TIME.exec(text.trim());
  if (!match) {
    return undefined;
  }
  return { hours: Number(match[1]), minutes: Number(match[2]), seconds: Number(match[3] ?? 0) };
}

/**
 * The instant a `dateValue` is stored as, given the type of the question it answers — or
 * `undefined` when the string cannot become one. Never an Invalid Date: `toISOString()` on one
 * throws, and that throw is exactly the unattributed failure this module exists to prevent.
 *
 * Takes the whole type rather than `'Date' | 'Time'` because the column does not care which
 * question routed to it: a caller can post `dateValue` on any question, and persistence has to
 * parse whatever arrives. Only `Time` reads a clock; everything else reads an instant, as it
 * always did.
 */
export function dateAnswerInstant(type: FormQuestionType, text: string): Date | undefined {
  if (type === 'Time') {
    const clock = parseClockTime(text);
    return clock ? new Date(Date.UTC(1970, 0, 1, clock.hours, clock.minutes, clock.seconds)) : undefined;
  }
  const parsed = new Date(text.trim());
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/** Zero-pad to the two digits every field of both formats uses. */
const two = (n: number): string => String(n).padStart(2, '0');

/**
 * The clock reading a stored `Time` instant represents: `14:30`, or `14:30:15` when the answer
 * carried seconds. Reads the UTC fields — see the module comment for why local is wrong.
 */
export function clockTimeOf(instant: Date): string {
  const base = `${two(instant.getUTCHours())}:${two(instant.getUTCMinutes())}`;
  const seconds = instant.getUTCSeconds();
  return seconds === 0 ? base : `${base}:${two(seconds)}`;
}

/**
 * The calendar day a stored `Date` instant represents: `2026-09-01`.
 *
 * Reads the UTC fields for the same reason {@link clockTimeOf} does, and here the consequence is
 * sharper: the stored instant IS UTC midnight, so a locale formatter renders the PREVIOUS DAY for
 * every viewer west of Greenwich. `toLocaleDateString()` on `2026-09-01T00:00:00Z` in Chicago is
 * "8/31/2026". That is the same skew `bandOf` was fixed for, and it is why this returns the plain
 * ISO calendar date rather than a prettier localised one — a date answer carries no zone, so there
 * is no zone in which to localise it. It also sorts as text and parses in a spreadsheet.
 */
export function calendarDateOf(instant: Date): string {
  return `${instant.getUTCFullYear()}-${two(instant.getUTCMonth() + 1)}-${two(instant.getUTCDate())}`;
}

/**
 * A stored date-column answer read back as the text the respondent gave — the inverse of
 * {@link dateAnswerInstant}, and the one reader every consumer of a stored `DateValue` should use.
 *
 * `Time` gives back its clock, everything else its calendar day, mirroring the write side.
 *
 * The round trip is exact for the CANONICAL spellings — every value
 * `<input type="time">` and `<input type="date">` emit — and normalising for the rest:
 * surrounding whitespace is dropped, and `14:30:00` comes back as `14:30`, because a zero seconds
 * group is noise rather than answer. It is deliberately NOT lossy beyond that: a `Date` wire value
 * may be "any string `Date.parse` reads as an instant" (see the module comment), so a non-widget
 * client can store `2026-09-01T15:00:00Z` on a Date question, and returning the calendar day alone
 * would discard information that is in the column — on the detail page and in the CSV export
 * alike. Such an answer reads back as `2026-09-01 15:00`.
 *
 * That round trip is what three separate consumers need:
 *
 *   - **Display.** `renderAnswer` shows a respondent what they entered. Before this existed, the
 *     `Time` half had been given `clockTimeOf` and the `Date` half still printed the raw instant,
 *     so one column rendered two ways.
 *   - **Handing the value onward.** An on-submit Action or AI Agent that formats an answer needs
 *     the respondent's reading, not a 1970 timestamp.
 *   - **Putting it back in the control.** `<input type="time">` and `<input type="date">` accept
 *     exactly these two formats and silently blank anything else — so when cross-session resume
 *     lands, this is the read that hydrates a saved answer. Nothing does that yet; the round-trip
 *     spec exists so that whoever writes it cannot get it wrong.
 *
 * Takes the whole type, like `dateAnswerInstant`, because the column does not care which question
 * routed to it: only `Time` is a clock.
 */
export function dateAnswerText(type: FormQuestionType, instant: Date): string {
  if (type === 'Time') {
    return clockTimeOf(instant);
  }
  const day = calendarDateOf(instant);
  const clock = clockTimeOf(instant);
  // `00:00` is the only reading a `<input type="date">` answer ever has, so the common case is a
  // bare calendar day. Anything else was stored with a time by a non-widget client and keeping it
  // is the difference between reading the column and truncating it.
  return clock === '00:00' ? day : `${day} ${clock}`;
}
