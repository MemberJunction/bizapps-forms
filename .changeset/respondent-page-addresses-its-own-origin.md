---
'@mj-biz-apps/forms-server': patch
---

The respondent page no longer sends submissions to `localhost:4121` on hosts that have not set `MJAPI_PUBLIC_URL`.

With neither `FORMS_GRAPHQL_URL` nor `MJAPI_PUBLIC_URL` set, the page at `/f/:slug` fell back to a
hardcoded `http://localhost:4121` as the GraphQL endpoint it handed the respondent's browser. On any
host not listening there — MJ's own host on `:4000`, a branch harness on another port — every submit
went to a server that was not there, or to a different checkout's (#238). The page now addresses the
origin its own request arrived on (honouring `X-Forwarded-Host` / `X-Forwarded-Proto` behind a
trusted proxy), and MJAPI logs an error at boot saying `MJAPI_PUBLIC_URL` is unset. A configured
`FORMS_GRAPHQL_URL` or `MJAPI_PUBLIC_URL` still wins, and should be set on any deployment behind a
proxy. Authoring-asset URLs lost the same `localhost:4121` fallback: with no public URL and no
request origin the upload now fails with a logged 500 instead of storing a broken image URL.
