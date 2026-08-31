---
"@mj-biz-apps/forms-ng": patch
---

**A question card offers only the reorder arrows that would move something.** Both arrows were bound `[disabled]="busy"` and nothing else, so *Move up* on the first question of a section and *Move down* on the last were focusable, tabbable, clickable controls that could never do anything. No data was ever at risk — `reorderQuestion` refuses an out-of-bounds move, and `DisplayOrder` stayed contiguous — but it refused in silence, which is the part that costs: a keyboard or screen-reader user was offered a control, reached it in the tab order, activated it, and got no feedback explaining why nothing happened. Every other reorder pair in the package already disabled at its bounds — the logic editor's jump rules, the automation tab's steps, the widget's Ranking question. The builder's question card was the one that did not.

**The arrow and the guard are now one decision.** `canMoveQuestion` is the same `isValidReorder` that `reorderQuestion` refuses on, so the affordance cannot disagree with the outcome: an arrow is enabled exactly when the move it offers would land. Re-deriving "where the ends of the list are" in the template would have been a second copy of that decision, free to drift from the one that actually decides — and the drift shows up as either a dead control or a question that cannot be moved at all. The guard stays where it is regardless: drag-drop enters the same path through `dropQuestion`, which has no attribute to be disabled by.

The boundary is the **section's** — a page, in the model's own vocabulary — because that is the only boundary reordering has: every path indexes `page.questions`, and nothing moves a question to another section. A section holding a single question correctly disables both arrows.
