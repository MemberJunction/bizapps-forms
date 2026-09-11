---
"@mj-biz-apps/forms-ng": patch
---

A palette click adds its question to the section the author selected, and the canvas says which section that is.

The builder has highlighted a clicked section header since page selection shipped, but the rule that picked the destination for a new question read only the question selection — so it fell through to "the last section" every time, and the builder marked one section while writing to another. On a clean two-section form the author would create a section, click a question type and watch it land somewhere else. Closes #148.

**One rule, in one place, under test.** `targetPageFor(selection, pages)` is now a pure module (`new-question-target.ts`) rather than a private method on a component this package's node-environment vitest cannot instantiate — the same reason `builder-selection.ts` exists. Order: the selected section, then the selected question's section, then the last section.

**The destination stopped being invisible state.** The section that will take the question announces it on its header — *Adding here* when the author pointed at it, *Adding to the last section* when they pointed at a welcome or ending screen, which belongs to no section. With nothing selected there is no intent to confirm, so nothing is announced and the last section still takes it. The header renders only above a multi-section form, so a one-section form gains no new chrome, and default placement is still append-to-bottom.
