---
'@mj-biz-apps/forms-server': patch
---

A rate-limited form link now answers 429 with a retry hint instead of a 502 outage page.

Core caps `/magic-link/redeem` at 20 per minute per IP and describes the refusal precisely — HTTP
429, `Retry-After`, and a body naming the reason. The respondent host discarded all of it and
rendered "We could not open this form right now", which claims the server is broken. Because the
cap is keyed by IP, the people who hit it are a classroom, an office behind NAT or a conference
wifi, not attackers. The host's own per-IP meter now gives the same sentence from the same place
instead of a second spelling. A genuinely failed redeem — revoked token, endpoint unreachable —
still renders the 502.
