---
"@mj-biz-apps/forms-ng": minor
"@mj-biz-apps/forms-entities": minor
"@mj-biz-apps/forms-server": minor
"@mj-biz-apps/forms-core-entities-server": minor
"@mj-biz-apps/forms-actions": minor
---

Ship the `<mj-form>` widget bundle, and make client and server agree on what a valid answer is

**The bundle (#20).** No published `forms-ng` tarball has ever contained
`dist/widget/mj-form.js` — verified by downloading all five on npm (`0.0.0`, `0.2.0`, `0.2.1`,
`0.3.0`, `0.4.0`) and listing their contents. `0.0.0` predates the widget, so the four releases
from `0.2.0` on shipped the AOT-compiled `dist/widget-entry.js` with nothing that bundles it:
`/forms/widget/mj-form.js` 404'd, the custom element never upgraded, and no public form ever
rendered. The bundler was never broken — it lived in a separate `build:widget` script that no CI
path invoked. `build` now runs both halves (`ngc && node scripts/build-widget.mjs`).

It survived all four because turbo declares `outputs: ["dist/**"]`: anyone who ran `build:widget`
by hand had the artifact captured into the build cache as if `build` had produced it, so local
builds looked correct forever after while cold-cached CI never made it.
`.github/scripts/validate-widget-bundle.sh` now asserts against the pack manifest — presence,
plausible size, zero unlinked `ngDeclare` sites, and that the element registers — and runs on
every PR as well as before publish.

**One definition of "answered".** The predicate was hand-written in four places, and they had
already drifted: the conditional evaluator tested `answer.length > 0` while all three validators
tested `value.trim().length > 0`. A respondent who typed a single space into an optional question
therefore satisfied an `isAnswered` conditional — revealing whatever branch depended on it —
while that same question simultaneously reported as unanswered. `isAnswerSupplied` in
`@mj-biz-apps/forms-entities` is now the only copy, and whitespace is not an answer.

**Type-derived format validation.** `Email`, `Number`, `Rating` and `NPS` questions authored
without an explicit `validationRule` were validated by the widget but not by the server, so a
direct POST at `SubmitFormResponse` persisted `not-an-email` into an `Email` question as a
`Complete` response — while the service's own docstring claimed format could not be bypassed.
`Phone` and `Date` were validated by *neither* side; the widget's type switch fell through to
`default: return VALID` for both. The check now lives in `@mj-biz-apps/forms-entities`
(`validateAnswerFormat`) and both sides call it. An explicit `ValidationRule` still applies on
top and can narrow a type further.

Two gaps in that check are closed with it. `Date` accepted any non-string outright, so answering
a `Date` question with `numericValue` skipped validation entirely and stored a number on a date
question — `dateValue` is a plain GraphQL `String` with no date scalar behind it, so nothing
upstream had vetted it either. And `Number` accepted anything `Number()` could convert, which
includes `0x10`, `0b101` and `0o17`; those passed as valid and were then persisted as the literal
text typed, which nothing downstream reads back as a number.

A numeric `min`/`max` is now enforced on any answer that IS a number, not only on one that
arrived in the `numericValue` column. The rule path branched on `typeof value`, so
`{ numericValue: 9999 }` was rejected against `max: 100` and `{ textValue: "9999" }` was
accepted — while the widget coerced the string and rejected both. A text input produces a
string, so this was reachable from the ordinary UI, not just a crafted request.

**An unsubmittable form.** `matchesValidationPattern` is now shared too. The widget treated an
author `pattern` that would not compile as valid (never block the respondent) and the server
treated it as invalid, so a form carrying a malformed regex showed no error while being filled in
and then refused every submit with a field error no input could clear. Both sides now fail open;
the type floor still applies underneath, and the respondent is not the one who made the mistake.

**Autosave drafts.** A `partial` (autosave) save is no longer held to finished-value rules — a
half-typed email or a value still under `minLength` no longer fails the debounced autosave and
discards the respondent's progress. Upper bounds (`maxLength`, `max`) ARE still enforced on a
draft: "not finished yet" and "already too big" are different claims, and exempting the ceilings
left autosave as an unbounded write on the anonymous public path, where `TextValue` is
`NVARCHAR(MAX)` and the widget sets no `maxlength` attribute.

**Widget sourcemap.** The bundle is built with `minify: true, sourcemap: true` and ends with
`//# sourceMappingURL=mj-form.js.map`, but nothing served that path, so it fell through to
MJAPI's authenticated routes and answered 401 on every devtools session. `/forms/widget/
mj-form.js.map` is now served beside the bundle, and only when a map was actually emitted.

This rejects submissions that previously succeeded — any answer that does not fit its question's
type. Already-published forms are covered without re-publishing, because the check derives from
`question.type` rather than from the stored rule.

**Host readiness.** `checkRespondentReadiness` no longer requires the deployment-global
`magicLink.restrictedRoleName` to equal `Form Respondent`. Core treats that value only as the
default for invites that name no role, and Forms' minter always names one — so the requirement
made every stock host report unready (core defaults it to `Magic Link Baseline`) and meant two
Open Apps could never both be ready on one MJAPI instance. The real requirement, that the role be
grantable, is unchanged, and now compares names the way core's `isRoleGrantable` does:
case- and whitespace-insensitively. The check reads the role from the same `FORMS_MAGICLINK_ROLE`
config the minter uses, so it cannot drift from what is minted.
