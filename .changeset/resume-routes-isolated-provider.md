---
'@mj-biz-apps/forms-server': patch
'@mj-biz-apps/forms-core-entities-server': patch
---

The device-resume routes (`POST /f/:slug/resume`, `/remember`, `/forget`) no longer run their
database work on the process-global provider (#265). Released common-server (≤ 5.46.3)
`Common.LogActivity` holds a transaction open on that same global provider for the duration of an
unrelated activity write, and while it was open a device pointer's mint or a start-over's revoke
running concurrently on the same connection could be rolled back with it — reproduced against a
live host as 14 `/remember` calls that each returned 200 with a pointer, but only 4 of the 14
invites were actually persisted. Each of the three routes now opens its own isolated provider
instance for the request, created only the first time the request actually touches the database
(a request that never gets that far — no cookie, a rate-limited call — opens nothing) and always
released afterward. `/forget` keeps its existing guarantee that the browser's pointer is always
cleared, including when the isolated provider cannot be created or a dependency call fails; that
failure is now logged rather than left to crash the request.

`MagicLinkInviteMinter.MintAnonymousInvite` gained an optional `host` provider parameter so callers
running on an isolated instance can mint through it instead of the global one. No migration.
