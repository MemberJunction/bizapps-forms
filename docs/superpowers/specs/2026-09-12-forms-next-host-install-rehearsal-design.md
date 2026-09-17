# Rehearsing a host install of `next`, before `main` publishes it

**Date:** 2026-09-12 · **Status:** executed — see [Outcome](#outcome)

*A record of the design as it stood on that date; the counts below describe `next` at the time.*

## Why this exists

`main` is about to be upgraded, which publishes `@mj-biz-apps/forms-*` to npm and tags the
release. Once that happens every host that runs `mj app install` gets whatever `next` contains.
Nothing in CI installs Forms into a host — the unit suite, the gates and the smoke scripts all
run against this repo's own harness and the shared dev database. The defect class that survives
all of them is the one that only appears on a database built from **only what the repo ships**.

This rehearsal builds that host and drives it to a submitted response.

## The constraint that shapes everything

`mj app install` is release-only:

- the manifest is fetched at a git **tag** (`ResolveRef` → `v${version}`; no `--version` means
  `HEAD` of the **default branch**, which for this repo is `next` — so a bare install would take
  unreleased integration work, which is the opposite of what a release rehearsal wants);
- `DownloadMigrations(manifest.repository, manifest.version, …)` fetches `migrations/*.sql` at
  ref `v${manifest.version}` — from `manifest.repository`, *not* from the source URL that was
  passed on the command line;
- npm packages install at the manifest version, `exact` when `--version` was given.

There is no branch-install mode. `next` is 617 commits and 68 changesets ahead of `main`, its
manifest still reads `0.10.0`, and no tag or npm version exists for the upcoming release.

So the rehearsal manufactures a **disposable release**: `0.11.0-rc.1` (pending changesets bump
minor from 0.10.0 → 0.11.0), published to a **local Verdaccio** registry and tagged
`v0.11.0-rc.1` on the org repo. Nothing reaches public npm. The tag is deleted afterwards and,
being a prerelease, cannot collide with the real `v0.11.0`.

## Phases

**A — artifact.** A clone *outside* `~/Projects/mj-dev`, so a version bump never perturbs the
shared pnpm store or anyone's running host. `pnpm run version`, retag to `0.11.0-rc.1` across the
five `package.json` files, their internal exact pins and `mj-app.json`. Build, test, publish five
tarballs to Verdaccio on `:4873` (which proxies npmjs, so the sibling apps and all
`@memberjunction/*` still resolve). Push the tag.

**B — host.** `mj install -t v6.1.0-edge.6` into `~/Projects/mj-host-test` — the **distribution**
layout (`apps/MJAPI`, `apps/MJExplorer`), which is what a customer gets and the layout the engine
historically broke on (MJ#3270). Host API `:4400`, host Explorer `:4200` (the MSAL redirect
already registered). Database created **sa-owned** on `sql-mj-it:1455` first; created as
`MJ_Connect` it makes that login `dbo` and MJ's core baseline dies at batch 12/13083 on an error
that names nothing relevant.

Four host edits made **before** any app install, because the installer cannot be trusted to make
them: `openApps.serverPackagePath`/`clientPackagePath`; the four `__mj_BizApps*` schemas added to
`excludeSchemas`; `dynamicPackages` server + client entries in **both** the root and
`apps/MJAPI` config; `--open-app-client-bootstrap` on the Explorer manifest prebuild.

Forms needs **no** `migrationPlaceholders` — its shipped SQL uses only `${flyway:defaultSchema}`
and `${mjSchema}`; the single `${flyway:timestamp}` sits inside a comment and is masked by the
distribution gate. (Caliber needs `commonSchema`; Forms does not. Verified, not assumed.)

Host B is a copy of the scaffold taken *before* any install, pointed at a second database and
`:4401`, with no Explorer — so phase D costs minutes rather than a second `mj install`.

**C — install + gauntlet.** One `mj app install … --version 0.11.0-rc.1
--dangerously-ignore-dbl-underscore-schema-rule` resolves and installs `common → tasks → forms`.
Then nine checks, **none of which produces an error when it fails**:

1. the config writer anchors on the first comment-blind `module.exports = {`, so a section it has
   to *create* can land inside a comment block and be inert — re-read both config files by hand;
2. a `dynamicPackages` server entry that cannot be imported is `console.warn`ed and the boot
   continues, so "the server started" proves nothing — hit a real Forms GraphQL operation;
3. a missing client bootstrap is invisible: the Explorer build is green and the dashboards are
   simply absent — verify the namespace import and the class registrations in the generated file;
4. any `__mj.ApplicationRole` row hides the app from every role not listed, and the client trusts
   the metadata bundle MJAPI builds once at startup, so a row insert needs an MJAPI restart;
5. `SELECT Name FROM __mj.Entity WHERE SchemaName='__mj_BizAppsForms' AND Name NOT LIKE
   'MJ_BizApps_Forms: %'` must return zero rows — the class factory resolves by entity name and
   binds nothing at all when they disagree;
6. when `__mj` and the app schemas have different owners, ownership chaining stops and the
   denial names an object nobody associates with Forms — derive the object list from the catalog
   views, as a principal that actually holds `VIEW DEFINITION` (without it those views read as
   zero rows, silently, and a broken host looks healthy);
7. **every column a migration shipped has a matching `__mj.EntityField` row.**
   `spUpdateExistingEntityFieldsFromSchema` updates existing rows and creates none, so a column
   with no shipped `INSERT INTO EntityField` exists in the table while `BaseEntity.Set` on it is
   a silent no-op (issue #201, and `V202609091600` shipped exactly this);
8. the metadata seed landed — `Form Respondent` role, `CanCreate` on the response entities,
   application, dashboards, styles, categories, AI prompt;
9. `/f/:slug` is served by the **host's MJAPI**, with `MJAPI_PUBLIC_URL` correct — it is read at
   import time, so a late assignment is silently ignored and the host page leaks the wrong origin.

**D — upgrade.** Host B installs published `v0.10.0`, then `mj app upgrade` to `0.11.0-rc.1`.
This is the path every existing host takes and it exercises a different migration population: a
past fix repaired fresh installs while still killing hosts that already held rows.

**E — browser.** Explorer login → Forms app present, dashboards render → build a form in the
builder → publish → distribution link with captcha off → a **fresh browser context** →
`/f/<slug>` → fill → submit → confirm the `FormResponse` and its answers **in the host database**,
not on the screen. Layout claims measured from the DOM; this machine reports DPR 0.5 and
screenshots lie about size.

Then `mj app remove mj-bizapps-forms` — schema dropped, `__mj` rows retired through
`migrations-teardown/`, sibling apps untouched.

**F — issues.** A `blocker` label is created on `MemberJunction/bizapps-forms`. Findings are
filed by parallel subagents, each carrying evidence and a reproduction from this run. A finding
that matches an open issue gets a comment plus the label rather than a duplicate. A defect in MJ
itself is filed upstream on `MemberJunction/MJ` with a short cross-linked tracking issue here.

## Acceptance

The rehearsal passes when a host built from only what the repo ships can be installed with one
command, boots clean, shows Forms in Explorer, and accepts a response that is visible in its own
database — and when the upgrade path from `0.10.0` reaches the same state.

## Outcome

The rehearsal found the defect it was built to find, in phase C. `packages/Angular` declared
`@angular/cdk` as an **exact** peer, so `npm install` on a host carrying any other CDK patch died
with `ERESOLVE`, and `mj app install` finished its database work, exited 0, and finalized Forms as
`Disabled` while telling the operator to fix their npm auth. Filed as
[#211](https://github.com/MemberJunction/bizapps-forms/issues/211) and fixed in
[#214](https://github.com/MemberJunction/bizapps-forms/pull/214), which also adds a
`lint:peer-ranges` CI gate so an exact peer cannot ship again — the class was invisible to every
check here because this package anchors the same version in `devDependencies`, which satisfies the
exact peer and a caret equally.

That confirms the premise in "Why this exists": the defect appeared only on a host built from what
the repo ships, and nothing in CI, the unit suite or the smoke scripts could have reached it.

The wider hazard the same review surfaced — the `@memberjunction/*` peers are carets anchored to a
prerelease, so they stop matching the moment MJ's edge line moves off `6.1.0` — is deferred to
[#215](https://github.com/MemberJunction/bizapps-forms/issues/215). It needs a host on a newer MJ
line to demonstrate rather than assert, which arrives at the next upgrade.

## Cleanup

Delete the rc tag, stop Verdaccio, drop both databases, remove the host directories and the
rehearsal clone. Deliverables kept: the filed issues and an HTML report under
`review-next-host-install/`.
