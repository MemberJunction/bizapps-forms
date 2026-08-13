---
'@mj-biz-apps/forms-core-entities-server': minor
'@mj-biz-apps/forms-entities': minor
'@mj-biz-apps/forms-actions': minor
'@mj-biz-apps/forms-server': minor
'@mj-biz-apps/forms-ng': minor
---

Harden the `Form Respondent` role's entity grants, and make the 0.8.0 metadata seed installable
on a database where that role already exists (#39).

**Security.** The 0.8.0 seed created all nine of the role's permission rows with every row-level
security filter column explicitly NULL. Because MJ publishes a generic `Create<Entity>` mutation
for every entity and treats a null `CreateRLSFilterID` as exemption from create-time RLS, the
`CanCreate` grant that exists only to satisfy forms-server's `checkRespondentScope` gate doubled
as direct write access that never entered the submit pipeline — past Turnstile, the rate limiter,
the `MaxResponses` quota, field validation and the distribution's open/close window, all of which
live only there. And because one shared anonymous principal backs every respondent, the unfiltered
reads were instance-wide: any respondent to any form could enumerate every `FormDistribution` row,
`PublicLinkToken` included.

A new migration attaches a deny-all create filter to both response grants and scope filters —
keyed on the distribution the session's own magic-link invite names — to the Form Distributions and
Form Versions reads. Nothing legitimate is lost: the scope check reads only the `CanCreate` flag,
and every real response write is performed by the elevated system user.

**Five grants removed, not filtered.** No anonymous code path has ever read Forms, Form Questions,
Form Question Options, Form Pages or Form Styles — `resolvePublishedDefinition` reads only
Distributions and Versions, and the published version's `DefinitionSnapshot` already embeds the
questions, options, pages and style tokens. Those grants were removed. **If you have built
anything that reads those entities under an anonymous respondent session, it will stop working**;
it needs a scoped grant of its own.

**Installability.** The seed's two `spCreateRole` calls were blind INSERTs against a table whose
`Name` column is UNIQUE, so 0.8.0 halted the migration chain with `Msg 2627` on any database where
`Form Respondent` already existed — which is every host that installed bizapps-caliber first. Both
creates are now adopt-or-skip by name, and every reference to either Forms role resolves the id by
name rather than assuming the canonical UUID.

Co-installation with bizapps-caliber (≥ #220) is verified in both orders: Caliber's own
postconditions test that a filter is present rather than whose it is, so it leaves these in place,
and because the filter records are owned by this app a later Caliber uninstall can no longer return
the grants to their unfiltered state.

No API or TypeScript change: this ships entirely as migrations.
