---
"@mj-biz-apps/forms-actions": minor
"@mj-biz-apps/forms-server": minor
---

On-submit actions wrote every cross-app record as nulls, on any host but a dev box.

`Forms: Upsert Respondent Person` reported `First Name cannot be null` for responses whose First name answer was sitting in the row. The extraction was never at fault: `FirstName` is `identity.firstName ?? email.split('@')[0]` and `LastName` is `identity.lastName ?? '(unknown)'`, so neither can be null whatever the answers say — and the real error named **both** of them.

The cause is one line of typing. `MJ_BizApps_Common: People` and the three `MJ_BizApps_Tasks:` entities belong to sibling apps, so the actions could only name their classes through `import type` — which is erased at compile time. Nothing in the shipped package ever loaded the packages that own them, making them a phantom runtime dependency: correct only on a host that happened to load them for its own reasons. `apps/MJAPI/server.mjs` did, which is precisely why the failure never appeared in this repo's own harness and did everywhere else.

It fails silently because `Metadata.GetEntityObject` does not throw for an unregistered entity — MJ's ClassFactory falls back to a plain `BaseEntity`, which has `Get`/`Set` but none of the generated typed accessors. `person.FirstName = 'Ada'` then defines a JS own-property the entity never reads. The discriminator, from one submit on a live stack: the upsert action wrote nulls at 17:13:43 while the entity-binding action wrote the *same* answers to the *same* entity correctly at 17:13:53 — because bindings go through `record.Set(field, value)`, which works on the fallback.

`custom/register.ts` now imports both sibling entity packages at module scope, and `forms-server`'s index already side-effect-imports that barrel, so any host loading Forms gets the registrations. The manual loads in `apps/MJAPI/server.mjs` are removed rather than kept: leaving them would hide a regression in the package from the one stack that runs it.

Two things guard it now. `register.spec.ts` asserts each of the four entity names resolves through its generated class, checking the prototype **chain** rather than the resolved class name so a sibling app adding its own subclass (bizapps-tasks already does, for `Tasks`) does not fail a change that keeps the typed accessors. And both actions now refuse up front, with `ENTITY_CLASS_UNREGISTERED` and a message naming the entity and what the fallback would do, rather than writing nulls — the check is on the class-factory registry, not `instanceof` on the returned object, so test fakes still exercise the real code path.

`Forms: Create Followup Task` carried the identical defect for `Tasks`, `Task Links` and `Task Types`. It is fixed by the same change; it had been failing earlier for an unrelated reason, which is what kept it hidden.
