---
"@mj-biz-apps/forms-entities": minor
---

**A clean install of MJ Forms gets past `Rules_And_Branching` again (#155).** `V202608252340` shipped
CodeGen's raw output, and CodeGen writes an entity id as whatever literal the database it introspected
happened to hold — here `A1F8CC58-B040-429C-B695-70DB0E9E7327` for `MJ_BizApps_Forms: Form Screens`.
No shipped SQL creates that row. `V202608182100` added the `FormScreen` table with no `__mj` metadata
behind it, and `V202608191300` repaired that with an `Entity` INSERT guarded on the natural key, so a
fresh database gets its literal `6313B0B1-37E8-432F-AEB6-F35F218C5D22` while a host that had already
run CodeGen by hand keeps whatever id it minted. Neither is `A1F8CC58`. So every install built from
this repo alone stopped at this file — `The INSERT statement conflicted with the FOREIGN KEY
constraint "FK_EntityField_Entity"` — and the six migrations after it never ran. The failure was the
whole chain, not one field.

**The id is resolved by natural key now**, re-resolved in each batch that needs it because T-SQL
variables do not survive a `GO`, and with a `THROW` when the lookup returns nothing. That is the
shape `V202608191400` already uses for this same entity. Whichever id a host holds, the lookup finds
it, and no second literal is left to be wrong on the next database. The NULL check is not ceremony:
`spDeleteUnneededEntityFields` reads an empty `@EntityIDs` as *unscoped* and then sweeps every entity
in every schema its exclude list does not name, so an unresolved id passed through would turn a
one-entity heal into a database-wide delete.

The file was edited in place rather than repaired by a later migration, which `migrations/README.md`
permits on exactly this test — a file that cannot apply at all leaves nothing after it able to run,
so a repair migration could never have reached the hosts that need it. It is unreleased in any case
(the last tag, `v0.10.0`, stops at `V202608131600`), and a host that did apply it is unaffected:
Skyway resolves applied migrations by version and never checksum-validates. No record changed, only
how the entity id is resolved, so `metadata/` is untouched and there is nothing to do on upgrade.
`npm run lint:distribution` now refuses a shipped migration that uses a GUID as an `EntityID` when no
shipped SQL seeds that GUID, which is the half that stops this recurring.
