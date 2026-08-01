---
"@mj-biz-apps/forms-ng": minor
"@mj-biz-apps/forms-entities": minor
"@mj-biz-apps/forms-server": minor
"@mj-biz-apps/forms-core-entities-server": minor
"@mj-biz-apps/forms-actions": minor
---

Ship the `<mj-form>` widget bundle, and close the server-side format-validation gap

**The bundle (#20).** No published `forms-ng` tarball has ever contained
`dist/widget/mj-form.js` — verified against all five on npm (`0.0.0`, `0.2.0`, `0.2.1`,
`0.3.0`, `0.4.0`). `0.0.0` predates the widget, so the four releases from `0.2.0` on shipped
the AOT-compiled `dist/widget-entry.js` with nothing that bundles it: `/forms/widget/mj-form.js`
404'd, the custom element never upgraded, and no public form ever rendered. The bundler was
never broken — it lived in a separate `build:widget` script that no CI path invoked. `build`
now runs both halves (`ngc && node scripts/build-widget.mjs`).

It survived five releases because turbo declares `outputs: ["dist/**"]`: anyone who ran
`build:widget` by hand had the artifact captured into the build cache as if `build` had
produced it, so local builds looked correct forever after while cold-cached CI never made
it. `.github/scripts/validate-widget-bundle.sh` now asserts against the pack manifest —
presence, plausible size, zero unlinked `ngDeclare` sites, and that the element registers —
and runs on every PR as well as before publish.

**Format validation.** `Email`, `Phone`, `Number`, `Rating`, `NPS` and `Date` questions
authored without an explicit `validationRule` were validated by the widget but not by the
server, so a direct POST at `SubmitFormResponse` persisted `not-an-email` into an `Email`
question as a `Complete` response — while the service's own docstring claimed format could
not be bypassed. The type-derived check now lives in `@mj-biz-apps/forms-entities`
(`validateAnswerFormat`) and both the widget and the server call it, so the two cannot drift
again. An explicit `ValidationRule` still applies on top and can narrow a type further.

This rejects submissions that previously succeeded — any answer that does not fit its
question's type. Already-published forms are covered without re-publishing, because the check
derives from `question.type` rather than from the stored rule.

**Host readiness.** `checkRespondentReadiness` no longer requires the deployment-global
`magicLink.restrictedRoleName` to equal `Form Respondent`. Core treats that value only as the
default for invites that name no role, and Forms' minter always names one — so the
requirement made every stock host report unready (core defaults it to `Magic Link Baseline`)
and meant two Open Apps could never both be ready on one MJAPI instance. The real
requirement, that the role be grantable, is unchanged. The check now reads the role from the
same `FORMS_MAGICLINK_ROLE` config the minter uses, so it cannot drift from what is minted.
