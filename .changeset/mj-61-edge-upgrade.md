---
"@mj-biz-apps/forms-entities": minor
"@mj-biz-apps/forms-server": minor
"@mj-biz-apps/forms-actions": minor
"@mj-biz-apps/forms-ng": minor
"@mj-biz-apps/forms-core-entities-server": minor
---

Upgrade MemberJunction to 6.1.0-edge.1 (task-graph line) and regenerate CodeGen
output against the 6.1 generator: GraphQL reverse-relationship resolver fields
lose the redundant schema prefix (mjBizAppsFormsMJ_BizApps_Forms_Forms_… →
mjBizAppsFormsForms_…), shrinking apps/MJAPI/schema.graphql accordingly.
