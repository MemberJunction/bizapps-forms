# The Forms automation service principal

`Forms Automation Service` is the identity on-submit automations and entity bindings execute as.

> **This directory SHIPS, and it ships with `metadata/user-roles/`.**
> `V202608081700__v0.8.x__Metadata_Sync.sql` creates both the user and its `Forms Automation
> Runner` grant, so automations work on a fresh install with no manual step.
>
> **The two must ship together.** `resolveAutomationPrincipal()` finds the user by NAME, so
> shipping the user WITHOUT the role grant is strictly worse than shipping neither: instead of
> "automations skipped, principal absent" — a log line that names the missing piece — you get a
> principal that resolves and then fails on permissions at the first read. `metadata/user-roles/`
> did not exist until 2026-08-08, which is why an earlier pass excluded this directory entirely.
>
> `packages/Server/src/automation/service-principal.ts` argues the user is "a deployment step,
> deliberately". That reasoning holds for the part that is genuinely a deployment decision — the
> grants on **binding target entities**, which remain unshipped and are the real ceiling on what a
> form author can reach. It does not extend to the principal itself, which cannot authenticate
> (unroutable `.invalid` address per RFC 2606, no directory account) and is the same shape as MJ
> core's own `System` user.
>
> Two things this file got wrong before it ever shipped, both found by pushing it: its `Title` was
> 72 characters against a 50-character limit (so the record could never have saved), and
> `MJ_Forms_Dev`'s principal was created by `smoke/seed-binding-smoke.mjs` under a different GUID
> (`11111111-…-555555555003`) and email. The dev database still needs reconciling to the shipped
> GUIDs. See plans/DISTRIBUTION_SEED_PLAN.md.

The argument for seeding it: without the user, automations do not run at all and the log says only
that the principal is absent, which reads like a broken install. With it seeded, the first thing
you hit is the specific grant you have not made yet.

**It does not authenticate and is not a person.** No password, no directory account — MJ service
identities are `UserInfo` records fetched from `UserCache` and used as a `contextUser` for
server-side work. MJ's own `System` user works exactly this way. The `.invalid` email domain is
reserved by RFC 2606 precisely so an address can be unroutable on purpose.

**What it can do is the floor the shipped automations need, and nothing wider.** Its role,
`Forms Automation Runner`, holds (full list and reasons: `metadata/entity-permissions/`, and
`AUTOMATION_RUNNER_GRANTS` in `packages/Server/src/automation/automation-readiness.ts`):

- **Forms-owned:** read on the form, its questions, uploads, automations and bindings; read +
  update on responses and answers (`Upsert Respondent Person` stamps `RespondentPersonID`,
  `Analyze Written Responses` writes scores); read + create + update on the automation-run and
  binding ledgers.
- **MJ engines every action run goes through:** `MJ: Action Execution Logs` and `MJ: AI Prompt
  Runs` (read + create + update), `MJ: File Entity Record Links` (read + create + delete, for
  binding attachments), and read on `MJ: Actions` (MJ resolves an entity action by name before
  running it).
- **The built-in hooks' targets in the two sibling apps:** `People` (read + create + update);
  Task Types (read), Tasks and Task Links (create only) for `Create Followup Task`; Activity Types
  (read), Activities (read + create) and Activity Links (create) for the `Common.LogActivity`
  action that creating a Person fires.

No Delete anywhere except the attachment links. Write on core's task-graph entities is withheld on
purpose, so `Common.LogActivity`'s durable dispatch falls back to running inline, exactly as it does
for every interactive user. It has **no grant on any binding target entity**, so out of the box a
binding that tries to write a business record fails with a permission error naming that entity.

At every server start, Forms checks this principal's effective permissions against that list and
logs each gap as `[Forms] On-submit automations are NOT ready: …`, so a grant that never reached a
host is named at boot rather than as a per-submit log line.

**Granting it on a target entity is the security decision, and it is yours.** That grant set is
the real ceiling on what a form author can reach through a binding — the deployment allow-list
(`FORMS_BINDING_ALLOWED_ENTITIES`) is a second, narrower gate that can be checked at authoring
time, but the database grant is the one that cannot be bypassed. Add an `MJ: Entity Permissions`
row for the `Forms Automation Runner` role on each entity you intend forms to write, and no more.

Override which user is used with `FORMS_AUTOMATION_USER`. If the configured user is missing or
inactive, automations are skipped and say so — there is deliberately no fallback to the system
user, which would silently restore broad grants at the moment nobody is watching.
