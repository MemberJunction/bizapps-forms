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
stated replacement. Together with the removal of the `RootTemplateSourceFormID` property from
`FormEntity`, this is the whole of the public-surface change, and it is why these packages take a
`minor` rather than a `patch`.
