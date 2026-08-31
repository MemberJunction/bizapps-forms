# RelatedRecordCollection for the Forms builder — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the builder's structural operations — delete a question, delete a page, reorder — atomic, by routing them through MJ core's `RelatedRecordCollection` instead of hand-rolled per-row `Save()`/`Delete()` loops.

**Architecture:** Declare three collections (`Pages`, `Questions`, `Options`) as `EntityRelationship` **metadata**, and let CodeGen emit the typed `DeclareRelatedRecords(...)` onto the generated subclasses — the route MJ prescribes and uses itself. `loadTree` keeps its existing three `RunView`s and *hands* the results to the collections via `SetLoadedItems()` — no new queries, no N+1. Delete and reorder then run through the collection and persist as one transaction. **Field editing is deliberately untouched** and keeps its debounced per-entity autosave.

**Tech Stack:** TypeScript, Angular 21, `@memberjunction/core` 6.1.0-edge.2 (`RelatedRecordCollection`, `EntitySavePlan`, `TransactionGroup`), Vitest.

**Spec:** [issue #103](https://github.com/MemberJunction/bizapps-forms/issues/103), as amended by the findings in `## Verified constraints` below. Where the issue and this section disagree, this section is what was measured against the installed code and wins.

---

## Global Constraints

- **`@memberjunction/*` stays pinned.** `packages/*` declare MJ as caret `peerDependencies` only and carry no MJ `dependencies`. Do not add any.
- **No `any`, no `unknown`-as-escape-hatch, no `BaseEntity.Get()/.Set()` as a substitute for generated types** (CLAUDE.md §2, §2b). The one permitted exception is duck-typed *test* fakes cast `as unknown as`, matching `builder-state.failure.spec.ts`.
- **Never hand-edit `packages/*/src/generated/`.**
- **No commits without explicit approval from the user** (CLAUDE.md §1). Each task ends with a *prepared* commit; ask before running it.
- **Tests are `.spec.ts`,** colocated with source, run via `pnpm run test` in the package. There is no `@memberjunction/test-utils` in this repo.
- **Declare collections in metadata, never by hand.** `MJ/metadata/CLAUDE.md` §1c names `RelatedRecordCollection` explicitly as a JSON-type field authored in metadata, and `MJ/metadata/entities/.related-record-collections.json` is the working reference. A hand-written `DeclareRelatedRecords` in a subclass is off-pattern and would be overwritten in spirit by the next CodeGen run.
- **This PR carries declarative metadata + regenerated CodeGen output. It hand-authors NO `Metadata_Sync` migration.** `MJ/metadata/CLAUDE.md` §1b and — since #108 landed — this repo's own `CLAUDE.md` Migrations section: PRs contribute only the declarative JSON; the build engineer generates ONE consolidated sync per release. `check:release-seed` and `check:seed-cadence` run in `publish.yml`, never on a PR.
- **`primaryKey` here is an `@lookup:`, not a `uuidgen` UUID, and that is deliberate.** CLAUDE.md's `uuidgen` rule is for records this repo CREATES. These three `EntityRelationship` rows already exist and were minted by CodeGen with a **host-specific** id, so a hardcoded UUID would address a row that does not exist on anyone else's database — which is #64's failure mode and exactly what `lint:distribution` CHECK 4 exists to catch. MJ's own `.related-record-collections.json` keys on `@lookup:` for the same reason.
- **Never author a `sync` block** (`lastModified`/`checksum`) in a metadata file — `mj sync push` writes those back at release time (§1).
- **JSON-type fields are authored as native nested JSON objects**, never escaped strings (§1c).
- Work happens in the existing worktree `.claude/worktrees/issue-103` on branch `refactor/103-related-record-collections`, which has **no upstream set** — first push must be `git push -u origin refactor/103-related-record-collections`.

---

---

## REVISION, 2026-08-31 — read this before any task below

Task 5 Step 3 told the implementer to verify the transaction-group API before relying on it. That
check was run, and it overturned the plan's central assumption. **Everything below is preserved as
written; where it disagrees with this section, this section is what was measured and what shipped.**

### The finding

`entity.Delete()` with a loaded owned collection is **not atomic from a browser**. Core says so in
its own doc comment on `deleteGraph` (`baseEntity.js`): a delete graph has no remote counterpart, so
on a client provider "the nodes execute in order over ordinary mutations. That is not atomic — a
failure partway leaves earlier deletions committed." The chain, all verified against
`@memberjunction/core@6.1.0-edge.2` as installed:

| Step | Evidence |
|---|---|
| `Delete()` with a loaded collection routes to `deleteGraph` | `baseEntity.js:3514` |
| `deleteGraph` opens a transaction only if the provider supports one | `baseEntity.js:1499` |
| `GraphQLDataProvider` never declares `SupportsEntityTransactions` | zero hits in its `dist` |
| No delete counterpart to `MJ.SaveEntityGraph` exists | core's `dist/generic/` has one remote operation, and it is the save one |

So Tasks 4 and 5 as planned would have moved the half-deleted page *inside* the framework. Task 5 was
worse: the provider's transaction-group deferral sits **below** `Delete()`'s graph routing, so setting
`TransactionGroup` on a page whose `Questions` are loaded lands in `deleteGraph` and executes
immediately, group untouched.

### What shipped instead

All three structural operations commit through **one `TransactionGroup`**, with the row order planned
here rather than by the graph executor. Each row is deleted with `IsGraphNodeDelete: true` so it takes
the single-node path and reaches the provider's deferral regardless of whether its collection happens
to be loaded.

MJ's `TRANSACTIONS_AND_BATCHING_GUIDE.md` calls a transaction group "NOT a composite-save engine" and
sends parent/child work to an entity graph. Its four objections are all about **saves** — no primary
key after the parent, no read-your-writes, `Save()` returning true early, no dependency graph — and a
delete needs none of them. The third does bite, which is why failure is read from `Submit()` and the
notification stream, never from `Delete()`'s return value. That guide also names application code
passing `IsGraphNodeSave` an anti-pattern and points at `SkipRelatedCollections` instead; **that
option does not exist at our pin** (the guide is written against 6.2+), which is recorded in the code
as the thing to switch to on the next MJ upgrade.

### Task status

| Task | Status |
|---|---|
| 1 — metadata + CodeGen | **Done.** `mj sync push --dir=metadata --include="entity-relationships"` reported 3 updated / 0 created; CodeGen emitted the three declarations (63 insertions, no deletions, no DDL). The browser does not use them — server-side callers do, where `SupportsEntityTransactions` IS true — and the Task 8 follow-up converts those. Two things to know, both documented in MJ's `metadata/CLAUDE.md` §11 and §1 rather than defects: `--dir` names the metadata **root**, not an entity directory (pointing it at one fails with "No entity directories found", which blames your files and should not), and the push **writes `sync` blocks back by design** — authors omit them, the tool adds them, and a feature PR strips them before committing. |
| 2 — populate collections in `loadTree` | **Dropped.** Nothing in the browser reads them: the delete path plans its own rows and the reorder path writes siblings. Populating a collection no consumer reads is surface without a payoff, and on the save path core *throws* when a group meets a loaded collection. |
| 3 — `beginStructuralChange` | **Done**, as designed. Compares the failure signal before/after the flush rather than against `null`, so an undismissed earlier refusal cannot block every later delete. |
| 4 — atomic `deleteQuestion` | **Done**, via `deleteAsOneTransaction`. |
| 5 — atomic `deletePage` | **Done**, same helper, rows built deepest-first. |
| 6 — transactional reorder | **Done**, via `persistSequence` — and it needed no collections, so it was never blocked on Task 1. Also restores in-memory `DisplayOrder` on refusal, which the plan did not ask for and the reproduction had flagged as the worse half of the defect. |
| 7 — reconcile callers | **Done**: `moveQuestion`'s comment and log message rewritten. The component's `deleteQuestion`/`onRemoveOption` needed no change. |
| 8 — changeset + follow-up | Changeset written; follow-up issue still to open. |

### Reorder rollback reaches the canvas

A refused reorder now puts back all three things: the stored order (the transaction), the entities'
`DisplayOrder` (`persistSequence`), and `page.questions` plus any standing reorder notice
(`reorderQuestion`). An earlier draft of this revision called the last one out of blast radius —
"unpicking the undo/notice machinery" — which was wrong: it is one captured field and the exact
inverse `moveItemInArray(page.questions, to, from)`.

---

## Verified constraints

Every line here was measured against `@memberjunction/core@6.1.0-edge.2` as installed in this worktree, not read from the issue. Two of them contradict the issue.

1. **The delete cascade is exactly ONE level deep.** `BaseEntity.Delete()` builds a plan from its companions, but each node executes with `IsGraphNodeDelete: true`, which bypasses graph routing — so a node's *own* companions never expand. `page.Delete()` therefore plans `[questions…, page]` and **never reaches the options**. Since `FormQuestionOption.QuestionID` is `NOT NULL` with an FK, that plan fails. This is why Task 5 uses a `TransactionGroup` rather than relying on the cascade.

2. **There is no reorder API, and the intuitive workaround destroys data.** `Remove()` pushes a persisted child onto `removed` (a queued DELETE) and `Add()` does not take it back off. `Remove(x); Add(x)` to move a row therefore *deletes* it on the next save. The working expression — proven in `collection-reorder.spike.spec.ts` — is `SetLoadedItems([])` followed by re-`Add()` in the new order: `SetLoadedItems` resets `removed`, and each `Add` re-runs `applySequence` over the whole list.

3. **Re-sequencing only dirties rows that actually moved.** `applySequence` calls `child.Set(field, value)`, and `BaseEntity.Set` marks dirty only on a real change; `ContributeSaveWork` then skips any child that is `IsSaved && !Dirty`. Today's "skip unchanged rows" optimisation in `persistQuestionOrder` is preserved, not regressed.

4. **A direct `child.Save()` is safe alongside a loaded collection.** Because `ContributeSaveWork` skips clean saved children, a child persisted on its own contributes nothing to a later parent save. This is what makes the hybrid model in this plan sound.

5. **`FormQuestion.FormID` is `NOT NULL`, and the `Questions` collection stamps only `PageID`.** This plan never calls `Questions.Create()`, so the blocker does not arise — `addQuestion` keeps setting both keys explicitly. Any future task that adopts `Create()` must set `FormID` first.

6. **`FormQuestion.PageID` is nullable.** `loadTree` currently loads questions by `FormID` and sweeps `PageID`-less orphans onto page 1. Loading per-page through the collection would silently drop them. This plan therefore keeps the existing `FormID` load and only *populates* the collections from it.

7. **CodeGen bakes the config in as string literals**, so the collection reads nothing from `EntityRelationship` at run time — the metadata row is a CodeGen-time input. This is *not* a licence to hand-write the declaration (see Task 1); what it means is that the declaration survives in the published package even on a host whose database never received the seed, and that the failure mode of a missing seed is **a later regeneration silently dropping the collections**. That delayed, silent drop is what `generated-collections.spec.ts` exists to catch.

---

## Why the scope is narrower than the issue

The issue asks for one `Save()` on the form to persist everything. **The builder has no Save button** — every edit autosaves independently 400ms after typing stops, and `markDirty()` measures drift from the *published* version, not unsaved work.

Routing field edits through a parent save would mean every keystroke-settle writes *every* dirty child in the graph, including a sibling question the author is still typing into. That is exactly the mid-edit overwrite that `SAVE_DEBOUNCE_MS` and the per-entity save chain were built to stop, documented at length in `builder-state.service.ts`. Adopting it wholesale would trade a real bug for a subtler one.

So: **collections own the discrete structural operations** (delete, reorder), where atomicity is the whole point. **Debounced autosave keeps owning field edits.** Task 3 is the seam that keeps the two from colliding.

---

## File structure

| File | Responsibility |
|---|---|
| `metadata/entity-relationships/.mj-sync.json` *(create)* | Sync config: `entity: "MJ: Entity Relationships"` |
| `metadata/entity-relationships/.entity-relationships.json` *(create)* | The three collection declarations |
| `metadata/.mj-sync.json` *(modify)* | Add `entity-relationships` to `directoryOrder` |
| `packages/Entities/src/generated/entity_subclasses.ts` *(regenerated)* | CodeGen emits the three `DeclareRelatedRecords(...)`. **Never hand-edited** |
| `packages/Angular/src/lib/builder/builder-state.service.ts` *(modify)* | Populate collections on load; route delete + reorder through them |
| `packages/Angular/src/lib/builder/builder-state.cascade.spec.ts` *(modify)* | Already written as the reproduction; each assertion flips to the transactional expectation |
| `packages/Angular/src/lib/builder/collection-reorder.spike.spec.ts` *(keep)* | Pins the two framework behaviours this design depends on |

**No hand-written entity subclasses.** An earlier draft of this plan proposed them; that was wrong. See Task 1.

---

### Task 1: Declare the three collections in metadata, then run CodeGen

**This is Route A, and it is the only correct route.** `MJ/metadata/CLAUDE.md` §1c names `RelatedRecordCollection` explicitly among the JSON-type fields authored in metadata, and `MJ/metadata/entities/.related-record-collections.json` is MJ's own working implementation of exactly this — eight collections declared as data, with CodeGen emitting the `DeclareRelatedRecords(...)` into the generated subclass. A hand-written declaration is off-pattern.

**The shape below differs from the one in issue #103**, which was written from memory. Three corrections, all taken from MJ's live file:
- The field is authored as a **native nested JSON object**, not an `@file:` reference (§1c: "Do NOT escape as strings"; `mj sync` serialises nested objects on push).
- The `primaryKey` lookup uses the full disambiguating form — `EntityID=@lookup:…&RelatedEntityID=@lookup:…&RelatedEntityJoinField=…` — with **nested** lookups on both entity ids.
- **`RelatedEntityJoinField` in the lookup is load-bearing here.** `MJ_BizApps_Forms: Forms` has relationships to *both* Form Pages and Form Questions on `FormID`; the join field is what keeps a lookup from matching the wrong row.

**Files:**
- Create: `metadata/entity-relationships/.mj-sync.json`
- Create: `metadata/entity-relationships/.entity-relationships.json`
- Modify: `metadata/.mj-sync.json` (add `entity-relationships` to `directoryOrder`)
- Regenerate: `packages/Entities/src/generated/entity_subclasses.ts`
- Test: `packages/Entities/src/generated-collections.spec.ts`

**Interfaces:**
- Produces, on the **generated** subclasses: `mjBizAppsFormsFormEntity.Pages: RelatedRecordCollection<mjBizAppsFormsFormPageEntity>`, `mjBizAppsFormsFormPageEntity.Questions: RelatedRecordCollection<mjBizAppsFormsFormQuestionEntity>`, `mjBizAppsFormsFormQuestionEntity.Options: RelatedRecordCollection<mjBizAppsFormsFormQuestionOptionEntity>`. Exported from `@mj-biz-apps/forms-entities` as they already are.

> **The metadata files in Steps 1–2 are already written in the worktree**, having been used to verify the distribution gate's behaviour. Read them before rewriting; they match what is below.

- [ ] **Step 1: Write the sync config**

`metadata/entity-relationships/.mj-sync.json` — mirrors `metadata/entity-permissions/.mj-sync.json`, which is this repo's existing precedent for reaching core `MJ:` rows:

```json
{
  "entity": "MJ: Entity Relationships",
  "filePattern": "**/.*.json",
  "defaults": {},
  "pull": {
    "createNewFileIfNotFound": true,
    "newFileName": ".entity-relationships.json",
    "appendRecordsToExistingFile": true,
    "updateExistingRecords": true,
    "preserveFields": [],
    "excludeFields": [],
    "mergeStrategy": "merge",
    "backupBeforeUpdate": true,
    "backupDirectory": ".backups",
    "filter": "RelatedRecordCollection IS NOT NULL",
    "externalizeFields": [],
    "ignoreNullFields": true,
    "ignoreVirtualFields": true,
    "lookupFields": {},
    "relatedEntities": {}
  }
}
```

The `filter` matters: without it a `mj sync pull` would drag every `EntityRelationship` row in the database into this file.

- [ ] **Step 2: Write the three declarations**

`metadata/entity-relationships/.entity-relationships.json` — as written in the worktree. The `_comments` block carries the two non-obvious decisions (`From: 0`, and the `PageID`-not-`FormID` join). Do **not** add `sync` blocks; `mj sync push` writes those at release.

Each record's `fields.RelatedRecordCollection` is:

```json
{
  "Name": "Pages",
  "Source": "database",
  "ReadOnly": false,
  "Load": "explicit",
  "OnRemove": "delete",
  "OrderBy": "DisplayOrder ASC",
  "Sequence": { "Field": "DisplayOrder", "From": 0 },
  "ClearAfterSave": false
}
```

…with `Questions` and `Options` identical apart from `Name`. `Source`/`ReadOnly` are stated explicitly rather than left to default, following the precedent MJ set for its one writable collection (`MJ: AI Agents → Prompts`): among a file of cache-backed read-only projections, an implicit writable one reads as an oversight.

- [ ] **Step 3: Register the directory**

`metadata/.mj-sync.json` — add `"entity-relationships"` to `directoryOrder`, after `"entity-permissions"`. **A directory absent from this list is not pushed**, and nothing warns you.

- [ ] **Step 4: Push the metadata to the dev database**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms/.claude/worktrees/issue-103
npx mj sync push --dir metadata/entity-relationships
```

Expected: three records **updated** (not created). If it reports a create, the lookup missed — stop and fix the lookup rather than letting `autoCreateMissingRecords: true` insert a duplicate `EntityRelationship` row, which is issue #64's failure mode and breaks the next CodeGen run (#66).

> **This writes to the SHARED dev database**, which MJ's host (`:4000`) serves from the *main* checkout. The change is an UPDATE to three existing rows and adds no schema, so it is low-risk — but it does mean the main checkout's next `mj codegen` will also emit these declarations. That is harmless (identical output) and is worth knowing rather than discovering.

- [ ] **Step 5: Run CodeGen and commit the generated output**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms/.claude/worktrees/issue-103
npm run mj:codegen
git diff --stat packages/Entities/src/generated/entity_subclasses.ts
```

Expected: the three `DeclareRelatedRecords(...)` declarations appear on the generated subclasses, each with a doc comment naming the relationship row it came from. **Never hand-edit this file** — if a declaration is missing, the metadata or the push is wrong, not the output.

Then check whether CodeGen produced any SQL:

```bash
ls -la migrations/codegen/ 2>/dev/null
```

`migrations/codegen/` is gitignored and holds CodeGen's raw run output. A `RelatedRecordCollection` change touches no schema — no new columns, entities or fields — so this should be **empty or unchanged**. If it did emit SQL, append it to a feature migration below the `-- CodeGen output (appended)` marker per `migrations/README.md`; do not commit `migrations/codegen/` itself.

- [ ] **Step 6: Write the test**

`packages/Entities/src/generated-collections.spec.ts` — asserts the *generated* declarations, so a future CodeGen run that silently drops them fails here rather than in the builder:

```ts
/**
 * The three collections CodeGen emits from `EntityRelationship.RelatedRecordCollection`.
 *
 * Asserted because the declaration is GENERATED: it exists only as long as the metadata row does.
 * A database that never received the seed, or a regeneration against one, produces a file with no
 * collections and a builder whose deletes quietly stop being transactional — with nothing failing
 * at build time. This test is what turns that into a red suite.
 */
import { describe, expect, it } from 'vitest';
import {
  mjBizAppsFormsFormEntity,
  mjBizAppsFormsFormPageEntity,
  mjBizAppsFormsFormQuestionEntity,
} from './generated/entity_subclasses';

describe('Form.Pages', () => {
  it('joins on FormID, ordered by DisplayOrder, and owns its children', () => {
    const pages = new mjBizAppsFormsFormEntity().Pages;
    expect(pages.Name).toBe('Pages');
    expect(pages.RelatedEntityName).toBe('MJ_BizApps_Forms: Form Pages');
    expect(pages.RelatedEntityJoinField).toBe('FormID');
    expect(pages.OrderByClause).toBe('DisplayOrder ASC');
    expect(pages.RemovalMode).toBe('delete');
    expect(pages.LoadMode).toBe('explicit');
    expect(pages.IsReadOnly).toBe(false);
  });
});

describe('FormPage.Questions', () => {
  it('joins on PageID, not FormID', () => {
    // FormQuestion carries BOTH keys and MJ metadata has a `Forms -> Form Questions`
    // relationship on FormID. Joining there would put every question on every page.
    const questions = new mjBizAppsFormsFormPageEntity().Questions;
    expect(questions.RelatedEntityJoinField).toBe('PageID');
    expect(questions.RelatedEntityName).toBe('MJ_BizApps_Forms: Form Questions');
    expect(questions.RemovalMode).toBe('delete');
  });
});

describe('FormQuestion.Options', () => {
  it('joins on QuestionID and owns its children', () => {
    const options = new mjBizAppsFormsFormQuestionEntity().Options;
    expect(options.RelatedEntityJoinField).toBe('QuestionID');
    expect(options.RelatedEntityName).toBe('MJ_BizApps_Forms: Form Question Options');
    expect(options.RemovalMode).toBe('delete');
  });
});
```

> `RelatedRecordCollection` exposes `Name`, `RelatedEntityName`, `RelatedEntityJoinField`, `OrderByClause`, `LoadMode`, `RemovalMode`, `Source`, `IsReadOnly` — all used above. It exposes **no** getter for the sequence config, so `Sequence: { From: 0 }` cannot be asserted here; `collection-reorder.spike.spec.ts` covers zero-based renumbering through the public API instead.

- [ ] **Step 7: Confirm the gates, and ship no seed**

```bash
npm run lint:distribution
```

Expected: passes. **Verified in the worktree after merging #108.** There is nothing to regenerate — `seed:manifest` and `migrations/metadata-seed.manifest.json` no longer exist, and `lint:distribution` now covers only the shipped-SQL hazards. An earlier draft of this plan had a `npm run seed:manifest` step here; #108 landed mid-plan and deleted the script. **Do not add a `Metadata_Sync` migration to this PR.**

The two release checks are **not** PR gates — `publish.yml` runs them, and they are the build engineer's:

```bash
npm run check:release-seed    # coverage: every literal-UUID primaryKey appears in a shipped migration
npm run check:seed-cadence    # one consolidated seed per release; a seed is OWED once metadata/ moves
```

Two things to know if you run them anyway:

- **Coverage is blind to this change**, by design. It collects only `primaryKey.ID` values matching a literal UUID; these three records key on `@lookup:` expressions, so they contribute nothing to it. Not a gap — it is `check:seed-cadence`'s drift rule ("`metadata/` moved since the last tag, so a seed is owed") that covers an update-shaped record.
- **`check:seed-cadence` already fails on `next`**, before this branch touches anything: two pre-existing unreleased deltas (`V202608182130`, `V202608241800`) that the next release must fold into one consolidated seed. **Not this PR's problem, and not this PR's to fix** — don't be alarmed by a red cadence check, and don't delete those migrations to quiet it.

- [ ] **Step 8: Run the tests**

```bash
cd packages/Entities && pnpm run build && npx vitest run src/generated-collections.spec.ts
```
Expected: PASS.

- [ ] **Step 9: Prepare the commit** (ask the user before running it)

```bash
git add metadata/entity-relationships metadata/.mj-sync.json \
        packages/Entities/src/generated/entity_subclasses.ts \
        packages/Entities/src/generated-collections.spec.ts
git commit -m "feat(metadata): declare Pages, Questions and Options as owned collections"
```

### Task 2: Populate the collections during `loadTree`, adding no queries

**Files:**
- Modify: `packages/Angular/src/lib/builder/builder-state.service.ts` (`loadTree`, `toQuestionNode`)
- Test: `packages/Angular/src/lib/builder/builder-state.cascade.spec.ts`

**Interfaces:**
- Consumes: `mjBizAppsFormsFormEntity.Pages`, `mjBizAppsFormsFormPageEntity.Questions`, `mjBizAppsFormsFormQuestionEntity.Options` from Task 1.
- Produces: after `loadTree(form)`, every collection in the tree is populated and `IsLoaded === true`, with **no additional round trips**.

The collections are filled from the rows the three existing `RunView`s already returned. Do **not** call `collection.Load()` — that would issue one query per page and per question, turning today's fixed four queries into `1 + pages + questions`. It would also drop `PageID`-less orphan questions, which `loadTree` currently sweeps onto page 1.

- [ ] **Step 1: Write the failing test**

Append to `builder-state.cascade.spec.ts`:

```ts
describe('loadTree populates the collections without extra queries', () => {
  it('hands each page its questions and each question its options', async () => {
    // Fakes stand in for the three RunViews; the assertion is that the collections end up
    // populated from THOSE rows, with no further provider calls.
    const { tree, runViewCalls } = await loadTreeWithFakes({
      pages: [{ ID: 'P1' }],
      questions: [{ ID: 'Q1', PageID: 'P1' }],
      options: [{ ID: 'O1', QuestionID: 'Q1' }],
    });

    expect(runViewCalls).toBe(4); // pages, questions, options, screens — unchanged
    const page = tree.pages[0].entity;
    expect(page.Questions.IsLoaded).toBe(true);
    expect(page.Questions.Count).toBe(1);
    const question = page.Questions.Items[0];
    expect(question.Options.IsLoaded).toBe(true);
    expect(question.Options.Count).toBe(1);
  });

  it('still lands a PageID-less question on the first page', async () => {
    // Orphans are why loadTree loads questions by FormID rather than per page. PageID is nullable,
    // so this path is reachable; loading through the collections would silently lose the row.
    const { tree } = await loadTreeWithFakes({
      pages: [{ ID: 'P1' }],
      questions: [{ ID: 'Q1', PageID: null }],
      options: [],
    });

    expect(tree.pages[0].questions.map((q) => q.entity.ID)).toEqual(['Q1']);
  });
});
```

The implementer writes `loadTreeWithFakes` in the same file. It must: stub `RunView.prototype.RunView` to return the supplied rows per `EntityName` while counting calls, build real `mjBizAppsFormsFormEntity`/`mjBizAppsFormsFormPageEntity`/`mjBizAppsFormsFormQuestionEntity` instances via `LoadFromData`, restore the stub in a `finally`, and return `{ tree, runViewCalls }`.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/Angular && npx vitest run src/lib/builder/builder-state.cascade.spec.ts
```
Expected: FAIL — `page.Questions.IsLoaded` is `false`, because nothing populates it yet.

- [ ] **Step 3: Write the implementation**

In `loadTree`, after the page nodes are built and orphans are placed, hand each collection its rows:

```ts
  /**
   * Fill the owned collections from the rows the three RunViews above already returned.
   *
   * `SetLoadedItems` rather than `Load()`, and that is the whole point: `Load()` would issue one
   * query per page and one per question — turning a fixed four queries into `1 + pages + questions`
   * — and would key questions on `PageID`, silently dropping the orphans this method deliberately
   * rescues. The rows are already in hand; the collections only need to be told so.
   *
   * This makes the collections authoritative for STRUCTURE (delete, reorder). Field edits continue
   * to save per entity through `saveDebounced`, which stays safe because `ContributeSaveWork` skips
   * a child that is already saved and clean.
   */
  private adoptIntoCollections(form: mjBizAppsFormsFormEntity, pageNodes: PageNode[]): void {
    for (const node of pageNodes) {
      for (const question of node.questions) {
        question.entity.Options.SetLoadedItems(question.options);
      }
      node.entity.Questions.SetLoadedItems(node.questions.map((q) => q.entity));
    }
    form.Pages.SetLoadedItems(pageNodes.map((p) => p.entity));
  }
```

Call it at the end of `loadTree`, immediately before the `return`:

```ts
    this.adoptIntoCollections(form, pageNodes);
    return { form, pages: pageNodes, screens };
```

`FormTree.form` / `PageNode.entity` / `QuestionNode.entity` are ALREADY typed as the generated classes, and CodeGen puts the collections on those same classes — so **no type widening is needed** and `builder-models.ts` is untouched. (An earlier draft of this plan required a widening step; that was an artefact of the hand-written-subclass route and is gone.)

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/Angular && npx vitest run src/lib/builder/builder-state.cascade.spec.ts && pnpm run test
```
Expected: the new tests PASS and all 1456 pre-existing tests still pass.

- [ ] **Step 5: Prepare the commit** (ask first)

```bash
git add packages/Angular/src/lib/builder/builder-state.service.ts \
        packages/Angular/src/lib/builder/builder-state.cascade.spec.ts
git commit -m "refactor(builder): populate the owned collections from the rows loadTree already read"
```

---

### Task 3: Serialise structural operations behind pending autosaves

This is the seam that lets collections and debounced autosave coexist. A parent save sweeps up **every dirty child**, so a delete issued while a sibling question's edit is still on its 400ms timer would write that half-typed edit as a side effect. `flushPendingSaves()` already exists and already does exactly the needed draining; it just has to be awaited first.

**Files:**
- Modify: `packages/Angular/src/lib/builder/builder-state.service.ts`
- Test: `packages/Angular/src/lib/builder/builder-state.cascade.spec.ts`

**Interfaces:**
- Produces: `private async beginStructuralChange(): Promise<boolean>` — drains pending autosaves and reports whether the tree is safe to restructure.

- [ ] **Step 1: Write the failing test**

```ts
describe('a structural change never rides along with a half-typed edit', () => {
  it('flushes pending autosaves before it touches the graph', async () => {
    const service = new BuilderStateService();
    const order: string[] = [];
    const typing = new RecordingRow('typed-edit', order);

    service.saveDebounced(asQuestion(typing));       // still on its 400ms timer
    await service.deleteQuestion(recordingQuestionNode('deleted', order));

    // The pending edit must be written as ITS OWN save, before the delete's transaction opens.
    expect(order).toEqual(['SAVE typed-edit', 'DELETE deleted']);
  });
});
```

`RecordingRow` / `recordingQuestionNode` extend the `FakeRow` helpers already at the top of this file — reuse them rather than defining a third fake.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/Angular && npx vitest run src/lib/builder/builder-state.cascade.spec.ts -t 'half-typed'
```
Expected: FAIL — the delete runs first, or the two interleave.

- [ ] **Step 3: Write the implementation**

```ts
  /**
   * Drain anything the debounce is still holding, so a graph save cannot adopt it.
   *
   * A structural change persists through the PARENT, and a parent save contributes every dirty
   * child in the graph. An edit still sitting on its 400ms timer is dirty. Without this, deleting
   * one question would also write whatever the author was typing into another — mid-keystroke,
   * under a transaction they did not ask for, and reported against the wrong record if refused.
   *
   * Returns false when the drain could not confirm every write. The caller must not restructure
   * on top of that: `flushPendingSaves` has already told the author what is unconfirmed, and
   * stacking a cascade onto it would make the report unreadable.
   */
  private async beginStructuralChange(): Promise<boolean> {
    await this.flushPendingSaves();
    return this._lastFailure() === null;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/Angular && npx vitest run src/lib/builder/builder-state.cascade.spec.ts
```
Expected: PASS.

- [ ] **Step 5: Prepare the commit** (ask first)

```bash
git add packages/Angular/src/lib/builder
git commit -m "refactor(builder): drain pending autosaves before a structural change"
```

---

### Task 4: Make `deleteQuestion` atomic

This is the task that fixes the worst reproduced defect: a live question with some of its options silently missing.

**Files:**
- Modify: `packages/Angular/src/lib/builder/builder-state.service.ts` (`deleteQuestion`)
- Test: `packages/Angular/src/lib/builder/builder-state.cascade.spec.ts`

**Interfaces:**
- Consumes: `mjBizAppsFormsFormQuestionEntity.Options` (Task 1), `beginStructuralChange()` (Task 3).
- Produces: `deleteQuestion(node: QuestionNode): Promise<boolean>` — unchanged signature, now all-or-nothing.

A question's options ARE reachable in one plan, because `question.Delete()` is a top-level call and expands its own companions. This is the one level the cascade does cover.

- [ ] **Step 1: Rewrite the reproduction assertion**

Replace the body of the existing `'half-deletes a question the same way, one option at a time'` test:

```ts
  it('deletes a question and its options as one unit, or not at all', async () => {
    // WAS: opt1 deleted, opt2 refused, question and remaining options left behind (issue #103).
    // The options now travel in the question's own delete plan, so a refusal rolls the whole
    // thing back instead of stranding the question in a state the product has no name for.
    const writes: string[] = [];
    const node = questionNodeWithRefusingChild(writes);

    const ok = await new BuilderStateService().deleteQuestion(node);

    expect(ok).toBe(false);
    expect(writes).toEqual([]); // nothing was written — that is the entire fix
  });
```

Add the success case:

```ts
  it('costs ONE transaction when it succeeds', async () => {
    const writes: string[] = [];
    const node = questionNodeWithOptions(3, writes);

    expect(await new BuilderStateService().deleteQuestion(node)).toBe(true);
    // One graph delete, not four round trips.
    expect(writes).toEqual(['DELETE-GRAPH question(+3 options)']);
  });
```

The fakes must model `Delete()` as expanding companions — mirror `ContributeDeleteWork`: loaded children first, then the parent, all recorded as one entry.

- [ ] **Step 2: Run to verify it fails**

```bash
cd packages/Angular && npx vitest run src/lib/builder/builder-state.cascade.spec.ts -t 'one unit'
```
Expected: FAIL — the old loop still writes `DELETE opt1`.

- [ ] **Step 3: Write the implementation**

```ts
  /**
   * Delete a question and its options as one unit.
   *
   * `question.Delete()` builds a delete plan from the question's companions and runs it in a single
   * transaction, children first. The hand-rolled loop this replaces had no rollback — `Delete()`
   * refuses by returning false rather than throwing, so a refused option left the question live
   * with the earlier options already gone, rendering as a Multiple Choice offering fewer answers
   * than the author wrote, reported nowhere (issue #103).
   *
   * The options must be LOADED for them to be in the plan: an unloaded collection contributes
   * nothing, and the delete would then fail on the options' foreign key instead. `loadTree`
   * populates them; a question created this session has an empty-but-loaded collection, which is
   * correct — it has no options in the database to delete.
   */
  public async deleteQuestion(node: QuestionNode): Promise<boolean> {
    if (!(await this.beginStructuralChange())) {
      return false;
    }
    return this.deleteChecked(node.entity, 'delete question');
  }
```

- [ ] **Step 4: Run tests**

```bash
cd packages/Angular && pnpm run test
```
Expected: all pass.

- [ ] **Step 5: Prepare the commit** (ask first)

```bash
git add packages/Angular/src/lib/builder
git commit -m "fix(builder): a question and its options are deleted together, or not at all"
```

---

### Task 5: Make `deletePage` atomic across all three levels

**Files:**
- Modify: `packages/Angular/src/lib/builder/builder-state.service.ts` (`deletePage`)
- Test: `packages/Angular/src/lib/builder/builder-state.cascade.spec.ts`

**Interfaces:**
- Consumes: `mjBizAppsFormsFormPageEntity.Questions`, `mjBizAppsFormsFormQuestionEntity.Options`, `beginStructuralChange()`.
- Produces: `deletePage(page: PageNode): Promise<boolean>` — unchanged signature, now all-or-nothing across page + questions + options.

**This is the task the one-level cascade limit bites.** `page.Delete()` plans `[questions…, page]`, and each question node runs with `IsGraphNodeDelete: true`, which does **not** expand that question's own `Options`. The options survive, their `NOT NULL` FK to the question is violated, and the delete fails. Correct — it rolls back rather than corrupting — but it always fails, which is not a fix. A `TransactionGroup` spans the levels; `graphql-dataprovider` implements one, so this works from the builder.

- [ ] **Step 1: Rewrite the reproduction assertion**

```ts
  it('deletes the page, its questions and their options as one unit, or not at all', async () => {
    // WAS: question 1 permanently deleted, questions 2-3 and the page left behind (issue #103).
    const writes: string[] = [];
    const page = pageWithRefusingQuestion(writes);

    const ok = await new BuilderStateService().deletePage(page);

    expect(ok).toBe(false);
    expect(writes).toEqual([]);
  });
```

Keep the existing `'costs one round trip per row even when nothing fails'` test but flip its expectation from `toHaveLength(10)` to a single committed transaction, and rename it to `'commits one transaction, not ten round trips'`.

- [ ] **Step 2: Run to verify it fails**

```bash
cd packages/Angular && npx vitest run src/lib/builder/builder-state.cascade.spec.ts -t 'one unit'
```
Expected: FAIL — the loop still writes `DELETE q1`.

- [ ] **Step 3: Write the implementation**

```ts
  /**
   * Delete a page with everything under it, in one transaction.
   *
   * A `TransactionGroup` rather than a bare `page.Delete()`, and the reason is a real limit in the
   * framework: a delete plan expands ONE level. Each node executes with `IsGraphNodeDelete`, which
   * bypasses graph routing, so the questions in the page's plan never expand their own `Options`.
   * `FormQuestionOption.QuestionID` is NOT NULL, so that plan does not merely miss the options — it
   * is refused by their foreign key. Enlisting each question's own (two-level) delete alongside the
   * page's puts all three levels in one commit scope.
   *
   * Ordering inside the group is deepest-first for the same reason it is inside a plan: a parent
   * cannot go before the rows pointing at it.
   */
  public async deletePage(page: PageNode): Promise<boolean> {
    if (!(await this.beginStructuralChange())) {
      return false;
    }
    const group = await this.md.CreateTransactionGroup();
    for (const question of page.questions) {
      question.entity.TransactionGroup = group;
      await question.entity.Delete();
    }
    page.entity.TransactionGroup = group;
    await page.entity.Delete();

    if (await group.Submit()) {
      return true;
    }
    this.reportFailure('delete page', page.entity);
    return false;
  }
```

> **Verify before relying on the shape above.** Confirm the transaction-group entry points actually offered by the installed core:
> ```bash
> grep -nE "CreateTransactionGroup|Submit\(|TransactionGroup" \
>   node_modules/.pnpm/@memberjunction+core@6.1.0-edge.2/node_modules/@memberjunction/core/dist/generic/metadata.d.ts \
>   node_modules/.pnpm/@memberjunction+core@6.1.0-edge.2/node_modules/@memberjunction/core/dist/generic/transactionGroup.d.ts
> ```
> Adjust the call names to what is there. Two things to check specifically: whether `Delete()` on an entity enlisted in a group **defers** rather than executing (it must, or the group buys nothing), and whether an enlisted `Delete()` still expands its own companions — if it does not, enlist the options explicitly, deepest-first, before their question.
>
> **If the transaction group cannot span the levels,** do not fake it. Fall back to a loop of `question.Delete()` (each atomic per Task 4) followed by `page.Delete()`, and change this task's first test to assert the weaker but honest guarantee: no question is ever left with missing options, though a refusal can still leave the page with some questions deleted. Record the shortfall in the follow-up issue from Task 8.

- [ ] **Step 4: Run tests**

```bash
cd packages/Angular && pnpm run test
```

- [ ] **Step 5: Prepare the commit** (ask first)

```bash
git add packages/Angular/src/lib/builder
git commit -m "fix(builder): delete a page and everything under it in one transaction"
```

---

### Task 6: Make reorder transactional

**Files:**
- Modify: `packages/Angular/src/lib/builder/builder-state.service.ts` (`persistQuestionOrder`, `persistOptionOrder`)
- Test: `packages/Angular/src/lib/builder/builder-state.cascade.spec.ts`

**Interfaces:**
- Consumes: `mjBizAppsFormsFormPageEntity.Questions`, `mjBizAppsFormsFormQuestionEntity.Options`, `beginStructuralChange()`.
- Produces: both methods keep their `Promise<boolean>` signatures and their "skip rows that did not move" behaviour, but persist in one transaction.

The mechanism is the one proven in `collection-reorder.spike.spec.ts`: `SetLoadedItems([])` then re-`Add` in the new order. **Never `Remove()` + `Add()`** — `Remove` queues a DELETE that `Add` does not cancel, so the moved row would be deleted on save.

- [ ] **Step 1: Rewrite the reproduction assertion**

```ts
  it('a refused reorder leaves the stored order exactly as it was', async () => {
    // WAS: 'first' and 'third' renumbered and saved, 'second' refused, and the in-memory entity
    // left holding an order the database never accepted (issue #103).
    const writes: string[] = [];
    const page = pageWithRefusingQuestion(writes);

    expect(await new BuilderStateService().persistQuestionOrder(page)).toBe(false);
    expect(writes).toEqual([]);
  });

  it('still writes only the rows that actually moved', async () => {
    // The one thing the old loop got right, and the replacement must not regress: re-sequencing
    // calls Set() with the value a row already holds, which does not dirty it, and a clean saved
    // child contributes no work to the plan.
    const writes: string[] = [];
    const page = reversedPageOfFive(writes);

    expect(await new BuilderStateService().persistQuestionOrder(page)).toBe(true);
    expect(writes).toEqual(['SAVE-GRAPH q0@0,q1@1,q3@3,q4@4']); // q2 was already in place
  });
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd packages/Angular && npx vitest run src/lib/builder/builder-state.cascade.spec.ts -t 'reorder'
```
Expected: FAIL — the old loop writes row by row.

- [ ] **Step 3: Write the implementation**

```ts
  /**
   * Re-sequence a page's questions to match the on-screen order, in one transaction.
   *
   * `SetLoadedItems([])` then re-`Add` in the new order, which is the ONLY safe way to express a
   * move: `Remove()` queues a delete for a persisted child and `Add()` does not take it back off,
   * so the intuitive `Remove(q); Add(q)` would DELETE the question being dragged. `SetLoadedItems`
   * resets the pending removals, and each `Add` re-runs the sequence across the whole list.
   *
   * Rows that did not move stay clean — `Set` with an unchanged value does not dirty a record, and
   * the save plan skips a clean saved child — so this keeps the old loop's one virtue while losing
   * its defect: a refusal halfway used to leave `DisplayOrder` matching neither the old order nor
   * the new one, with no way back.
   */
  public async persistQuestionOrder(page: PageNode): Promise<boolean> {
    if (!(await this.beginStructuralChange())) {
      return false;
    }
    const collection = page.entity.Questions;
    const reordered = page.questions.map((q) => q.entity);
    collection.SetLoadedItems([]);
    for (const question of reordered) {
      collection.Add(question);
    }
    return this.saveChecked(page.entity, 'reorder question');
  }
```

`persistOptionOrder` is the same shape over `node.entity.Options` and `node.options`, saving `node.entity` with the action string `'reorder option'`. Write it out in full rather than extracting a shared helper — the two differ in entity type, collection and message, and a generic helper over them would take more explaining than it saves.

- [ ] **Step 4: Run tests**

```bash
cd packages/Angular && pnpm run test
```

- [ ] **Step 5: Prepare the commit** (ask first)

```bash
git add packages/Angular/src/lib/builder
git commit -m "fix(builder): reordering commits as one transaction or not at all"
```

---

### Task 7: Reconcile the callers and the reproduction file

The builder component reads these return values and repairs its own tree from them. Two call sites assumed the old semantics.

**Files:**
- Modify: `packages/Angular/src/lib/builder/form-builder.component.ts` (`deleteQuestion` ~line 1172, `moveQuestion` ~line 1276, `onRemoveOption` ~line 1165)
- Modify: `packages/Angular/src/lib/builder/builder-state.cascade.spec.ts` (header comment)

- [ ] **Step 1: Fix the now-wrong comment in `moveQuestion`**

The comment at ~line 1276 says the reorder *"writes one question at a time and can fail halfway, leaving DisplayOrder matching neither the previous nor the new order."* That is no longer true and is exactly the kind of stale comment that misleads the next reader. Replace with:

```ts
      // Checked rather than discarded: the reorder is one transaction now, so a refusal leaves the
      // stored order untouched — but the ON-SCREEN order has already moved, so the author is
      // looking at something the database does not have until this is reported.
```

- [ ] **Step 2: Drop the now-redundant `persistQuestionOrder` call in `deleteQuestion`**

At ~line 1177, `deleteQuestion` deletes the question and then calls `persistQuestionOrder(page)` to close the gap. The collection re-sequences its survivors on `Remove` — but this path deletes through the entity, not through `page.entity.Questions`, so the collection still holds the deleted row. **Keep the `persistQuestionOrder` call**, and remove the stale row from the collection first so the re-sequence does not resurrect it:

```ts
  protected async deleteQuestion(page: PageNode, node: QuestionNode): Promise<void> {
    if (this.busy || !(await this.state.deleteQuestion(node))) {
      return;
    }
    page.questions = page.questions.filter((q) => q !== node);
    // The tree is the source of truth for order; persistQuestionOrder rebuilds the collection from
    // it, which also drops the deleted row.
    await this.state.persistQuestionOrder(page);
    this.selection = clearIfQuestion(this.selection, node.entity.ID);
    this.markDirty();
  }
```

Verify the same reasoning holds for `onRemoveOption` at ~line 1165; it has the identical shape.

- [ ] **Step 3: Update the reproduction file's header**

`builder-state.cascade.spec.ts` opens by saying its assertions "pass today; the fix is what makes them fail." That is now backwards. Rewrite the header to say what the file is: the regression suite for issue #103, with each test naming the behaviour it used to have.

- [ ] **Step 4: Run the full package suite**

```bash
cd packages/Angular && pnpm run test
```
Expected: 1456 + new tests, 0 failures.

- [ ] **Step 5: Prepare the commit** (ask first)

```bash
git add packages/Angular/src/lib/builder
git commit -m "refactor(builder): reconcile the callers with the transactional cascade"
```

---

### Task 8: Changeset, build gates, and follow-up

**Files:**
- Create: `.changeset/<generated-name>.md`
- Create: one GitHub issue

- [ ] **Step 1: Run every gate this branch can trip**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms/.claude/worktrees/issue-103
pnpm run build
npm run lint:distribution && npm run lint:migrations && npm run lint:ui && npm run lint:generated
cd packages/Entities && pnpm run test && cd ../Angular && pnpm run test
```
All must pass. `lint:distribution` no longer inspects `metadata/` at all (#108 retired CHECK 1 and the hash manifest), so a metadata-only change passes it with nothing to regenerate. Do **not** run `check:seed-cadence` as a PR gate — it is release-time, and it is already red on `next` for two pre-existing deltas.

- [ ] **Step 2: Write the changeset**

`patch` for `@mj-biz-apps/forms-entities` and `@mj-biz-apps/forms-ng`. The metadata change ships through the release-time consolidated sync, not a migration in this PR, so this is not a minor.

```markdown
---
'@mj-biz-apps/forms-entities': patch
'@mj-biz-apps/forms-ng': patch
---

Deleting a page or a question in the builder is now all-or-nothing, and so is reordering.

Each of those was a loop of individual `Delete()`/`Save()` calls with no rollback. Because
`BaseEntity` refuses by returning false rather than throwing, a refusal partway through left the
form in a state the product has no name for — a section two-thirds deleted, or a question live with
some of its options gone — while the builder went on showing rows the database no longer had. They
now run through owned `RelatedRecordCollection`s and commit as one transaction.

Field editing is unchanged and still autosaves per entity.
```

- [ ] **Step 3: Open the follow-up issue**


```bash
gh issue create --repo MemberJunction/bizapps-forms \
  --title "form-clone and form-blueprint-builder still hand-roll the pages/questions/options cascade" \
  --body "#103 converted \`builder-state.service.ts\` only. \`packages/Angular/src/lib/templates/form-clone.service.ts\` and \`packages/Actions/src/custom/authoring/form-blueprint-builder.ts\` both still walk pages → questions → options with per-row \`Save()\` and no transaction.

The clone path is the worse of the two: a refusal partway leaves a silently incomplete copy that the author then edits, believing it is a faithful duplicate.

Both can now use \`mjBizAppsFormsFormEntity.Pages\` / \`mjBizAppsFormsFormPageEntity.Questions\` / \`mjBizAppsFormsFormQuestionEntity.Options\`. Note before adopting \`Questions.Create()\`: \`FormQuestion.FormID\` is NOT NULL and the collection stamps only \`PageID\`, so \`FormID\` must be set from the parent page or the insert is refused."
```

- [ ] **Step 4: Prepare the commit and push** (ask first)

```bash
git add .changeset
git commit -m "chore(changeset): transactional cascade for the builder"
git push -u origin refactor/103-related-record-collections
```

Then open the PR **against `next`**, never `main`.

---

## Self-review

**Spec coverage.** Of the issue's six claimed benefits: one `Load()` per collection — *deliberately not adopted* (Task 2 rationale: it is an N+1 here and drops orphans); one transactional `Save()` — adopted for structural ops (Tasks 4–6), *deliberately not* for field edits (see "Why the scope is narrower"); automatic sequencing — adopted (Task 6); removal tracking — adopted (Tasks 4–5); child validation fan-in — **not in this plan**, and Task 8's first follow-up does not cover it either; tier-neutral/wire-transportable — inherited, unused here since the builder is client-only.

*Gap accepted deliberately:* cross-set validation ("a page needs at least one question") has no task. It needs the collections loaded, which Task 2 delivers, so it is cheap to add later — but it is a new product rule, not a refactor, and it belongs with whoever decides what the rule should be.

**Placeholders.** ONE step carries a verify-then-adjust instruction rather than final code: Task 5 Step 3's transaction-group API, whose exact entry points could not be confirmed from the `.d.ts` alone. It names the command to run and the fallback to take if a group cannot span the levels. Every other step carries real code. (Task 1's sequence-getter caveat from an earlier draft is resolved — `RelatedRecordCollection` exposes no sequence getter, so that assertion is simply omitted and `collection-reorder.spike.spec.ts` covers the behaviour instead.)

**Type consistency.** The generated class names `mjBizAppsFormsFormEntity` / `mjBizAppsFormsFormPageEntity` / `mjBizAppsFormsFormQuestionEntity` and the collection names `Pages` / `Questions` / `Options` are used identically in Tasks 1–7. `beginStructuralChange()` is defined in Task 3 and consumed in 4, 5 and 6. `builder-models.ts` needs no change, because CodeGen puts the collections on the very classes it already references.
