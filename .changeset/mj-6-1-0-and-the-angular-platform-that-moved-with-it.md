---
"@mj-biz-apps/forms-ng": patch
---

MJ is pinned at `6.1.0` GA, and the Angular platform moved with it.

`6.1.0` is a real release on the `lts-6.1` dist-tag, not another `-edge.N`; 55 `@memberjunction/*` pins across seven manifests and `mj-app.json`'s range move together, and `pnpm-lock.yaml` is regenerated so CI's `pnpm install --frozen-lockfile` has something to agree with — it held 3,159 `edge.5` references and would have failed the build before compiling a line.

**The Angular rev is not cosmetic and not optional.** MJ 6.1.0's `ng-*` packages raised their peer floor to `^21.2.22`, which `21.1.3` cannot satisfy, so the install began reporting `unmet peer @angular/cdk@^21.2.14`. Three version lines move, and they are not the same number: the core family to `21.2.22`, `@angular/cdk` to `21.2.14`, and the build tooling to `21.2.23` — matching MJ 6.1.0 exactly. Collapsing them into one number is what #211 was.

**The pin that actually binds is `pnpm.overrides`, not the `devDependencies` anchor.** Bumping only the anchor left the regenerated lockfile still resolving `@angular/core@21.1.3` while `@angular/cdk` moved on its own — and CDK moved only because it is the one package the override list omits. Overrides and anchors have to move together; the lockfile now holds zero `21.1.3` references.

No migration ships with this. CodeGen run against a clean room built from only what the repos ship emits **no** `CREATE OR ALTER VIEW` or `PROCEDURE` for `__mj_BizAppsForms` under 6.1.0, and converges on a second run — so the regenerated-SQL question the upgrade runbook asks is answered, and answered negative. The unshipped-metadata defects that same run surfaced are pre-existing and tracked separately (#201, #219, #220).
