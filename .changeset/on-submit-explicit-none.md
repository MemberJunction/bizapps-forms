---
"@mj-biz-apps/forms-entities": minor
"@mj-biz-apps/forms-server": minor
"@mj-biz-apps/forms-actions": minor
"@mj-biz-apps/forms-ng": minor
---

Let a form say it runs NOTHING on submit, and stop the builder silently restoring the four built-in hooks (#47).

**The overload.** Dispatch was decided by an inline `automations.length > 0` test in the submit pipeline, so an empty automation list meant two different things at once: "this form has never configured anything" (fall back to the four legacy hooks) and "this form deliberately runs nothing". Only the first was reachable. The repo said so in two places that contradicted each other — `snapshot-builder.ts` called an empty array "what keeps an already-published form on the legacy hook list", while `publish.service.ts` called it "this form configures no automations".

**What it cost.** `Forms: Upsert Respondent Person` is one of the four. It creates a `MJ_BizApps_Common: Person` from the answers and stamps `FormResponse.RespondentPersonID`, and its dedupe covers only rows it created. An app that owns its own subject identity — bizapps-caliber binds an `Applicant` from the same answers — therefore produced a second `Person` for the same human on every submission, one Forms neither knows about nor points at. Nothing errored and nothing logged; the symptom arrived later, as a follow-up task and the record it is about referencing different people. There was no way to decline: no env knob (`FORMS_HOOKS_BLOCKING` only controls whether hooks are awaited), no per-form setting, and the 0.8.0 back-fill covers only forms that existed when it ran, so every form created afterwards is permanently on the legacy path.

**The same defect, in the product.** `remove()` in the Automate tab had no last-row guard, so an author who deleted their final step published an empty array and silently got the confirmation email, follow-up task, respondent-Person upsert and answer scoring back. Adding a step now marks the form authoritative permanently, and nothing anywhere returns a form to the legacy list.

**The fix.** `FormSettings.onSubmitMode` (`'Legacy' | 'Configured'`) is carried in the published snapshot, and the decision moves to `resolveOnSubmitDispatch` in `@mj-biz-apps/forms-entities` — one pure function instead of an inline test. `Configured` means the automation list is authoritative *including when it is empty*. **Absent keeps the exact inference the server has always made**, which is what makes this safe: every snapshot published before this field carries no mode and behaves identically, and a pipeline test now pins that so the compatibility cannot quietly erode. A `Configured` form with no automations also short-circuits before resolving the service principal and re-reading the response, so declining costs nothing on the hot path.

It rides in `Form.Settings` rather than a new column because a column needs a CodeGen run to be usable and this shipped without a database; the field is optional and the settings blob is already parsed on both sides and mirrored into the snapshot. Promoting it to a real column with a CHECK constraint is worth doing when CodeGen next runs.

**Authoring on-submit steps programmatically.** `Forms: Generate Form From Brief` and `Forms: Create Form From Template` take two new optional params, `OnSubmitMode` and `Automations`. Steps name their Action **by name** (ids differ per environment) and run in array order, so two can never share a `DisplayOrder`. An Action name this deployment does not have is a hard failure rather than a skipped step — the opposite of the builder's seeding, deliberately: seeding skips an unregistered built-in to reproduce the legacy runner, whereas a caller that named a step and silently did not get it has been lied to. A failed resolve refuses before writing anything, so a form is never left half-configured and marked authoritative.

`V202608241800` adds the four `ActionParam` records. It is hand-written rather than generated — a seed push needs a database with MJ and both sibling apps — and each insert is guarded on both the id and the `(ActionID, Name)` pair, because `spCreateActionParam` is a bare INSERT and an unguarded collision halts the migration chain.

**Documented.** `docs/on-submit-automations.md` covers what runs and when, how to configure or decline it, and names `Forms: Upsert Respondent Person` as the owner of respondent identity — consuming apps should read `FormResponse.RespondentPersonID` rather than deriving a second Person. MemberJunction/MJ#3825 (IS-A promotion) is what would make that fully reachable for a consumer whose record must *be* a Person.

**No behaviour changes without an explicit opt-in.** Every existing form, published snapshot and caller is unaffected until it declares a mode.
