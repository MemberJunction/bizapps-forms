---
'@mj-biz-apps/forms-entities': minor
'@mj-biz-apps/forms-server': minor
---

Ship the search-API curation, so the sixteen Forms entities stop offering every table to user search.

#232 curated which Forms entities and fields the MJ user search API may reach, but it did so in
`metadata/entities/.entities.json` only — declarative JSON that `mj app install` never reads. The
setting therefore existed on nobody's host. `V202609181845__v0.12.x__Metadata_Sync.sql` is this
release's one consolidated seed and carries it.

**What a host gets.** Search stays on for the two entities a person actually searches by name —
Forms and Form Categories, each matching `Name` with a `BeginsWith` predicate and excluding its
other columns — and goes off for the fourteen detail, run and response entities behind them. Before
this, fourteen of the sixteen were searchable, including Form Responses and Form Response Answers.

**`AutoUpdate*UserSearchAPI` is set to 0 on all sixteen, which is what holds the choice against
CodeGen.** Setting it to 0 is MJ's own documented mechanism for that. Left at 1, CodeGen's Smart
Field Identification may rewrite the flags — the entity-level one only when the entity is new to
CodeGen, the field-level ones whenever the entity gains a column. It is a schema change that
reopens the question, not every run.

One generator artifact rides along and changes nothing: a `spUpdateUserView` writing the `All Forms`
view back with the values it already has. Both earlier seeds carry one for the same reason.

The seed was generated against a database built from `migrations/` alone at MJ 6.1.1, and proved by
restoring that database untouched, applying the chain including the new file, and reading the
sixteen entities and seven fields back.
