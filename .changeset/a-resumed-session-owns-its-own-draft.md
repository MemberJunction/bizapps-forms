---
'@mj-biz-apps/forms-server': patch
---

`/remember` recognises a resumed session as the owner of its own draft.

Its guard restated the ownership rule instead of calling it, and left out the scope clause — so
after a `/resume`, where the caller's JWT names the response rather than the link and the widget
has minted a fresh `x-session-id`, an ordinary fill answered 403 and logged
`refused to remember <id>: the caller does not own it` once per resumed sitting. Nothing the
respondent could see: the client swallows the 403 and the device already holds a rotated pointer.
What operators saw was a security-shaped alarm firing in proportion to how well the feature worked.

The guard now calls `responseIsOurs`, so the equivalence its comment claimed is checked by the
compiler. The link match the design review added stays, narrowed to the caller it was written for:
a distribution-scoped JWT must still match the link the row came through, and an unknown link is
still a refusal.
