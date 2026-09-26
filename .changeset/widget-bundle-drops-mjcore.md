---
"@mj-biz-apps/forms-entities": patch
"@mj-biz-apps/forms-ng": patch
---

The respondent widget bundle (`mj-form.js`) is less than half its former size (#245).

**What was wrong.** The widget imported the forms contract from the root of `@mj-biz-apps/forms-entities`, which also loads the generated entity classes. Those register themselves with MemberJunction when loaded, so the bundler had to keep them, and with them MJCore, MJGlobal, the SQL dialect layer, acorn and lodash. None of it is used to show or submit a form, but every anonymous visitor downloaded and parsed it on their phone.

**What changed.** `mj-form.js` drops from 1,320,575 to 611,236 bytes, and from 362,744 to 175,452 bytes gzipped. The widget now imports only the contract, and the widget build fails if any MemberJunction package, acorn, or the generated entity classes end up in the bundle again.

**New subpath export.** `@mj-biz-apps/forms-entities/contracts` exposes the contract (form definition, submission types, rule evaluators, zod schemas) without the entity classes. Use it from browser code. The package root is unchanged for server code.

**Deep imports are closed.** `@mj-biz-apps/forms-entities` now has an `exports` map listing only `.`, `./contracts` and `./package.json`, so an import of a path inside `dist/` no longer resolves. Nothing in this repo did that; if your code does, import from the package root or `/contracts` instead.
