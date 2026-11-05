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
 *   - `Date`: a calendar date, `2026-09-01` — or, from a non-widget client, an ISO-8601 date-time
 *     that carries its offset (`2026-09-01T15:00:00Z`, `…+02:00`). A date-time WITHOUT one is
 *     refused ({@link isZonelessDateTime}): read as the server's local time, the instant it stored
 *     would depend on which time zone the host happened to run in.
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
 * parse whatever arrives. Only `Time` reads a clock; everything else reads an ISO-8601 date (or
 * date-time) that names a REAL day — an impossible one is `undefined`, never rolled over to the
 * next month (`parseIsoDate` checks the day against the month's own length).
 */
export function dateAnswerInstant(type: FormQuestionType, text: string): Date | undefined {
  if (type === 'Time') {
    const clock = parseClockTime(text);
    return clock ? new Date(Date.UTC(1970, 0, 1, clock.hours, clock.minutes, clock.seconds)) : undefined;
  }
  const parts = parseIsoDate(text.trim());
  if (!parts) {
    return undefined;
  }
  const instant = instantOf(parts);
  const time = instant.getTime();
  // Inside the column's range once the offset is applied (fix round 3, re-review N4):
  // `9999-12-31T23:00:00-05:00` is a real day, but it is 10000-01-01 in UTC.
  return time < FIRST_STORABLE_INSTANT || time > LAST_STORABLE_INSTANT ? undefined : instant;
}

/**
 * Whether `text` is a date-time that would be storable but for naming no offset — the one refusal
 * that needs its own sentence, because "Enter a valid date." does not tell a client that sent
 * `2026-10-13T14:30` what is wrong with it. Never an instant: see the module comment. An impossible
 * day or clock (`2026-02-30T14:30`) is not this fault, and keeps the plain refusal.
 */
export function isZonelessDateTime(text: string): boolean {
  const trimmed = text.trim();
  const match = ISO_DATE.exec(trimmed);
  return (
    match !== null &&
    match[ISO_GROUP.hours] !== undefined &&
    match[ISO_GROUP.offset] === undefined &&
    dateAnswerInstant('Date', `${trimmed}Z`) !== undefined
  );
}

/**
 * An ISO-8601 calendar date, optionally with a clock time and offset — the spellings a date answer
 * may take. The widget's `<input type="date">` sends the bare date; a non-widget client may send a
 * date-time (`dateAnswerText` keeps its time). Accepted as clients actually write it (fix round 3,
 * re-review N5): up to 7 fractional digits (DATETIMEOFFSET's precision — Python's `isoformat()` writes
 * 6, .NET's `"o"` 7), `±hh:mm` or basic `±hhmm` offsets, `Z`, a lowercase `t`, and a space separator.
 * The grammar admits a time with no offset only so {@link isZonelessDateTime} can name that refusal.
 */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[Tt ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,7}))?)?(Z|([+-])(\d{2}):?(\d{2}))?)?$/;

/** Capture-group positions in {@link ISO_DATE}, named so no reader counts parentheses. */
const ISO_GROUP = {
  year: 1,
  month: 2,
  day: 3,
  hours: 4,
  minutes: 5,
  seconds: 6,
  fraction: 7,
  offset: 8,
  offsetSign: 9,
  offsetHours: 10,
  offsetMinutes: 11,
} as const;

/** The widest UTC offset `DATETIMEOFFSET` (and ISO-8601) admits: ±14:00, in minutes. */
const MAX_OFFSET_MINUTES = 14 * 60;

/** A date answer's components, each already checked against the calendar and the clock. */
interface IsoDateParts {
  readonly year: number;
  /** 1-12. */
  readonly month: number;
  readonly day: number;
  readonly hours: number;
  readonly minutes: number;
  readonly seconds: number;
  /** Whole milliseconds; digits past the third are dropped, as V8 did. */
  readonly milliseconds: number;
  /** East of UTC is positive; 0 for a bare date and for `Z`. */
  readonly offsetMinutes: number;
}

/**
 * The components of a date answer that names a day that EXISTS (and, when it carries one, a real
 * clock time and an offset within ±14:00) — or `undefined`.
 *
 * Not `new Date(text)` (#303 Task 8 fix rounds 2 and 4). V8 ROLLS an impossible ISO date over —
 * `2026-02-30` is March 2 — and its legacy fallback, which is what reads the space-separated form,
 * takes a 2-digit year as 19xx/20xx, so `0050-06-15 10:20Z` was stored as 1950. Each answer was then
 * stored as a different day than the respondent gave. The components are checked here and the
 * instant is built from them ({@link instantOf}), so no text reaches a date parser at all.
 *
 * A date-time with no offset is `undefined` too (controller ruling, fix round 4): it names no
 * instant until a zone is assumed, and the only zone available is the host's.
 */
function parseIsoDate(text: string): IsoDateParts | undefined {
  const match = ISO_DATE.exec(text);
  if (!match) {
    return undefined;
  }
  const number = (group: number): number => Number(match[group] ?? 0);
  const year = number(ISO_GROUP.year);
  const month = number(ISO_GROUP.month);
  const day = number(ISO_GROUP.day);
  if (year < 1) {
    return undefined; // DATETIMEOFFSET starts at 0001-01-01 (fix round 3, re-review N4)
  }
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return undefined;
  }
  const hasTime = match[ISO_GROUP.hours] !== undefined;
  if (hasTime && match[ISO_GROUP.offset] === undefined) {
    return undefined; // zone-less: see isZonelessDateTime
  }
  const hours = number(ISO_GROUP.hours);
  const minutes = number(ISO_GROUP.minutes);
  const seconds = number(ISO_GROUP.seconds);
  if (hours > 23 || minutes > 59 || seconds > 59) {
    return undefined;
  }
  const offsetMinutes = offsetMinutesOf(match);
  if (offsetMinutes === undefined) {
    return undefined;
  }
  const milliseconds = Number((match[ISO_GROUP.fraction] ?? '').padEnd(3, '0').slice(0, 3));
  return { year, month, day, hours, minutes, seconds, milliseconds, offsetMinutes };
}

/** The matched offset in minutes east of UTC, or `undefined` past ±14:00 or with minutes over 59. */
function offsetMinutesOf(match: RegExpExecArray): number | undefined {
  if (match[ISO_GROUP.offsetSign] === undefined) {
    return 0; // a bare date, or `Z`
  }
  const hours = Number(match[ISO_GROUP.offsetHours]);
  const minutes = Number(match[ISO_GROUP.offsetMinutes]);
  const magnitude = hours * 60 + minutes;
  if (minutes > 59 || magnitude > MAX_OFFSET_MINUTES) {
    return undefined;
  }
  return match[ISO_GROUP.offsetSign] === '-' ? -magnitude : magnitude;
}

/**
 * The UTC instant the components name. `setUTCFullYear`/`setUTCHours` rather than `Date.UTC`,
 * which reads years 0-99 as 1900-1999; the offset is subtracted because `+02:00` is two hours
 * AHEAD of UTC, so its 10:00 is 08:00Z.
 */
function instantOf(parts: IsoDateParts): Date {
  const instant = new Date(0);
  instant.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  instant.setUTCHours(parts.hours, parts.minutes, parts.seconds, parts.milliseconds);
  return new Date(instant.getTime() - parts.offsetMinutes * 60_000);
}

/** Days in `month` (1-12) of `year`, by the Gregorian leap-year rule. */
function daysInMonth(year: number, month: number): number {
  // Day 0 of the NEXT month is the last day of this one; UTC so no local DST shift can move it.
  // `setUTCFullYear`, not `Date.UTC(year, …)`: the latter reads years 0-99 as 1900-1999, which put
  // the leap day of year 4 or 100 in the wrong year.
  const last = new Date(0);
  last.setUTCFullYear(year, month, 0);
  return last.getUTCDate();
}

/** The first and last instants `DATETIMEOFFSET` can store, in UTC. */
const FIRST_STORABLE_INSTANT = Date.parse('0001-01-01T00:00:00.000Z');
const LAST_STORABLE_INSTANT = Date.parse('9999-12-31T23:59:59.999Z');

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
 * A stored date-column answer read back as the text the respondent gave — what
 * {@link dateAnswerInstant} stored, read back exactly for the canonical spellings and normalised for
 * the rest (below), so not a strict inverse — and the one reader every consumer of a stored
 * `DateValue` should use.
 *
 * `Time` gives back its clock, everything else its calendar day, mirroring the write side.
 *
 * The round trip is exact for the CANONICAL spellings — every value
 * `<input type="time">` and `<input type="date">` emit — and normalising for the rest:
 * surrounding whitespace is dropped, and `14:30:00` comes back as `14:30`, because a zero seconds
 * group is noise rather than answer. It is deliberately NOT lossy beyond that: a `Date` wire value
 * may be an ISO date-time with an offset (see the module comment), so a non-widget
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
