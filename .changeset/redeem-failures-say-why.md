---
"@mj-biz-apps/forms-server": patch
---

**A failed redeem on `/f/:slug` now says which failure it was.** The server-side magic-link redeem discarded every reason it was given — two bare `catch {}` around the POST and its JSON parse, and a third discard where a *successful* response carrying an explicit `errorCode` and message was collapsed into one enum member. An unreachable API, a proxy's HTML error page, a revoked token and a tripped redemption rate limit were the same 502 to the respondent and, more to the point, the same **nothing** in the log: not one line, at any level, about a request that had just failed.

That is the failure mode where it hurts most. `/f/:slug` is the anonymous public entry point, so a production failure arrives with no reproduction steps and no user to interview; the log is the whole diagnosis. Diagnosing one of these took a source read across two repositories to discover that core had been sending "Too many redemption attempts. Try again later." the entire time, and the door threw the sentence away unread.

Each failure is now logged once, by the frame that still holds the context, with the slug, the endpoint that was called, the HTTP status, and whatever core actually said. Never the raw `PublicLinkToken` and never the minted session JWT — both are credentials, and a log line is durable, shipped onward and outlives the session. A test pins that, rather than trusting a reviewer to notice.

`RedeemFailureReason` gains `redeem-unreachable` (we asked and never got a usable answer) beside `redeem-refused` (core answered and said no), so the difference survives up to the view. **Nothing a respondent sees changes**: both render the same 502 page as before. Splitting the page is the next change — a rate-limited caller should hear 429 "try again shortly" rather than "we are broken" — and it is deliberately not this one, so this fix cannot regress a respondent.

Internally the reason list is now one exported value with the union derived from it. Three hand-maintained copies of that list lived in the error-view spec, and nothing failed when one fell out of step; adding a reason without giving it a view or a test is now a broken build and a red test. Closes #140.
