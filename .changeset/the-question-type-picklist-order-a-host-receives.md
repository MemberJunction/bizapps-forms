---
"@mj-biz-apps/forms-entities": minor
---

Ship the `QuestionType` picklist sequences the Signature→Doodle rename deferred to a CodeGen run that
never happens on a host (#219).

`V202608301200` renamed the picklist row and deliberately skipped its `Sequence`, on the premise that
CodeGen would re-derive the whole field "on its next run". There is no next run on a host:
`mj app install` writes this app's schema into `excludeSchemas`, and CodeGen's constraint-sync query
filters on exactly that list. The rename moved the value from alphabetical slot 20 to slot 5, so
every metadata-driven `QuestionType` value list — most visibly Explorer's generated Form Question
record form — rendered `Doodle` where `Signature` used to sit, with 15 other values off by one,
permanently, on every host. (The Forms builder's own palette is hand-authored and was unaffected.)

A new migration writes all 25 rows to the order CodeGen derives, keyed on the field's natural key
with a `THROW` when it does not resolve. `question-types.spec.ts` now replays the shipped migrations
and fails if that order ever drifts again.
