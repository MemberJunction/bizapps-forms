---
"@mj-biz-apps/forms-entities": minor
"@mj-biz-apps/forms-core-entities-server": minor
"@mj-biz-apps/forms-server": minor
"@mj-biz-apps/forms-ng": minor
---

Forms now works on a host whose MJAPI database login holds only MJ's three roles, `cdp_Developer`,
`cdp_Integration` and `cdp_UI` (#338). Before, every respondent final submit and partial save failed
with "Something went wrong while submitting your response", and the automation outbox could not
claim, settle, renew or replay an event: those paths ran raw SQL against Forms base tables, and MJ's
roles get `SELECT` on views and `EXECUTE` on procedures, never table rights. A `db_owner` login, as on
most dev boxes, never showed it.

The migration `V202610222300__v0.16.x__Roles_Only_Guarded_Write_Sprocs.sql` adds nine procedures in
`__mj_BizAppsForms`, each the statement it replaces, granted `EXECUTE` to `cdp_Developer` and
`cdp_Integration`; on SQL Server the server now calls them. No table, column or entity changes, and no
table grants. PostgreSQL keeps the raw statements. `docs/install.md` §5 states the login requirement.
