---
"@mj-biz-apps/forms-entities": patch
---

Add a host-truth convergence check: build a database from only the migrations this repo ships, run
CodeGen against it, and fail if CodeGen wants to change anything. Every existing gate reads the
repository; this one reads the artefact, which is why #201 and #219 both reached every host. Runs
nightly and on pull requests that touch the migration inputs. Ships no migration and no metadata.
