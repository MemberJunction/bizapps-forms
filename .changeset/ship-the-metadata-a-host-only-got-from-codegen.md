---
"@mj-biz-apps/forms-entities": minor
"@mj-biz-apps/forms-server": minor
"@mj-biz-apps/forms-ng": minor
---

Ship the metadata a host only ever got from CodeGen

A host installs MJ Forms by running migrations, and never runs CodeGen against
`__mj_BizAppsForms`. Three artifacts around `FormResponse.FormDistributionID`
were therefore missing on every installed host: the Form Distributions → Form
Responses relationship (so the related-records collection did not render on the
Form Distribution form — the section resolved to empty view params), the
related-entity name-field map, and the
curated `Category` on the four fields V202609121200 added — two of which
(`AllowDeviceResume`, `AllowedOrigins`) are on Form Distributions, not Form
Responses.

The gate that should have caught the original defect now checks the partial
case: a migration that adds a column must ship the `EntityField` row naming it,
and one that adds a foreign key must ship its `EntityRelationship` row.
