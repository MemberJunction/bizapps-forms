---
"@mj-biz-apps/forms-server": patch
---

Metadata seeding moves to MJ's release-time model, and the check that policed the old cadence is gone.

The distribution gate's CHECK 1 compared `metadata/` against a checked-in hash manifest and inferred *"the shipped seed contains this record"* from **the presence of a manifest key**. That inference is a silent pass in one direction. Remove a key and it correctly goes red; **add** one — or regenerate the manifest — without regenerating the seed and it goes **green while the record ships nowhere**. `bizapps-sales` hit exactly that: a manifest entry added in one commit, the only seed migration last touched many commits earlier, every step reporting success. Reproduced here at `dc891fd`: a new metadata directory plus `npm run seed:manifest` left the gate green while the record appeared in no migration. The script predicted its own failure, in the comment above `METADATA_IGNORED_FILES` — "teaches people that regenerating the manifest is how you make it quiet, which is precisely the habit that would let a real drift through".

The cadence it enforced — one `Metadata_Sync` per feature PR, six of them here, four inside `v0.11.x` — is the one MJ rules out (`MJ/metadata/CLAUDE.md` §1b and §10): PRs contribute declarative JSON only, and the build engineer generates **one consolidated sync migration per release** against a clean database. MJ itself has no manifest at all.

So: **PRs now carry JSON only** — fields, `@lookup`/`@file`/`@parent`, a `uuidgen` `primaryKey`, no `sync` block, no hand-authored `*__Metadata_Sync.sql`. The manifest, `scripts/write-seed-manifest.mjs`, the `seed:manifest` script and CHECK 1 are removed, along with six spec cases, six mutants, and the copy of the whole `metadata/` tree the spec made into every one of its fixtures.

What replaces the proxy is a check on the property: `npm run check:release-seed` walks every `primaryKey` UUID under `metadata/` and reports the ones that appear in no shipped `migrations/*.sql`. No database, no dependencies, and it reproduces the "what does the next seed owe" list from the repo instead of asking anyone to maintain one. It runs as **release readiness** — in `publish.yml`, before anything is published or tagged — and deliberately not on PRs, where the question has no answer. It refuses to report success if it collected no IDs at all, because "I examined nothing" and "everything is fine" were the same green last time.

**CHECKS 2–5 are untouched.** They read the shipped SQL directly for unresolvable placeholders, a post-hardening seed re-granting the `Form Respondent` role unfiltered access, a core-metadata insert guarded on its own ID alone, and a schema sync reaching a schema this app does not own. They test properties rather than proxies, and nothing here affects them.

No migration ships with this change, and none of the six existing `Metadata_Sync` files is rewritten — they are applied on hosts, and migrations are append-only history. This changes the cadence going forward; the next one is the first consolidated release seed.
