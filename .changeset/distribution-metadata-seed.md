---
'@mj-biz-apps/forms-entities': minor
'@mj-biz-apps/forms-actions': minor
'@mj-biz-apps/forms-server': minor
---

Ship the metadata seed, so a clean `mj app install` produces a Forms install that actually works.

**MJ Forms has never shipped a metadata seed migration, for any release.** `mj-app.json` names a
`metadata` directory, but MJ's manifest schema is explicit that `metadata.directory` is a
dev-time pointer the install engine **never reads** — seeding happens exclusively through
`migrations/`. Everything `mj sync push` created therefore existed only on the machine that ran it.
A clean install produced a Forms deployment with no `Form Respondent` role, no `CanCreate` grant on
the response entities, no styles, categories, application, nav, dashboards or AI authoring — which
is to say the anonymous submit path, the product, could not run. Every step reported success. The
mechanical cause was a missing `sqlLogging.formatAsMigration` block in `metadata/.mj-sync.json`,
without which a push writes to the database and leaves no artifact; both sibling Open Apps
(`bizapps-common`, `bizapps-tasks`) ship one and Forms did not.

`V202608081700__v0.8.x__Metadata_Sync.sql` now carries all 82 records. It was generated against a
database whose Forms metadata had been emptied, so every statement is a CREATE, and it was verified
by emptying that database again and replaying **the migration** rather than the push.

**The generator's output cannot ship verbatim, and this is the trap to remember.** MetadataSync
writes core stored-procedure calls with `${flyway:defaultSchema}` because in MJ's own repository the
default schema *is* the core schema. Here it is `__mj_BizAppsForms`, so all 67 core calls would have
executed as `__mj_BizAppsForms.spCreateRole` — an object that does not exist — on every install.
They are rewritten to `${mjSchema}`; the 20 Forms-schema calls go the other way, literal to
placeholder.

**On-submit automations now work out of the box.** The seed ships the `Forms Automation Service`
principal together with a new `metadata/user-roles/` grant linking it to `Forms Automation Runner`.
The two must ship together: `resolveAutomationPrincipal()` resolves by name, so the user without the
grant is worse than neither — it turns "automations skipped, principal absent" into a principal that
resolves and then fails on permissions at the first read. Grants on binding **target** entities
remain unshipped; that set is the real ceiling on what a form author can reach through a binding and
stays the deployment's decision. Two defects in the users metadata are fixed on the way: its `Title`
was 72 characters against a 50-character limit, so the record could never have saved at all.

**`${commonSchema}` no longer ships.** `mj migrate` builds Skyway's placeholder map from this repo's
`mj.config.cjs`, but `mj app install` builds it from the *host's*, which has never heard of us — and
Skyway deliberately leaves an unknown `${…}` untouched instead of failing. The literal string
therefore survived into the `@ExcludedSchemaNames` argument of five CodeGen sweeps in two
migrations, silently disabling the `__mj_BizAppsCommon` exclusion so a Forms migration would rewrite
a sibling app's entity metadata — the same contamination class as issue #10. The placeholder is
replaced with literal schema names and removed from `mj.config.cjs` so CodeGen cannot re-emit it.

**`mj app remove` now retires this app's rows from the shared core schema**
(`migrations-teardown/V001`, declared via `migrations.teardownDirectory`). Dropping
`__mj_BizAppsForms` cannot reach the roles, actions, prompts, templates and dashboards the seed
writes into `__mj`, and leaving them behind makes the next install collide on their fixed UUIDs. The
engine is ported from `bizapps-caliber` and discovers dependents from `sys.foreign_keys` at apply
time rather than trusting a build-time ordering. Two fixes were needed for Forms: remove runs the
teardown *before* dropping the app schema, so `FormAutomation` rows still reference the Actions being
retired — leaving them blocks the delete on `FK_FormAutomation_Action`, and releasing the reference
violates `CK_FormAutomation_SingleTarget`. Either way the single transaction rolls back and an
installation that had ever configured one automation could not be removed at all. Own-schema
references are now doomed rather than released, and the FK walk spans both schemas so
`FormAutomationRun` follows its parent.

**`SchemaInfo.EntityNamePrefix` is now declared in the database**
(`V202608081800__v0.8.x__Seed_SchemaInfo_EntityNamePrefix.sql`). CodeGen resolves the prefix from
`mj.config.cjs` first and `SchemaInfo` second; a host has the latter and not the former, so any
Forms entity a host's CodeGen run adds would be named without `MJ_BizApps_Forms: ` while
`@mj-biz-apps/forms-entities` registers the prefixed name — a silent registration miss. This is
`bizapps-caliber`'s #119, inoculated against here before it could bite.

**`npm run lint:distribution` guards both defect classes** — metadata that has drifted from the
shipped seed, and any placeholder in shipped SQL that `mj app install` cannot resolve — with
self-tests proving the gate fires, and a `distribution-gate.yml` workflow running it on every push
and pull request touching metadata, migrations or the manifest.
