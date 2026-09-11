---
'@mj-biz-apps/forms-ng': patch
---

A question can be dragged from any section of the builder into any other section. Each section
rendered its own unconnected `cdkDropList`, so CDK had no candidate target outside the list the
drag started in and every cross-section drop was silently refused — no move, no message. The
lists are now one `cdkDropListGroup`; the drop branches on which list it came from, writes
`PageID` and renumbers `DisplayOrder` on both sections, and raises the same warning band an
in-section drag raises when the move breaks a rule. Undo returns the question to its original
section, not merely to its original index.
