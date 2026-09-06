---
"@mj-biz-apps/forms-server": patch
---

**A share link sitting at `Status='Draft'` no longer opens for respondents while its author is being told it is off.** `Draft` is the `FormDistribution.Status` column's DEFAULT, and `distributionWindowClosed` asked `Status === 'Closed'` — so a Draft link was served in full by `GET /f/<slug>`, minted an anonymous session JWT, and accepted submissions, while the builder's Distribute tab badged that same link **"Paused"** over the sentence *"Turned off. Anyone opening it is told the form is not taking responses."* It is the defect this module was extracted to prevent, arriving from the other direction: not a link that opens and cannot accept, but a link the author has taken out of service and that keeps taking responses anyway.

`Status !== 'Active'` is what the rest of the codebase already said. The magic-link minter refuses to mint for anything but Active (`provisioning-decision.ts`), and the builder badge has always treated Active as the only live state — the window predicate was the sole outlier, and now all three agree.

**"A Draft link has no token" was not the backstop it looked like.** The minter gates on Active but never *un*-mints, so a link that was Active once and is later set back to Draft still carries a working `PublicLinkToken` and sailed through the door on it. The state is reachable by every route that writes the column outside the builder's own create path — an import, a data fix, a seeded row seeded straight to the default.

Both gates are pinned: the door refuses a Draft link and mints no token, and `resolvePublishedDefinition` refuses it with `distribution-closed` — the submit gate's window branch had no test of its own before this, so the two halves of the shared predicate could have drifted without a red test.
