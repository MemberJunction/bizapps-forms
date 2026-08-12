---
'@mj-biz-apps/forms-core-entities-server': minor
'@mj-biz-apps/forms-entities': minor
'@mj-biz-apps/forms-actions': minor
'@mj-biz-apps/forms-server': minor
'@mj-biz-apps/forms-ng': minor
---

Migrate the workspace from npm to pnpm, remove the MJAPI/MJExplorer dev harness, and
settle the MemberJunction graph on a single 6.1.0-edge.2 copy.

Two dependency corrections ship with this and affect consumers:

- `@mj-biz-apps/forms-server` declared `type-graphql` nowhere while importing it in
  `PublicFormResolver` and `graphql-types`. It resolved off a hoisted transitive copy
  under npm, so an installer outside this monorepo had no guarantee of getting it. Now
  declared as a peer at `2.0.0-beta.3`, matching what `@memberjunction/server` ships.
- `UserCache` moved from `@memberjunction/sqlserver-dataprovider` to
  `@memberjunction/generic-database-provider` in MJ #3734, which lands in 6.1.0-edge.2.
  That was `forms-server`'s only sqlserver-dataprovider usage, so the peer swaps over
  entirely rather than being added alongside.
