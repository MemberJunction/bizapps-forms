---
'@mj-biz-apps/forms-entities': minor
---

Fresh installs no longer overwrite bizapps-common's Relationship and Contact Method views, procedures and triggers. The Forms baseline migration carried stale copies of ten `__mj_BizAppsCommon` objects, and on a host that installed Forms after Common 5.45 every Relationship save failed with `@JobFunctionID is not a parameter for procedure spCreateRelationship`. The baseline now creates objects only in `__mj_BizAppsForms`, and `lint:distribution` refuses any shipped DDL or grant outside it.

**Already-installed hosts:** if you installed Forms after bizapps-common 5.45, Common's `vwRelationships`, `spCreateRelationship`, `spUpdateRelationship` (and their Contact Method counterparts) are still the stale copies. Re-apply bizapps-common's current definitions for those objects. Upgrading Forms alone does not restore them.
