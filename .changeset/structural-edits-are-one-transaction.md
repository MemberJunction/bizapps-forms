---
"@mj-biz-apps/forms-entities": patch
"@mj-biz-apps/forms-ng": patch
---

Deleting a page or a question in the builder is now all-or-nothing, and so is reordering.

Each was a loop of individual `Delete()` / `Save()` calls with no rollback. Because `BaseEntity` refuses by returning `false` rather than throwing, a refusal partway through left the form in a state the product has no name for — a section two-thirds deleted, or a question live with some of its options gone — while the builder went on rendering rows the database no longer had. A refused reorder was the same shape: some questions renumbered, one not, and `DisplayOrder` matching neither the old order nor the new one.

All three now commit through a single `TransactionGroup`: one `ExecuteTransactionGroup` round trip that the server runs inside a real database transaction. Deleting a page of three questions with two options each was ten sequential round trips; it is one. A refused reorder additionally puts back everything the author can see: the in-memory `DisplayOrder` values, the on-canvas question order, and any reorder notice that was standing before the move. Previously the entities held an order the database had rejected and the canvas kept showing it, with a band describing the consequences of a move that never happened.

**Why not `RelatedRecordCollection`, which is what issue #103 asked for.** Declaring the children as an owned collection and letting `entity.Delete()` cascade is the framework-native answer, and it does not work from a browser. Core says so in its own doc comment on `deleteGraph`: a delete graph has no remote counterpart, so on a client provider "the nodes execute in order over ordinary mutations. That is not atomic — a failure partway leaves earlier deletions committed." That is the defect this fixes, relocated one layer down. The save path *does* have a remote counterpart (`MJ.SaveEntityGraph`); the delete path does not, and `GraphQLTransactionGroup` is the only mechanism that gives the browser a real transaction across several rows.

Field editing is unchanged and still autosaves per entity 400ms after typing stops. Structural changes now drain any pending autosave before they open their transaction, so a delete can no longer race a half-typed edit on a row it is about to remove.

**One regression, accepted deliberately.** A refused transaction reports "Transaction failed to commit" rather than the specific constraint. The provider's mutation asks the server for `ErrorMessages` and then discards them, so the only detail that survives is on the throw path (a dropped connection, a rejected mutation), which is read from the group's notification stream. A less specific message about a state that can no longer happen is a better trade than a precise one about a half-deleted page.

**Pages, Questions and Options are now declared as owned collections.** `EntityRelationship.RelatedRecordCollection` metadata for the three parent/child relationships, with CodeGen emitting the typed `DeclareRelatedRecords(...)` onto the generated entities. The browser does not use them — it cannot, for the reason above — but server-side callers run where the provider *does* support entity transactions, so `page.Delete()` cascades atomically there. `form-clone` and `form-blueprint-builder`, which still walk the tree row by row, can now adopt it.
