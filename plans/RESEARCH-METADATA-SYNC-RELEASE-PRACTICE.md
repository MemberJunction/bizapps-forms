# Research: when the sibling repos create `Metadata_Sync` migrations — and whether that cadence resolves #41

**Question** (Soham, 2026-08-13): MJ, bizapps-common, and bizapps-caliber create `Metadata_Sync`
at release time — when the builder is upgrading `main` and publishing packages — not per feature.
Does adopting that model resolve
[#41](https://github.com/MemberJunction/bizapps-forms/issues/41)?

**Verdict: no — it shrinks the hazard and would dissolve one of #41's two loose ends, but it
cannot resolve the issue, because #41's core complaint is "nothing verifies the invariant" and the
release-time model is *documented by its own practitioners as unverified*. The gate remains the
fix under either cadence. Adopting the release-time model is also a larger change for Forms than
it looks: our own distribution gate currently *forces* the per-feature loop.**

Sources: read directly from the sibling repos in the workspace parent (`..`) on 2026-08-13 by three
parallel research agents (MJ, bizapps-common, bizapps-caliber) plus direct inspection of this
repo. Citations are file paths and commit hashes in those repos.

---

## 1. What each repo actually does

### MJ (the reference implementation — and the only one with the full model)

- **Policy, written down**: `metadata/CLAUDE.md` §1b and `migrations/CLAUDE.md` rule 1b — feature
  PRs ship *only* declarative JSON under `metadata/`; hand-authoring per-PR `Metadata_Sync`
  migrations is forbidden. At release-prep the build engineer runs `mj sync push` against a fresh
  DB migrated to the last released version, producing **one consolidated migration per release**.
- **Cadence, observed**: ~90 `Metadata_Sync` files, one per minor version (`v5.46.x` … `v6.1.x`).
  Ten of ten recent files were committed on `release/vX.Y-prep` branches 0–1 days before the
  `RELEASING:` publish commit (e.g. `9f495f529a` → v5.51, `8d5fefe2ff` → v5.50, both authored by
  sohamdesai-BlueCypress; commit bodies name `DEPLOYMENT.md` Step 3 and the `sql_logging` capture
  they were copied from).
- **Shape: incremental delta, not full regeneration.** The v5.51 sync carries 6 creates + 1
  update against ~13,881 managed records ("13,590 records unchanged" per the commit body);
  deletes appear in other syncs (60 in `V202608051834`). The delta is computed by checksum
  against a fresh DB **at the last released version** — i.e. a DB that has run every shipped
  migration.
- **Verification: none, admitted in writing.** `DEPLOYMENT.md:16`: "Nothing downstream re-checks
  this list — CI going green says nothing about whether Steps 0–8 were run, and **Step 3 in
  particular has no automated detection at all**." CI validates naming/timestamps and replays
  metadata against an ephemeral DB (`integration.yml`), but nothing generates a seed and nothing
  content-checks one.

### bizapps-common

- **One** shipped seed in ~6 months and 12 tags: `V202605141122__v5.29.x__Metadata_Sync.sql`,
  created in an explicit release-prep commit (`1cf4bc4`, "v5.29 release prep …", branch
  `fix-migration-version-and-add-metadata-sync`, changeset authored 78 minutes later). Generated
  locally by a human via `mj sync push` (the file header and commit body both say so; the
  embedded session fingerprint matches the `metadata/` writeback in the same commit).
- Releases v5.30–v5.33.1 shipped **no** new seed because `metadata/` never changed — the trigger
  is "metadata changed", staged into release-prep, not an unconditional per-release step.
- **Shape: full regeneration** (record counts in the seed exactly equal the records in
  `metadata/`; zero idempotency guards; the v5.29 regeneration deleted the prior file and wrote a
  fresh one).
- **Verification: none.** No seed-content gate exists; CI checks filenames/timestamps/changesets
  only. The cadence itself is undocumented — it lives in commit messages, including `8aea130`:
  "every MJ release ends with `Metadata_Sync` as the final migration."

### bizapps-caliber

- **One** seed ever: `V202608080100__v1.0.x__Metadata_Sync.sql` (133 records, create-only, every
  record guarded by `IF NOT EXISTS`), generated locally from a clean-canary push and
  post-processed by `scripts/generate-metadata-sync.mjs` (an allowlist/fail-closed generator).
  Landed ~2.5 h before the v5.5.0 cut in PR #175 (`199dc10`, rewritten in `1befc40`).
- **The cautionary data point**: the documented release step was then *missed in practice* —
  v6.0.0 (2026-08-13) shipped with **36 commits touching `metadata/` and no regenerated seed**.
  `DEPLOYMENT.md` warns about exactly this: "§2 in particular has **no automated detection at
  all** — a pending `metadata/` change that never became a migration is invisible to every gate
  in the repo," and the release checklist says "**nothing detects this for you**."
- Caliber does have the family's strongest *content* checks (`smoke/config/metadata-ships.test.mjs`
  etc. — offline assertions that shipped SQL matches authored metadata), but nothing that detects
  a pending-but-unshipped metadata change.

### bizapps-forms (this repo, for contrast)

- The seed (`V202608081700`) was created in a **feature** commit (`3ec0833`,
  "feat(distribution): ship the metadata seed", 2026-08-08); v0.8.0 was tagged hours later.
  `publish.yml` publishes on push to `main`; nothing in CI generates a seed
  (`migrations/README.md` says this is deliberate).
- **Forms is the only repo in the family with a currency gate**: `scripts/check-distribution-seed.mjs`
  CHECK 1 hashes `metadata/` against `migrations/metadata-seed.manifest.json` and fails
  `lint:distribution` (run on every push and PR via `distribution-gate.yml`) the moment they
  drift. **This gate is what forces the per-feature loop** — a PR that edits `metadata/` without
  regenerating the seed cannot go green.

---

## 2. Does the release-time cadence resolve #41?

#41 has two loose ends. The cadence touches them very differently.

### Loose end 1 — "regeneration against a DB missing the 7F0E000x filter records cannot succeed"

**MJ's delta variant genuinely dissolves this.** The delta push runs against a fresh DB migrated
to the last released version — a DB in which `V202608131600__Respondent_Grant_Hardening.sql` has
already run, so the three RLS filter records **exist** and the `@lookup` references resolve. No
teardown, no manual re-create step, no empty-metadata database. The README's documented-step
mitigation stops being needed because the situation it mitigates stops occurring.

(Note this is a property of the **delta** model specifically. The full-regeneration model that
common and caliber use — and that Forms' own README documents — still needs the empty-metadata
DB and therefore still needs the manual filter re-create step.)

A second real effect: per-feature regenerations stop happening at all, so the trap gets far
fewer chances to spring, and the person holding it is a build engineer following a runbook
rather than whoever happens to touch `metadata/` next.

### Loose end 2 — "nothing verifies the invariant"

**Unchanged, and this is the core of #41.** The release-time model as practiced is
human-executed and explicitly unverified — MJ: "no automated detection at all"; caliber:
"nothing detects this for you", and empirically shipped v6.0.0 in violation of its own step.
A rarer, better-staffed regeneration is still a regeneration that can emit the wrong state
silently if `metadata/` was edited back to the unfiltered shape — the exact case #41 says the
gate exists to catch. Adopting a model whose own documentation admits it is unverified cannot
resolve an issue whose complaint is the absence of verification.

The gate is **orthogonal to cadence and cheap under any of them**: a text check over shipped
`*Metadata_Sync*.sql` runs in CI identically whether the file was generated per-feature or at
release. One adjustment if the delta model is adopted: a delta emits `spUpdateEntityPermission`
for changed existing grants, so the gate must cover update-shaped calls (and parameter omission),
not only `spCreateEntityPermission … _Clear = 1` as #41's minimal sketch has it.

### The adoption cost #41 never had to consider

Forms cannot simply adopt "metadata edits accumulate until release": **CHECK 1 of
`check-distribution-seed.mjs` fails the build on exactly that accumulation.** Moving to the MJ
model means redesigning the distribution gate — e.g. tolerate drift on `next`, enforce currency
at release — which trades Forms' current "the build won't let you forget" property for the
siblings' "a human must remember at release" gap, the one caliber has already demonstrably
fallen into. That is a real design decision with its own trade-offs, bigger than #41, and it
belongs in its own issue if pursued.

---

## 3. Bottom line

| | Per-feature (Forms today) | Release-time delta (MJ model) |
|---|---|---|
| Loose end 1 (filter records absent at regen) | Mitigated by documented manual step | **Dissolved** (DB at last release already has them) |
| Loose end 2 (no invariant verification) | Open — the gate is the fix | Open — the gate is still the fix (extended to `spUpdate*`) |
| Forgotten-seed risk | **Impossible** (CHECK 1 fails CI) | Real and observed (caliber v6.0.0) |
| Regeneration frequency / exposure | Every metadata change | Once per release with metadata changes |

- The release-time model **reframes and narrows** #41's hazard; it does not resolve it. #41
  should stay open, and its fix — the gate — is the same size either way.
- If the MJ delta model is attractive (and loose-end-1-wise it is), that is a separate,
  larger decision: it requires redesigning CHECK 1's enforcement point and adopting MJ's
  delta-generation runbook. Worth its own issue; not a substitute for the gate.
