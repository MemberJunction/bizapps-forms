---
"@mj-biz-apps/forms-core-entities-server": patch
---

The two DW9 concurrency tests in `FormSubmissionEngine.integration.spec.ts` now pass on a login that is only `db_owner` of the test database (#339). They used to poll `sys.dm_exec_requests` for the second save's lock wait, which a login without `VIEW SERVER STATE` cannot see, so both always timed out on the pipeline's sandbox login. They now order the two saves from inside the engine with a new optional `beforeCommit` test seam on `SaveResponse`, awaited after the read-time checks and before the transaction. This also makes the DW9 test prove what its name claims: the second save passes the quota pre-check and is refused by the conditional UPDATE. Production passes no seam, and the save issues the same SQL as before.
