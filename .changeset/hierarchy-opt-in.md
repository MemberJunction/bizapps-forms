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
