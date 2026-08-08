# The Forms automation service principal

`Forms Automation Service` is the identity on-submit automations and entity bindings execute as.
It is seeded here rather than left to each deployment so that a fresh install fails in a way that
names the missing piece: without the user, automations do not run at all and the log says only
that the principal is absent, which reads like a broken install. With it seeded, the first thing
you hit is the specific grant you have not made yet.

**It does not authenticate and is not a person.** No password, no directory account — MJ service
identities are `UserInfo` records fetched from `UserCache` and used as a `contextUser` for
server-side work. MJ's own `System` user works exactly this way. The `.invalid` email domain is
reserved by RFC 2606 precisely so an address can be unroutable on purpose.

**What it can do is deliberately almost nothing.** Its role, `Forms Automation Runner`, grants read
on the response entities and write on the Forms-owned bookkeeping tables (automation runs and the
binding ledger). The one exception worth naming: it also has **update** on `Form Responses`, not
merely read, because `Forms: Upsert Respondent Person` stamps `FormResponse.RespondentPersonID`
back onto the response it just matched. It has **no grant on any binding target entity**, so out of
the box a binding that tries to write a business record fails with a permission error naming that
entity.

**Granting it on a target entity is the security decision, and it is yours.** That grant set is
the real ceiling on what a form author can reach through a binding — the deployment allow-list
(`FORMS_BINDING_ALLOWED_ENTITIES`) is a second, narrower gate that can be checked at authoring
time, but the database grant is the one that cannot be bypassed. Add an `MJ: Entity Permissions`
row for the `Forms Automation Runner` role on each entity you intend forms to write, and no more.

Override which user is used with `FORMS_AUTOMATION_USER`. If the configured user is missing or
inactive, automations are skipped and say so — there is deliberately no fallback to the system
user, which would silently restore broad grants at the moment nobody is watching.
