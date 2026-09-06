---
"@mj-biz-apps/forms-entities": minor
"@mj-biz-apps/forms-server": minor
"@mj-biz-apps/forms-actions": minor
"@mj-biz-apps/forms-ng": minor
---

A `Time` question no longer makes the whole form unsubmittable, and the `date` column now reads back as what the respondent entered.

Answering a `Time` question failed the entire submission with a bare `Invalid time value`, naming no field. `<input type="time">` emits `14:30`, the widget sent it verbatim, and persistence did `new Date('14:30')` — an Invalid Date that `toISOString()` throws on from inside `Save()`. Nothing between the two had an opinion: `validateAnswerFormat` had a `Date` case and no `Time` case, and a draft was held to upper bounds only. Every published form carrying a Time question was collecting nothing. Closes #116.

**One module owns the format.** `contracts/answer-date.ts` is where the decision lives, and the widget, the validator, persistence, the conditional evaluator, the dashboard and the on-submit actions all read through it. A `Time` travels as the bare clock its control emits and is stored as that clock on the Unix epoch date in UTC — `14:30` → `1970-01-01T14:30:00Z` — so the whole column obeys one rule: **the UTC fields of the stored instant are what the respondent entered.** The epoch rather than the submission day, so two people who both answered `09:00` store the same value and compare equal in reporting. `Date` storage is byte-for-byte unchanged; this generalises the rule `Date` already followed.

The server parses the clock rather than the widget composing an instant, because the server evaluates conditional rules on the wire value while the widget evaluates on the control's `14:30`. An ISO wire format would have the server see a date where the widget sees a time, so a rule on a Time question would fire in the browser and never on the server.

**Strict on the wire, and this is the one behaviour change for a non-widget API client.** An ISO instant posted on a `Time` question is now refused with `Enter a valid time.` where it previously succeeded, because the evaluator would compare it on the date scale and a rule written against `14:30` could never match it. No client in this repo does that, and a browser cannot: `<input type="time">` sanitises every non-clock value to empty.

**Every unstorable date answer is now refused by name.** Validation names the question in every mode, drafts included — a draft `Date` carrying garbage used to reach `Save()` and come back as the same unattributed `Invalid time value`. Persistence checks again, because validation judges only the column a question's *type* routes to while a caller may post `dateValue` on a question of any type; that path now returns `Answer to "<prompt>" is not a valid date.` instead of a runtime error.

**Reading a stored answer back.** `dateAnswerText` is the inverse of the parse, and the one reader every consumer should use: a `Time` gives back `14:30`, a `Date` gives back `2026-09-01`.

- The response detail, the CSV export and the reporting surfaces show both halves as the respondent entered them. Previously a Time rendered as `1970-01-01T14:30:00.000Z` and a Date as `2026-09-01T00:00:00.000Z`.
- On-submit Actions and AI Agents get `dateText` beside the raw `dateValue`. The instant stays for actions doing date arithmetic; the text is for anything putting the answer in front of a person, which otherwise had to know that a Time is stored on the epoch date and would render a confirmation email saying "1 Jan 1970".
- The dashboard's time-of-day bands read UTC hours. Reading local hours filed a `14:30` answer under "Morning" for every viewer west of Greenwich.
- The dashboard's month buckets read UTC too. A `Date` answer is stored as UTC midnight, so local fields gave the previous day — and while that only crosses a month boundary on the 1st, it did so silently: a `2026-09-01` answer was filed under "Aug 2026", and an epoch date under "Dec 1969". Both halves of the bucket move together (the sort key and the `toLocaleDateString` label), because correcting one alone yields a card that sorts under September and is captioned August. The label keeps the viewer's locale — only the timezone was ever wrong.

Nothing here is localised, deliberately: a stored `Date` is UTC midnight, so a locale formatter renders the **previous day** anywhere west of Greenwich. A date answer carries no zone, so there is no zone in which to localise it, and the ISO calendar date also sorts as text and parses in a spreadsheet.

**An automation gated on a `Time` question can fire.** Automation conditions are evaluated after persistence from the stored instant, which the evaluator reads on the date scale, while an authored rule value (`"12:00"`) is on the time scale — so every `equals`/`greaterThan`/`lessThan` on a Time question silently evaluated false with nothing logged. Automation answers are now read through the contract in `buildConditionAnswers`, which is the one place that holds the question and can tell a Time from a Date; entity binding still receives the instant, which is the right shape for a datetime column.

**A `dateValue` of `null` no longer 500s the public write path.** The date branch gated on `!== undefined`, and a caller may legitimately send `null` for a column an answer does not use — so a text answer carrying an explicit `null` reached the parse and threw `TypeError` out of the anonymous mutation. It is the only branch that needs `!= null`, because it is the only one that parses rather than assigns.

The smoke fixture's Time answer was an ISO instant, which the new format refuses; it now sends a clock reading, so the suites that submit a response keep working against forms carrying a Time question.

No migration and no schema change: the storage shape of a value that could never be stored is not a change to any existing row.

`minor` rather than `patch`, on three counts, and matching what sibling changesets use for the same kinds of change: the refused ISO instant is a documented behaviour break for a non-widget API client; `forms-entities` gains public exports (`calendarDateOf`, `dateAnswerText`); and `forms-actions` adds a **required** `dateText` member to the exported `AnswerWithType`, plus `TargetFields` replaces the bare name set `BindingTargetGateway.describeEntity` returned, which any external implementer of that gateway must follow.
