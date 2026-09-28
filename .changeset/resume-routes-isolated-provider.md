---
'@mj-biz-apps/forms-server': patch
'@mj-biz-apps/forms-core-entities-server': patch
---

The device-resume routes (`POST /f/:slug/resume`, `/remember`, `/forget`) no longer run their
database work on the process-global provider (#265). Released common-server (≤ 5.46.3)
`Common.LogActivity` holds a transaction open on that same global provider for the duration of an
unrelated activity write, and while it was open a device pointer's mint or a start-over's revoke
running concurrently on the same connection could be rolled back with it — reproduced on a
throwaway database with a harness that held a transaction open on the global provider in the same
shape `Common.LogActivity` does, then rolled it back: 14 `/remember` calls each returned 204 with a
`Set-Cookie` pointer, but only 4 of the 14 invites were actually persisted. Each of the three routes
now opens its own isolated provider instance for the request, created only the first time the
request actually touches the database (a request that never gets that far — no cookie, a
rate-limited call — opens nothing) and always released afterward. `/forget` keeps its existing
guarantee that the browser's pointer is always cleared, including when the isolated provider cannot
be created or a dependency call fails; that failure is logged, and the cookie still clears. The
`GET /f/:slug` page's own reads — the slug lookup, the published-version check, and the description
read that resolve before the resume routes ever run — moved onto the same kind of per-request
isolated lease, for the same reason.

`MagicLinkInviteMinter.MintAnonymousInvite` gained an optional `host` provider parameter so callers
running on an isolated instance can mint through it instead of the global one. No migration.
