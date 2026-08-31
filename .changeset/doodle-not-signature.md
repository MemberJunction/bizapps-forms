---
"@mj-biz-apps/forms-entities": minor
"@mj-biz-apps/forms-ng": minor
"@mj-biz-apps/forms-server": minor
---

The `Signature` question type is now `Doodle`, and stops presenting itself as a signature (#97).

The control was always a canvas that captures a freehand drawing, exports a PNG and stores it as an ordinary file answer. It has none of the apparatus a real e-signature needs — no identity verification, no content hash, no signing certificate, no audit trail of a signing event — so the name was a promise the feature could not keep, and customers would reasonably have relied on it. It ships as a drawing tool instead; real e-signature is separate work through a signing provider.

**No released version ever carried `Signature`, so no upgrader is losing anything.** The type arrived with the still-unreleased element-parity work, whose changeset is renamed here in step; the published `CHANGELOG`s stop at 0.10.0 and never mention it. What the rename does have to survive is a **dev or staging database** where forms were already built and published against it, and that is what the migration is for.

**`V202608301200` is not optional and cannot ship after the code.** `QuestionType` is persisted in `FormQuestion`, constrained by `CK_FormQuestion_QuestionType`, mirrored into the designer dropdown's `EntityFieldValue` row, and — the dangerous one — frozen into `FormVersion.DefinitionSnapshot`, which is what the public link is served from. `snapshot-parser` fails closed at three levels: a question at an unknown type makes its page `undefined`, and a page makes the whole definition `undefined`. So one unmigrated `"type":"Signature"` does not degrade to a missing field, it takes the entire published form off its public link along with every other question on it. The migration drops the constraint, moves the rows, puts the constraint back, rewrites the snapshot token and updates the dropdown row, in that order because each step blocks the next.

The snapshot rewrite targets the exact `"type":"Signature"` token and nothing else: the same JSON holds respondent-facing prompts that contain the word (`"Untitled Signature question"` is the builder's own default), and a blanket replace would rewrite an author's question text. That token has exactly one spelling because publish writes the snapshot with `JSON.stringify`, which is also why `isFormQuestionType` deliberately does **not** keep `Signature` alive as an alias — an alias with no behaviour row turns a clean fail-closed into a thrown `Unknown FormQuestionType`, and one with a row is not a rename at all.

`V202608301210` carries the same change into the AI Designer prompt, which enumerates the allowed types; left stale it would keep authoring `Signature` and every form it wrote would fail validation.

**`packages/Entities/src/generated/entity_subclasses.ts` was hand-edited**, which the repo otherwise forbids: the CHECK constraint is the value list CodeGen turns into the generated `QuestionType` union, and the rename does not compile until that union moves. It reproduces what CodeGen emits from the migrated schema — 'Doodle' sorted between 'Date' and 'Dropdown', because `syncEntityFieldValues` renumbers every `Sequence` from the sorted constraint list. **Run `npm run mj:codegen` after applying the migration and confirm the file does not change.** `question-types.spec.ts` pairs the contract to the generated file, so a CodeGen run against an unmigrated database fails the suite rather than silently reverting the rename.
