---
"@mj-biz-apps/forms-ng": patch
---

An expired session tells the respondent what happened and how to start again (#123).

The anonymous session a `/f/:slug` link mints lasts a fixed time (MJ's `sessionTokenTtlHours`,
8 h by default) and has no refresh token. Once it lapsed, every request the widget made was a
401 — and a respondent who had left a long form open was shown the bare string
`Forms API request failed: HTTP 401`, under a progress bar still saying "You can submit now.",
with a Submit that could only ever fail again and an autosave that had been failing silently
since the moment the token died. Nothing said what had happened, and nothing offered the one
thing that works.

The transport now reads the server's typed `JWT_EXPIRED` code and reports it as a
`SessionExpiredError` — the one failure the seam reports by type, because it is different in
kind: not "try again" but "this token is dead". The widget answers it with a terminal `expired`
phase: the autosave is disposed, submit is withdrawn (which also silences the ready line), the
form is made `inert` beneath a notice that says the session timed out, that nothing was
submitted, and that the answers will need entering again, with one action — Start again —
that reloads the page. Reload is the recovery because `GET /f/:slug` mints a fresh session on
every fetch; the widget obtains no token of its own, and the operator's TTL stays a bound.

Whichever request meets the expiry first — an autosave on the next keystroke, the final submit,
or a retried load — ends the fill the same way, so the respondent hears about it as soon as the
widget does rather than after answering thirty more questions. Answers autosaved before expiry
survive as a `Partial` response; there is no cross-session resume, so a fresh session starts
blank, and the notice says so rather than implying otherwise.
