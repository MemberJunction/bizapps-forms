---
'@mj-biz-apps/forms-entities': minor
'@mj-biz-apps/forms-server': minor
'@mj-biz-apps/forms-ng': minor
---

Adopt MJ 6.1's `IsHierarchy` opt-in so Form Categories and Forms stay readable

MJ 6.1.0-edge.3 put base-view `Root*` hierarchy columns behind an `EntityField.Configuration` seed.
Forms never shipped one, so the first `mj codegen` on any host dropped `RootParentID` from
`vwFormCategories` and `RootTemplateSourceFormID` from `vwForms` while their `EntityField` rows
stayed — making every read of both entities fail with `Invalid column name`, which a grid renders as
"no data" rather than an error.

`FormCategory.ParentID` is seeded as a hierarchy and gains the full column set
(`RootParentID`, `ParentIDDepth`, `ParentIDPath`, `ParentIDIsLeaf`, `ParentIDChildCount`).
`Form.TemplateSourceFormID` is seeded as **not** a hierarchy — it is a one-hop provenance pointer —
so `RootTemplateSourceFormID` is removed from `vwForms` and from the generated `FormEntity`.

**Also in this release, because the regeneration carries it: the child-array GraphQL fields are
gone.** `forms-server` previously contributed 25 `@FieldResolver`s and 50 `<Parent>_<Child>IDArray`
fields to the host schema — `mjBizAppsFormsForms_CategoryIDArray`,
`mjBizAppsFormsFormAutomationRuns_FormAutomationIDArray` and so on. MJ's CodeGen stopped emitting
them (`CodeGenLib/src/Misc/graphql_server_codegen.ts`): they resolved with a per-parent `SELECT *`,
which is an N+1. Regenerating against the pinned MJ therefore removes all 50 fields and all 25
resolvers from the schema this package contributes.

Nothing in this repo queried them, but they were part of the published GraphQL surface, so a client
selecting one must move to `RunView` (or `DeclareRelatedRecords`) for the same data — MJ's own
stated replacement.

**One exported method is renamed.** `mjBizAppsFormsFormEntity.ValidateTemplateStatusRestriction`
becomes `ValidateStatusForTemplates`. The body is unchanged — a template may not be `Published` —
but the name is part of `@mj-biz-apps/forms-entities`' published surface, so an external caller
invoking it by the old name no longer compiles. CodeGen derives the name from the CHECK
constraint's shipped metadata, and no alias is possible without hand-editing generated output,
which this same change now refuses. Call the new name.

**Two further generated behaviours change, neither of them cosmetic.** The 25 relationship grids
across the twelve regenerated forms now pass the FK join field to `NewRecordValues(entity, field)`,
so creating a record from, say, a Form's Distributions grid pre-fills the parent link instead of
leaving it blank. And the Form Screen form's content section is re-keyed from `content` to
`screenContent` (and renamed `Content` → `Screen Content`, which the shipped metadata already
says). Section expansion state and panel height are persisted per `(entity, sectionKey)` through
`UserInfoEngine`, so a user who had collapsed or resized that section gets the default back once —
their stored preference sits under the old key. It resets once and then persists normally.
(The `ShowToolbar` flip in the same templates is *not* in this list: MJ's `EffectiveShowToolbar`
already forced the toolbar on inside a related-entity panel, so those 25 sites change nothing at
runtime.)

`minor` is the level because this change ships a migration and metadata, which is what
`.claude/rules/changesets.md` keys the decision on — not because of the public-surface changes
above. Those are listed so nobody has to discover them from a diff.
