---
"@mj-biz-apps/forms-server": patch
"@mj-biz-apps/forms-ng": patch
---

The Distribute tab now warns when another app owns a share link (#292). If a co-installed app (for example a hiring app that hosts the form on its own page) claims a link's slug, the author sees that responses sent to the plain Forms link are saved as form responses only and that app never sees them, with the app's own link and a copy button, plus "used by" in the link list. A claim check that fails is shown as a failed check, never as "no claims". Warnings appear only once the consuming app registers a claim provider; see `docs/distribution-claims.md`. The check is a new authenticated GraphQL query, `FormDistributionClaims(formId)`, available to users who can update Form Distributions.
