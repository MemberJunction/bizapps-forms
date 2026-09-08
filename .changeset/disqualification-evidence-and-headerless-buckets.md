---
"@mj-biz-apps/forms-server": minor
---

A disqualification says what screened them, and a blank session no longer shares one bucket

Two follow-ons to #124, both on the public submit path.

**A contentless `Disqualified` row is now readable as evidence.** A knockout's `when` group is
evaluated against the raw answer map while the answers that get stored are the rendered ones, so a
jump can fire on an answer to a question the walk hid — and that answer is dropped before
persistence, leaving a `Disqualified` row with no answers at all. `validateSubmission` lets that row
through deliberately, on the grounds that it records the screening rather than answers; `Status`
alone does not, on a form with more than one knockout screen. The disqualifying screen's id is now
stored in `SourceMetadata.disqualifiedByScreenId`, and only when the flow actually disqualified
someone. No schema change: it joins `clientResponseId` in the blob that exists for facts with no
column of their own.

**Behaviour change to note: the per-session rate-limit gate is no longer charged to callers who
sent no session.** MJ populates `sessionId` from the `x-session-id` header and leaves it blank for
any client that omits one, so every header-less caller — curl, a bespoke integration, a test
harness — hashed to a single key, and that key belonged to the tightest of the four buckets
(5/min). One script could therefore spend it and the next unrelated caller was refused with "Too
many submissions", a message about traffic that was never theirs. That is the shared kill switch
the per-IP ceilings are keyed per-caller to avoid, and a gate that cannot tell two callers apart
has no business refusing either. Those callers are now bounded by the per-address ceilings
instead, which they cannot rotate. Clients that send a real session id — the widget, and every
smoke script since `smoke/lib/session.mjs` — keep the exact bucket and cap they had. When no
address resolves either, the gate is still charged: it degrades to a per-distribution circuit
breaker, and one coarse bound beats none.
