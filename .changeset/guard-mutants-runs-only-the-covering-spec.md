---
"@mj-biz-apps/forms-entities": patch
---

`build-and-test` ran for 15 minutes; 85% of it was the guard-mutation gate, and two thirds of the
whole job was one number: `packages/Server`'s suite costs 37.5s on a CI runner and the gate ran it
16 times. Almost none of that was testing — Server's 996 tests take 800ms and the rest is vitest
collecting 78 spec files, of which one or two can observe an edit to one source file. Every mutant
now declares the spec file(s) it is killed by and runs only those, as does each suite's baseline.
Measured on one machine, the gate goes 205s to 67s with all 35 guards still KILLED by the same
tests. Ships no migration and no metadata, so patch.
