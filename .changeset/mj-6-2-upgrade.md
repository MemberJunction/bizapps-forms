---
"@mj-biz-apps/forms-entities": patch
"@mj-biz-apps/forms-core-entities-server": patch
"@mj-biz-apps/forms-actions": patch
"@mj-biz-apps/forms-server": patch
"@mj-biz-apps/forms-ng": patch
---

**Requires MemberJunction 6.2 or later.** Upgrade the host to MJ 6.2.0 (including its core
migrations, `mj migrate -t v6.2.0`) before you install or upgrade to this release. The MJ peer
range of every package and `mj-app.json`'s `mjVersionRange` now start at `6.2.0-edge.8`, so a 6.1
host is refused. bizapps-common and bizapps-tasks still declare `^6.1.6`, which admits 6.2.0 but
not a `6.2.0-edge.N` preview host, so use the 6.2.0 release.

- The Forms section on a Person record now claims only the `RespondentPersonID` relationship, and
  MJ's duplicate "Form Responses" grid no longer appears beside it (#349; needs MJ#4990's fix,
  which only 6.2 has).
- `mj app install` and `mj app upgrade` now print the exact `magicLink` config block at the end of
  the install when the host has not enabled it. Without it every public link answers 409. The check
  only prints; it never changes host config or fails the install.
- The form-quota and partial-response counts refuse (fail closed) if a count comes back without a
  total, which MJ 6.2's types now allow.
