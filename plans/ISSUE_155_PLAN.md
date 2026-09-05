# Issue #155 — the Forms migration chain cannot apply on any database but the one it was generated on

## What the evidence says (and where it corrects the issue)

Reproduced on a clean-room build (`MJ_Issue155_Repro`, core `v6.1.0-edge.5` → common → tasks → forms):

```
FAILED: V202608252340__v0.12.x__Rules_And_Branching.sql
  Failed at batch 5/16 (lines 35-214): The INSERT statement conflicted with the FOREIGN KEY
  constraint "FK_EntityField_Entity" ... table "__mj.Entity", column 'ID'.
```

The issue says the `__mj.Entity` row for `FormScreen` "is never seeded" and that the clean database
"minted `6313B0B1-…`" through `spUpdateExistingEntitiesFromSchema`. **Both halves are wrong, and the
correction matters for the fix.** `V202608191300__v0.11.x__Element_Parity_Metadata_Backfill.sql:64`
seeds that row with the hardcoded literal `6313b0b1-37e8-432f-aeb6-f35f218c5d22`, guarded on the
natural key (`BaseTable`+`SchemaName`). The clean database has exactly that id — verified — because
the repo shipped it, not because anything minted it.

The real defect is the mirror image. `V202608191300`'s guard is a natural key, so on a database that
had already run CodeGen by hand the block is skipped and that host keeps its own earlier id. One such
host minted `A1F8CC58-B040-429C-B695-70DB0E9E7327`, and `V202608252340` was generated there and
appended verbatim. That literal names a row no shipped SQL creates:

| population | Form Screens entity id | source |
|---|---|---|
| fresh install | `6313B0B1-…` | shipped literal in `V202608191300` |
| the host `V202608252340` was generated on | `A1F8CC58-…` | a local CodeGen run predating that backfill |

So the fix is **not** to seed `A1F8CC58` (that forks fresh installs onto an id the repo has already
shipped a different value for, and skips the `ApplicationEntity`/`EntityPermission` inserts that ride
inside the same guard). The fix is to stop hardcoding a *host-local* id at all.

Audited every entity-id literal in `migrations/`: 16 `__mj.Entity` rows are seeded by shipped SQL and
`A1F8CC58` is the only referenced id that is not one of them.

## Design

**Chosen — resolve the Form Screens entity by natural key in `V202608252340`.** This repo already does
exactly this, one migration earlier, for the same entity and the same reason
(`V202608191400:89`, and its header explains why). It is id-agnostic: it works on the fresh install,
on the `A1F8CC58` host, and on the `6313B0B1` host, without converging or forking anything.

Rejected — *seed `A1F8CC58` in `V202608182100`* (the issue's suggestion): fresh installs would then
skip `V202608191300`'s whole guarded block, losing the `ApplicationEntity` row and three
`EntityPermission` rows with it, and it still fails on any host holding the other id.

Rejected — *rewrite the literal to `6313B0B1`*: a second host-specific literal. Fails on the host the
file was generated on, which is the one place it currently works.

**Editing an applied migration in place is sanctioned here** by the test `migrations/README.md` sets
for its one existing exception: the file *cannot apply at all* on the databases that need fixing, so a
repair shipped as a later migration could never reach them. Hosts that already applied it are
unaffected — Skyway's `Migrate()` resolves by version and never checksum-validates. All three files
involved are unreleased (last tag `v0.10.0` stops at `V202608131600`).

## Tasks

### 1. `migrations/V202608252340__v0.12.x__Rules_And_Branching.sql` — the fix
- Resolve `@FormScreensEntityID` by natural key in each of the two batches that need it (T-SQL
  variables do not cross `GO`), replacing all three `A1F8CC58` references.
- `THROW` when the lookup returns NULL. Not ceremony: `spDeleteUnneededEntityFields` treats a
  NULL/empty `@EntityIDs` as *no scope* and then sweeps every entity in every non-excluded schema, so
  an unresolved id must never be passed through.
- Amend the file's "Do not hand-edit" header to record the one edit and why.

### 2. `scripts/check-distribution-seed.mjs` — a new CHECK (7; 6 is the sql_variant gate), so this class cannot ship again
Every GUID a shipped migration uses as an `EntityID` must be a GUID shipped SQL seeds into
`__mj.Entity`. Same family as CHECK 4 (#64) and CHECK 5: reads shipped SQL, and its failure mode
without the gate is silence on a stranger's database. Spec tests + a mutants entry, matching the
existing files.

### 3. Docs
- `migrations/README.md`: record the second in-place-edit exception and the test it passed.
- Changeset at the level `.claude/rules/changesets.md` prescribes.

### 4. Verification
- Clean-room chain from zero applies all 31 migrations. (Fast loop: restore the core+common+tasks
  snapshot, then run only the Forms chain.)
- `npm run lint:distribution` green on the fixed tree; the new check red on the unfixed file.

## Out of scope (filed, not fixed here)
- The 15 `UPDATE ... EntityField ... WHERE ID = '<host-local field id>'` category statements in this
  file and in `V202608191400` are no-ops on a fresh install, because the fresh install's Form Screens
  fields carry `V202608191300`'s ids. Verified harmless: the end state those UPDATEs ask for
  (`GeneratedFormSection='Category'`, `ExtendedType` `URL`/`Code`, `CodeType` `Other`) is already what
  `spUpdateExistingEntityFieldsFromSchema` computes there. Same class, no consequence — noted so the
  next reader does not have to re-derive it.
- #156 (`mj codegen` drops the hierarchy `OUTER APPLY`) is a separate defect on the same clean run.

## What execution established (2026-09-04)

Every claim below was run, not reasoned. The loop that made it affordable: build core + common +
tasks once, `BACKUP DATABASE` it, then `RESTORE` before each Forms run — ~40s per iteration instead
of ~3 minutes.

| # | Question | Evidence |
|---|---|---|
| 1 | Does it fail from zero? | `MJ_Issue155_Repro`: 24 applied, then `FAILED: V202608252340 … batch 5/16 … FK_EntityField_Entity`. |
| 2 | Which id does a fresh install actually hold? | `6313B0B1-37E8-432F-AEB6-F35F218C5D22`, and `A1F8CC58` is absent. The repo shipped that literal; nothing minted it. |
| 3 | Does the fix apply from zero? | `MJ_Issue155_Fixed`: **31 of 31** migrations applied. |
| 4 | Does it still apply on the host the file was generated on? | Simulated by rewriting `V202608191300`'s literal to `A1F8CC58` and stopping the chain at `V202608252300` (24 applied), then running the real fixed set on top: **7 applied**, clean. |
| 5 | Do both populations end in the same state? | On both: `IsDisqualification` field `0992C64A-…` attached to `FormScreen`; `FormResponse.Status` values `Complete,Disqualified,Partial`; the column present in `vwFormScreens`; **0** orphaned `EntityField` rows. |
| 6 | Does the `THROW` fire, and only when it should? | The shipped guard text, run with `defaultSchema` pointed at a schema owning no `FormScreen`: `Msg 50000 … no [Entity] row for FormScreen in this schema`. Pointed at the real schema: falls through. |
| 7 | Does the gate catch the defect it exists for? | `runChecks` against a tree holding the pre-fix file from `git show HEAD:…` reports one violation naming all five literal sites (`:51,85,86,515,518`), and stays green on the fixed tree — whose header names the captured id six times in prose. |
| 8 | Does the gate's own suite still kill what it claims? | `lint:distribution:mutants`: 96 load-bearing behaviours, all killed; the 2 asserted-unobservable ones still unobservable. |

Two things the fix deliberately does **not** do, recorded so they are not re-derived:

- **It does not converge the ids.** Repointing an `Entity.ID` means rewriting every `__mj` table that
  references it; the lookup makes the divergence stop mattering instead, which is the cheaper
  correctness. Item 5 above is the evidence that divergent ids still converge on identical state.
- **It leaves the 15 field-category `UPDATE`s alone.** They address `EntityField` rows by
  `V202608191400`'s ids, which a fresh install does not have, so they match nothing there. Verified
  harmless: the fresh database already holds the exact end state they ask for
  (`GeneratedFormSection='Category'`, `ExtendedType` `URL`/`Code`, `CodeType` `Other`), computed by
  `spUpdateExistingEntityFieldsFromSchema`. Rewriting 15 statements to change nothing is risk without
  a return.
