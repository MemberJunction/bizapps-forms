---
"@mj-biz-apps/forms-server": minor
---

Adds the v0.14.0 consolidated metadata seed, `V202609291952__v0.14.x__Metadata_Sync.sql`. It changes nothing on a host: the only record `metadata/` gained since v0.13.1 is the three `Forms Automation Runner` grants of #269, and `V202609280149` already ships those under the same ids. A push against a database built from the shipped chain found no difference for any of them. The file carries the one statement the push emits, a rewrite of the All Forms view with its existing values, which every earlier seed also carries. It exists so the release ships the seed that `check:seed-cadence` requires whenever `metadata/` moves.
