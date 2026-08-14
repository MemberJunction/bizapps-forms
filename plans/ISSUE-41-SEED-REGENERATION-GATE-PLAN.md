# Issue #41 — Seed-regeneration gate, and the delta-first regeneration path

**Issue:** [MemberJunction/bizapps-forms#41](https://github.com/MemberJunction/bizapps-forms/issues/41)
**Status:** PLANNED (no implementation yet)
**Planned:** 2026-08-13 · **Planning agent:** this PR's author
**Supporting research:** [`plans/RESEARCH-METADATA-SYNC-RELEASE-PRACTICE.md`](RESEARCH-METADATA-SYNC-RELEASE-PRACTICE.md)
(how MJ / bizapps-common / bizapps-caliber create their seeds, and why the release-time cadence
alone does not resolve #41) · **Predecessor:** [`plans/ISSUE-39-RESPONDENT-SEED-HARDENING-PLAN.md`](ISSUE-39-RESPONDENT-SEED-HARDENING-PLAN.md)

**One sentence:** make the build refuse any shipped metadata seed that re-grants the anonymous
`Form Respondent` role unfiltered access, and make the routine regeneration path one that cannot
produce that seed by accident.

---

## 1. Verification — #41 confirmed, and two corrections to its suggested fix

#41's hazard is real and was re-verified against the working tree: `migrations/README.md`'s loop
regenerates the seed whenever `metadata/` changes; a regenerated `*Metadata_Sync*.sql` necessarily
sorts after `V202608131600__v0.10.x__Respondent_Grant_Hardening.sql`, so on a fresh install its
permission state wins; and nothing today checks that state. But #41's suggested check — "fail if
any `spCreateEntityPermission` for Form Respondent passes `@CreateRLSFilterID_Clear = 1` or
`@ReadRLSFilterID_Clear = 1`" — is wrong in two ways that this plan corrects:

**Correction 1 — the invariant only holds after a watershed.** The shipped seed
`V202608081700__v0.8.x__Metadata_Sync.sql` *legitimately* carries unfiltered `Form Respondent`
creates — its own header says so ("WHAT THIS FILE STILL SHIPS THAT IS WRONG, AND WHERE IT IS
FIXED") — because `V202608131600` corrects them afterward via `UPDATE`. A gate that scans *every*
seed fails today's healthy repo. The invariant is: **any seed sorting after `202608131600` must
carry filtered grants**, because it lands after the correction and its state is final.

**Correction 2 — the delta shape expresses the regression as an UPDATE.** The repo's own README
already prefers shipping a later seed "containing just that change's records" (as bizapps-tasks
does), and this plan makes that the default path (D5). A delta generated against a
migrated-to-head database emits `spUpdateEntityPermission` for changed existing grants — so a
check that only inspects `spCreateEntityPermission` misses precisely the shape the recommended
workflow produces. The gate must cover create-shaped and update-shaped calls, and parameter
*omission* as well as explicit `_Clear` flags.

Facts the design below relies on (verified in this repo, 2026-08-13):

- The four surviving grants and their filters, from `V202608131600` lines 178–181:
  Form Responses (Create) and Form Response Answers (Create) → `7F0E0001-…001`;
  Form Distributions (Read) → `7F0E0002-…002`; Form Versions (Read) → `7F0E0003-…003`.
- In shipped seed SQL, `@RoleID` binds via a per-record variable assigned
  `(SELECT ID FROM [${mjSchema}].[Role] WHERE Name = N'Form Respondent')` (post-#39 by-name
  resolution, `V202608081700:2872`), and `@EntityID` binds to a **literal UUID**
  (`V202608081700:2870`). A future regeneration may instead emit the role id as a literal
  (`A18E13FC-B2C1-4E77-A3D7-EE775BDE098C`, the Forms-minted id). The parser must handle both.
- The CI gate runs with **no `npm ci`** (`distribution-gate.yml`: "the gate is Node stdlib only,
  deliberately"). CHECK 3 therefore adds no dependencies, and its tests go in the spec file the
  workflow already executes (`node scripts/check-distribution-seed.spec.mjs`).
- `migrations-pg/` currently ships **no** seed; the gate scans it anyway so the first PG seed is
  born covered.
- `V202608131600` already THROWs on unfiltered grants **at its own point in the chain** — that
  protection cannot see anything that runs after it, which is exactly the gap the gate fills.

## 2. Design decisions

### D1 — Watershed gate, not whole-history gate

CHECK 3 applies only to `*Metadata_Sync*.sql` files whose leading `V<YYYYMMDDHHMM>` timestamp is
**greater than `202608131600`** (a named constant, e.g. `RESPONDENT_HARDENING_WATERSHED`, with a
comment explaining that earlier seeds are corrected by the hardening migration and later ones are
final). This is what lets the gate assert a security invariant without failing the current tree,
and it needs no simulation of the migration chain. Files are compared by the timestamp embedded in
the filename — the same ordering Skyway uses.

### D2 — Positive assertion over both call shapes, plus the never-a-writer rule

For **every** `spCreateEntityPermission` or `spUpdateEntityPermission` call bound to the
`Form Respondent` role in a post-watershed seed (any entity, not just the four known ones —
tomorrow's new grant must be born filtered too):

1. If the call grants `CanCreate` → it must carry a non-NULL `@CreateRLSFilterID`
   (a `_Clear` flag on that column, or the parameter's absence, is a violation).
2. If the call grants `CanRead` → same rule for `@ReadRLSFilterID`.
3. If the call grants `CanUpdate` or `CanDelete` → violation outright. The domain rule
   (#39, encoded in the `7F0E0001` filter's description) is that the respondent role is a gate,
   never a writer; the sole deliberate exception is the filtered `CanCreate` flag. There is no
   legitimate update or delete grant for this role, filtered or not.
4. If a **literal** filter UUID is present for one of the four known (entity, action) pairs, it
   must be the expected `7F0E000x` id — pointing a guarded grant at some other filter is a
   violation even though it is non-NULL. (A by-name subselect is acceptable; the primary rule is
   non-NULL/non-cleared.)

Rules 1–2 are the positive form of #41's check and subsume it. Rule 3 catches a regression class
#41 never mentions. Rule 4 costs three string comparisons.

### D3 — Role and entity identification is per-call variable tracing, stdlib only

A permission call belongs to `Form Respondent` when its `@RoleID` argument resolves — through the
call's own `DECLARE`/`SET` bindings, a literal, or an inline subselect — to the name
`'Form Respondent'` or the literal id `A18E13FC-B2C1-4E77-A3D7-EE775BDE098C`. Entity identity for
rule D2.4 resolves the same way (literal UUID or by-name subselect); the four guarded entity UUIDs
are declared as named constants sourced from the shipped seed (the implementer captures them with
`grep`, and a spec case asserts the shipped seed's guarded creates use exactly those ids, so a
drifted constant fails loudly rather than silently matching nothing).

The parsing approach — split the SQL into per-record blocks, classify each block, then inspect
arguments — is the pattern bizapps-caliber's `smoke/config/metadata-ships.test.mjs` and
`scripts/generate-metadata-sync.mjs` already prove out. Port the *pattern*, not the code: this
repo's constraint is Node stdlib only, no imports beyond `node:` builtins, same as the existing
CHECK 1/CHECK 2. No SQL parser dependency.

### D4 — Home: CHECK 3 in `check-distribution-seed.mjs`, scanning `migrations/` and `migrations-pg/`

The script already owns "would this install correctly on a stranger's database", already has the
`violations`/`runChecks` structure, a spec file, and CI wiring whose path filters already cover
it. A sibling script would duplicate all four. The scan covers `migrations-pg/` so a future PG
seed is checked from birth; today that directory contributes nothing and costs one `readdir`.

### D5 — The delta becomes the documented default; the empty-DB full regen becomes break-glass

`migrations/README.md`'s "Regenerating the metadata seed" section is rewritten so the **default**
loop for a `metadata/` change is: fresh database → run the full migration chain to head (core +
bizapps-common + bizapps-tasks + Forms, install order) → `mj sync push --dir metadata` → the log
contains only the delta (`spCreate*` for new records, `spUpdate*` for changed ones) → apply the
two documented schema substitutions → ship as a **new** `V<stamp>__v<ver>__Metadata_Sync.sql` →
`npm run seed:manifest`. Against a migrated-to-head database the three `7F0E000x` filter records
already exist, so the `@lookup` references resolve and the teardown / manual re-create / "empty
metadata" ritual is simply not part of the routine path — #41's loose end 1 dissolves for the
normal case rather than being mitigated by prose.

The full regeneration (teardown, filter re-create, every-record replay) moves to a clearly marked
break-glass appendix, keeping its existing warnings verbatim — it is still the only way to rebuild
the seed from nothing, and post-watershed its output must now satisfy CHECK 3, which is the gate
doing its job. The README also records the cadence decision from the research note: Forms stays
per-feature (CHECK 1 makes forgetting impossible); revisit release-time consolidation à la MJ only
if delta files start accumulating noisily per release, and then adopt it *with* its enforcement
redesign, never without.

### D6 — Upstream MJ ask is drafted here, filed by the repo owner

The root coupling (RLS filter records cannot live in `metadata/` because no role holds Create on
`MJ: Row Level Security Filters`) is MJ's to fix. Appendix A of this plan is the issue text, ready
to file against MemberJunction/MJ. Filing it is an outward-facing action on another project's
tracker — the repo owner files it (or explicitly asks the agent to), and the implementation PR
links it once it exists. Not a blocker for anything in this plan.

### D7 — What the gate deliberately does not inspect

Hand-authored (non-`Metadata_Sync`) migrations are out of the gate's scope: they are written and
reviewed by humans, `V202608131600` itself THROWs on unfiltered state at migrate time, and
widening a text gate to all SQL invites false positives that teach people to silence it — the
existing gate's comments warn exactly against training that habit. The gate polices the one file
class that is machine-generated, timestamp-wins, and historically shipped unreviewed.

## 3. File-level changes

| # | File | Change |
|---|---|---|
| 1 | `scripts/check-distribution-seed.mjs` | Add `checkRespondentGrants(repoRoot, violations)` (CHECK 3) wired into `runChecks`; constants `RESPONDENT_HARDENING_WATERSHED`, role name/id, guarded (entity-UUID, action, filter-UUID) table with a comment naming its source (`V202608131600:178-181`); block-split/classify/trace helpers per D3. Header comment gains a CHECK 3 paragraph in the style of CHECKs 1–2 (what broke, why text-level, why watershed). Violation messages must say the file, the entity, the rule broken, and the remedy — matching the existing messages' "what would go wrong on someone else's database" voice. Stdlib only; read-only; no `--fix`. |
| 2 | `scripts/check-distribution-seed.spec.mjs` | New CHECK 3 cases, fixture-driven (inline SQL strings or temp dirs, matching the spec's existing style): **must fail** — post-watershed seed with `_Clear = 1` on a guarded column; with the filter parameter omitted on a `CanCreate` grant; update-shaped clear (`spUpdateEntityPermission`); a new unfiltered `Form Respondent` grant on an entity outside the four; a `CanUpdate = 1` grant; a guarded pair pointing at a wrong literal filter id. **Must pass** — the real repo (current seed pre-watershed, untouched); a post-watershed delta carrying correctly filtered grants; a post-watershed seed with no `Form Respondent` content at all. Plus the constants self-check from D3. |
| 3 | `migrations/README.md` | Rewrite "Regenerating the metadata seed" per D5: delta-first default recipe; full regen demoted to a break-glass appendix keeping the `7F0E000x` re-create warning; a line pointing at CHECK 3 as the enforcement; the cadence-decision note. The "three kinds of file" table's regenerate-when column updated to name the delta as the normal vehicle. |
| 4 | `plans/ISSUE-41-SEED-REGENERATION-GATE-PLAN.md` | This document (lands with the plan PR; status updated as work proceeds). |
| 5 | `plans/RESEARCH-METADATA-SYNC-RELEASE-PRACTICE.md` | Supporting research (lands with the plan PR; no further changes expected). |

**Deliberately unchanged:** `.github/workflows/distribution-gate.yml` (its path filters and both
run steps already cover files 1–2), `package.json` (no new scripts), all shipped migrations, all
`metadata/` content, `scripts/write-seed-manifest.mjs`.

## 4. Sequencing

1. **Commit 1 — the gate**: file 1 + file 2 together (the spec is what proves the gate fires; they
   are one reviewable unit). Green means: `npm run lint:distribution` passes on the tree,
   `node scripts/check-distribution-seed.spec.mjs` passes, and the new failure fixtures
   demonstrably fail when run against the check.
2. **Commit 2 — the recipe**: file 3. Docs-only, independently revertible, reviewed against D5.
3. **Plan bookkeeping** (status flips in this document) may ride with either commit or land
   separately.

Order matters: the gate lands first so that the README's newly-promoted delta path is born
enforced.

## 5. Acceptance criteria

- **AC1 — no false positive:** `npm run lint:distribution` exits 0 on the repo as it stands
  (the pre-watershed seed's unfiltered creates do not fire the gate).
- **AC2 — the gate fires:** every must-fail fixture in §3.2 produces a violation naming the file
  and the broken rule; every must-pass fixture produces none. `node
  scripts/check-distribution-seed.spec.mjs` exits non-zero if any of that is untrue.
- **AC3 — stdlib discipline:** `check-distribution-seed.mjs` imports only `node:` builtins; the
  workflow's no-install invariant is preserved (no `package.json` change).
- **AC4 — both shapes covered:** the spec demonstrates detection on `spCreateEntityPermission`
  *and* `spUpdateEntityPermission` shapes, and on omission as well as `_Clear`.
- **AC5 — the recipe is real:** README's delta path stands alone (a reader can execute it without
  visiting the appendix), retains both schema substitutions, and the break-glass appendix retains
  the filter re-create step and its FAILS-LOUDLY explanation verbatim in spirit.
- **AC6 — nothing else moved:** no changes to shipped migrations, `metadata/`, generated files,
  or CI workflows; no new dependencies.
- **AC7 — closure:** Appendix A is ready to file as the upstream MJ issue; #41 is closed by the
  implementation PR with a comment linking the gate, the README change, and the research note.

## 6. Explicitly out of scope

- **Switching to release-time seed consolidation** (MJ's model). Decision and revisit trigger are
  recorded in D5 and the research note; adopting it is its own future issue because it requires
  redesigning CHECK 1's enforcement point, and half-adopting it reproduces caliber's observed
  failure.
- **Net-state simulation of the migration chain.** The watershed rule makes it unnecessary.
- **Gating hand-authored migrations** (D7).
- **Generating PG twins for seeds**, or any `migrations-pg` authoring — the gate merely scans the
  directory.
- **The MJ-side permission change itself** (Appendix A asks for it; this repo only consumes it
  later by moving the filter records into `metadata/`).
- **Tooling to provision the seed-generation database** (a scripted restore/migrate helper). Worth
  considering if the delta recipe sees frequent use; not part of this change.

## 7. Review protocol (this PR)

The planning agent reviews every commit pushed to this PR branch, against this document:

1. Each commit is diffed and checked against §3's file-level scope (anything touched outside it is
   flagged), §2's decisions (deviations need a stated reason in the commit or PR thread), and §5's
   acceptance criteria (which ACs the commit claims to satisfy are re-verified, not trusted).
2. Findings land as PR review comments anchored to the diff; blocking issues are marked
   explicitly. The `code-review` skill's standards/spec axes apply — standards per this repo's
   `.claude/rules/`, spec per this plan.
3. If implementation reveals the plan is wrong somewhere, this document is amended in the same PR
   with a dated correction note (the #39 plan's convention), and the change is explained in a PR
   comment before any code that depends on it is approved.
4. Approval comes only when every AC in §5 is verified on the branch head.

---

## Appendix A — draft upstream issue for MemberJunction/MJ

> **Title:** MetadataSync: no role can Create `MJ: Row Level Security Filters`, so RLS filter
> records cannot be authored in `metadata/`
>
> **Body:** Open Apps that ship row-level-security-filtered grants (bizapps-forms does, per its
> #39/#41) cannot express the filter *records* declaratively: `mj sync push` is refused with
> "Does NOT have permission to Create MJ: Row Level Security Filters records" because Developer
> holds Read + Delete and Integration/UI hold Read only. The records must therefore be created by
> a hand-written migration and only *referenced* from `metadata/` via `@lookup`, which couples
> every seed regeneration to that migration having run first. Request: grant the sync user Create
> (and Update) on `MJ: Row Level Security Filters` — or provide a sanctioned metadata type for
> them — so the records and their references can live together in `metadata/`. Context:
> bizapps-forms#41 documents the failure mode this coupling creates.
