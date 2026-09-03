# Issue #116 — The `Time` answer wire format, and the guard that was missing on the `date` column

**Issue:** [MemberJunction/bizapps-forms#116](https://github.com/MemberJunction/bizapps-forms/issues/116)
**Status:** IMPLEMENTED on `fix/116-time-answer-wire-format`.
**Planned:** 2026-09-01 · **Origin:** `docs/distribution-link-diagnosis.md` finding #12 (the all-types smoke form).

**One sentence:** a `Time` answer travels as the bare clock reading the control emits (`14:30`),
is stored as that clock on the Unix epoch date in UTC (`1970-01-01T14:30:00Z`), and every value
bound for the `date` column is parsed through one shared contract function before anything tries
to store it — so a value that cannot be stored is refused with a field error, in every mode, and
never as `RangeError: Invalid time value`.

---

## 1. Verification — the defect, layer by layer

Reproduced on `next` @ `f8f6d20` against the running host (`:4000`, form `all-types-smoke`) by
calling `SubmitFormResponse` directly, one answer per case (`scratchpad/issue-116/probe-time.mjs`):

| case | `next` |
|---|---|
| `Date` + `"2026-09-01"` (complete) | `success=true` |
| **`Time` + `"14:30"`** (complete) | **`success=false`, `errors=[{questionId: null, message: "Invalid time value"}]`** |
| `Time` + `"14:30:15"` | same |
| `Time` + `"25:99"` | same |
| `Time` + `"2026-09-01T14:30:00Z"` | `success=true` (an ISO instant happens to parse) |
| `Date` + `"not-a-date"` (complete) | `success=false`, `{questionId: <Date q>, message: "Enter a valid date."}` — the existing guard |
| **`Date` + `"garbage"` (draft)** | **`"Invalid time value"`, unattributed** — the guard does not run for drafts |
| **`Time` + `"garbage"` (draft)** | same |

The chain, with the file that owns each link:

1. `<input type="time">` emits `14:30`; `answer-value.ts` routes `Time` through `answerColumn: 'date'`
   and sends `dateValue: "14:30"` verbatim. Correct — that is what the control produced.
2. `answer-format.ts` `validateAnswerFormat` has a `Date` case (`isDate`) and **no `Time` case**, so the
   value is not judged. And `validation.service.ts` holds a **draft** to upper bounds only, so on the
   autosave path not even `Date` is judged.
3. `persistence.service.ts` `applyAnswerValue` does `answer.DateValue = new Date(input.dateValue)` with
   no validity check. `new Date("14:30")` is an Invalid Date.
4. `SQLServerDataProvider` serialises a Date field with `val.toISOString()`, which throws
   `RangeError: Invalid time value` on an Invalid Date. `Save()` catches it, returns `false` with the
   bare message as `CompleteMessage`, and the pipeline reports `{questionId: null, message}`.

The evaluator already knew the format: `conditional-rule.ts` carries `CLOCK_TIME`, documented "as
`<input type="time">` emits it", and compares Time answers on their own minutes-since-midnight
scale. The wire format was decided there; persistence and the validator never learned it.

**Blast radius** (issue comment): no published form in the dev database other than the smoke fixture
carries a `Time` question, so the type has never worked rather than regressed. Nothing to bisect.

## 2. The decision — design it twice

The issue's HITL question: what does a `Time` answer look like once stored?

### Option A — the server parses a bare `HH:mm` (chosen)

Wire: the control's own output, `HH:mm` or `HH:mm:ss`. Stored: that clock on `1970-01-01`, UTC.
The widget does not change. One shared contract function (`dateAnswerInstant`) turns the wire
string into the instant; the validator, the persistence layer and the evaluator all read the clock
through it.

### Option B — the widget composes a full ISO datetime (rejected)

Wire: the widget converts `14:30` into `1970-01-01T14:30:00.000Z` (or a local-zone equivalent) in
`toAnswerInput`. Stored: whatever `new Date()` makes of that.

### Why A

- **The evaluator runs on the wire value, on both sides.** The server evaluates conditional rules
  against `answerValueOf(input)`, which for the date column is `input.dateValue`; the widget evaluates
  against its in-memory map, which holds the control's `14:30`. Under B the server would see
  `kind: 'date'` where the widget sees `kind: 'time'`, so `greaterThan` / `lessThan` / `equals` on a
  Time question would fire in the browser and never on the server — a visibility divergence, which is
  exactly the fork every shared module in `forms-entities` exists to close.
- **One owner for "what lands in the column".** Storage format is a server decision. Under B every
  client of the public mutation (the widget today; anything posting straight at GraphQL) has to know
  the epoch-date convention, and the server still needs the guard anyway.
- **Fewer moving parts.** A: one new contract module, a guard, two reader fixes. B: all of that plus
  a widget conversion plus an `answerValueOf` un-conversion to keep the evaluator honest.

### The stored shape, and why this one

`14:30` → `Date.UTC(1970, 0, 1, 14, 30, 0)` → `1970-01-01T14:30:00.000Z`.

- **Epoch date, not the submission date.** A Time answer carries no date. Attaching the day it was
  submitted makes two respondents who both answered `09:00` store different values, and every
  `equals` in reporting stops working. The epoch is the one anchor that is the same for everyone.
- **UTC, not a zone.** The server's zone is deployment trivia and the respondent's is unknown to the
  server. UTC is the one zone both sides can name without configuration.
- **It is the rule `Date` already follows.** `new Date('2026-09-01')` is UTC midnight, so for a Date
  answer the UTC calendar fields of the stored instant are what the respondent typed. Time now holds
  the same rule by construction. **One rule for the whole column: the UTC fields of the stored
  instant are what the respondent entered.** Readers use `getUTC*` / the `Z` clock, never local.
- **Strict on the wire.** An ISO instant posted on a `Time` question (`2026-09-01T14:30:00Z`) is
  refused with `Enter a valid time.` rather than tolerated, because the evaluator would compare it on
  the date scale and a rule written against `14:30` would never match it. One spelling, one scale.
  (This is the only case in the table above whose verdict flips from success to a field error, and
  nothing in the repo produces it.)

### The guard — where it lives, and why it is in two places

- **Validation, every mode.** `validateAnswerFormat` gains the `Time` case and both temporal cases
  are expressed as "does `dateAnswerInstant` produce an instant". The server's **draft** rulebook
  grows from "upper bounds" to "upper bounds, plus a value the column cannot physically hold": a
  `<input type="date|time">` emits nothing until the value is whole, so an unparseable date is not a
  half-typed value passing through — it is malformed now, and the column would throw on it as a
  draft exactly as it does on a submission. The `date` column is the one whose GraphQL transport
  type (`String`) is wider than what the column can hold (`DATETIMEOFFSET`), which is why the draft
  check is scoped to it and to nothing else.
- **Persistence, as a postcondition.** `applyAnswerValue` parses through the same function and
  returns a refusal naming the question instead of writing an Invalid Date. Deliberately duplicated:
  validation only judges the column a question's type routes to, so a caller posting `dateValue` on
  a `ShortText` question reaches persistence with a value nobody has looked at. That path still gets
  a descriptive message (`Answer to "<prompt>" is not a valid date.`) rather than a `RangeError`.

## 3. Changes

| File | Change |
|---|---|
| `packages/Entities/src/contracts/answer-date.ts` (new) | The contract: `parseClockTime`, `dateAnswerInstant`, `clockTimeOf`. The module comment is where the wire and stored formats are written down. |
| `packages/Entities/src/contracts/index.ts` | export it |
| `packages/Entities/src/contracts/conditional-rule.ts` | `toComparable` reads the clock through `parseClockTime` instead of its own regex — the evaluator and the validator can no longer disagree on what a Time answer looks like |
| `packages/Entities/src/contracts/answer-format.ts` | `Date` / `Time` cases via `dateAnswerInstant`; `isDate` removed |
| `packages/Server/src/public-submit/validation.service.ts` | draft rulebook: `validateDraft` = storability + upper bounds |
| `packages/Server/src/public-submit/persistence.service.ts` | `applyAnswerValue` parses the date column through the contract and refuses, naming the question |
| `packages/Angular/src/lib/dashboard/services/temporal-buckets.ts` | `bandOf` reads `getUTCHours()` — the contract's clock, not the viewer's |
| `packages/Angular/src/lib/shared/answer-values.ts` | `renderAnswer` shows a `Time` as `14:30`, via `clockTimeOf` |
| specs | new `answer-date.spec.ts`; `answer-format.spec.ts`, `conditional-rule.spec.ts`, `validation.service.spec.ts`, new `date-answer-persistence.spec.ts`, `temporal-buckets.spec.ts`, `response-aggregations.spec.ts` |

Not changed, on purpose: `answer-value.ts` (the widget already sends the right thing);
`answer-canonical.ts` (`collapseAnswer` returns the ISO instant, whose `Z` clock is the answer —
entity binding writes it into datetime columns, where an instant is the right shape); the `Date`
month bucketing in `temporal-buckets.ts` (`monthOf` reads local fields, which is the same class of
skew for `Date` answers on the first of a month — a separate, pre-existing defect, reported rather
than fixed here).

## 4. Acceptance criteria → evidence

| AC | Where |
|---|---|
| Wire format decided and written down where both sides can see it | `answer-date.ts` module comment; both packages import it |
| A form with a `Time` question submits with a time answered | probe against this branch's harness; browser run of the fixture |
| Stored value round-trips | `dateAnswerInstant` ↔ `clockTimeOf` spec; DB read-back of the probe's row |
| Unparseable value → message naming the question, never a runtime error | validation spec (every mode) + persistence spec; probe rows 5–8 |
| Regression test: Time end-to-end, malformed value hitting the guard | `validation.service.spec.ts`, `date-answer-persistence.spec.ts` |
| Existing `Date` answers unaffected | `dateAnswerInstant('Date', …)` is `new Date(text)` as before; Date specs unchanged and green |
