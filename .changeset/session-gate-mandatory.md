---
"@mj-biz-apps/forms-server": minor
---

**A response that has an owner keeps it.** `SubmitFormResponse` accepts a client-minted `responseId`, and which lookup resolved it was up to the caller. Sending `x-session-id` went through `findOwnedResponseById`, which filters on `AnonymousSessionID` and correctly refuses another session's row. Omitting the header went through `findAdoptableResponseById`, which had no session predicate at all — its docstring said so plainly ("ownership is proven by the id itself"). So the session gate was not a gate: it was opt-in, and a caller opted out by dropping a header. A `Partial` row belonging to someone else could be adopted, sealed `Complete`, have its `AnonymousSessionID` blanked, and have its answers replaced with the caller's.

**The second route had no lookup in it at all**, which is why a check in front of the lookups could never have closed this. A caller presenting a *different* session id matches neither lookup, falls through to CREATE — and persistence adopts the supplied client id as the primary key, so the insert collides with the row already sitting at it and the duplicate-key recovery picks that row up and writes to it, having performed no ownership check of its own. The header was therefore not a gate in either direction: omitting it worked, and forging it worked.

**One gate, at the seam every write already passes through.** `applyResponseIdentity` is the only place `AnonymousSessionID` is written, and CREATE, UPDATE/PROMOTE and duplicate-key recovery all call it. A row whose stored `AnonymousSessionID` is non-empty may now only be written by that session; every other case is refused. A lookup added later inherits the check by construction rather than by remembering to repeat it, and the lookups go back to doing what they are good at — proposing a candidate row, not deciding who owns it.

**Ownership is write-once.** An adopting write no longer assigns the caller's session over an owner it did not set. That assignment is what blanked `AnonymousSessionID` on the way past and turned a takeover into a permanent one: the row stopped recording the respondent who started it, so they could never resume it even after the fact.

**The refusal tells the caller nothing they did not arrive with.** One message for every ownership failure — absent header, blank header, a different session, a session that owns some other response — so a refusal cannot be used to tell those cases apart, and it names neither the owner nor the fact that there is one. The write is refused rather than silently discarded, so the caller is no longer answered `success: true` for a submission that was not recorded. Each refusal logs the response id and form version for the operator, and neither session id.

Ownership is settled the moment a pre-existing row is loaded, before the branch that short-circuits an already-sealed response to an idempotent no-op. That branch returns the row's id and status without writing anything, which is the right answer for the respondent who owns it and a status oracle for anybody else — so a decision about a read cannot wait for the write seam.

`AnonymousSessionID` is also stored in the same normalized form the check reads it back in. Storing the raw header let the column hold a value that did not mean what it looked like: `x-session-id: '   '` stored three spaces, which reads back as "no owner" — a row that appears owned, is not, and is adoptable by anyone holding its id.

Comparison is trimmed and case-folded, to agree with the SQL predicate it backs up: `AnonymousSessionID='…'` runs under SQL Server's case-insensitive default collation, so a stricter comparison here would have refused writes the lookup had just approved.

**Nothing a real client does changes.** The widget mints its session id per instance and its client response id per form load, so a given response id is only ever presented alongside the session that created it. The genuinely headerless flow — where the row has no owner and the 122-bit client id in `SourceMetadata` is the only capability there is — keeps working exactly as before. No schema change, no migration, no new config, and no client change.
