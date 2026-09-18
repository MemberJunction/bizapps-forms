---
'@mj-biz-apps/forms-core-entities-server': patch
'@mj-biz-apps/forms-entities': patch
'@mj-biz-apps/forms-actions': patch
'@mj-biz-apps/forms-server': patch
'@mj-biz-apps/forms-ng': patch
---

Widen the MemberJunction compatibility range so Edge and 6.1.0 hosts can install MJ Forms.

The `^6.1.1` peer range admitted no prerelease build at all — semver only accepts a
prerelease when a comparator shares its exact major.minor.patch and carries a prerelease
tag. A `6.1.0-edge.6` host therefore failed with ERESOLVE, which `mj app install` reports
as an npm auth problem before finalizing the app as Disabled (#211). Plain `6.1.0` hosts
were locked out too.

Peers move to `^6.1.0-edge.6` and `mjVersionRange` to `>=6.1.0 <7.0.0`. This is a strict
widening: every host that could install before still can, plus 6.1.0 and Edge builds from
6.1.0-edge.6 onward. The era boundary is unchanged — MJ's installer coerces a prerelease host to its base
tuple, so a 7.0.0-edge.0 host still correctly fails the `<7.0.0` cap.
