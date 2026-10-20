---
"@mj-biz-apps/forms-core-entities-server": minor
"@mj-biz-apps/forms-server": minor
---

The public rate limits are now shared across API instances when the host runs Redis (#321).
Before, each MJAPI process kept its own windows, so a deployment of N instances let one respondent
spend about N times every submit, autosave, redeem, resume and upload budget.

- **Shared through MJ's Redis.** When MJAPI starts with `REDIS_URL`, MJ installs its
  `RedisLocalStorageProvider`, and Forms keeps its windows there (`forms:ratelimit:<key>` sorted
  sets, one atomic script per charge, each bucket expiring one window after its last hit). Forms
  opens no connection and reads no setting of its own. Without Redis nothing changes.
- **An outage loosens the caps, never removes them.** While Redis is unreachable each instance
  counts on its own, as before, and logs one error per outage.
- **In-flight caps stay per-process** on purpose: they bound one process's sockets and pool.
- **API:** `FormsRateLimiter.charge`, `checkRedeemRateLimit` and `checkUploadRateLimit` now return
  a `Promise`, and `@memberjunction/redis-provider` is a new peer dependency of
  `@mj-biz-apps/forms-core-entities-server`.
