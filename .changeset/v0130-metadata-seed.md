---
"@mj-biz-apps/forms-server": minor
---

Adds the v0.13.0 consolidated metadata seed, `V202609262310__v0.13.x__Metadata_Sync.sql`. It changes nothing on a host: the only record `metadata/` gained since v0.12.0 is the seven `Forms Automation Runner` grants of #239, and `V202609251200` already ships those under the same ids. A push against a database built from the shipped chain found no difference for any of them. The file carries the one statement the push emits, a rewrite of the All Forms view with its existing values, which every earlier seed also carries. It exists so the release ships the seed that `check:seed-cadence` requires whenever `metadata/` moves.
