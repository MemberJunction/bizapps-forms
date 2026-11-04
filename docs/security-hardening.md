# Production security hardening checklist

MJ Forms accepts **anonymous internet writes**, so a production deployment's safety depends on a
handful of environment settings whose defaults deliberately favor "boots anywhere" over "locked
down". This page is the deploy-time checklist from the 2026-10 adversarial security review: every
item below is OFF or permissive by default, each for a documented reason, and every production
deployment should make an explicit decision about each one.

## Required decisions before taking production traffic

| Setting | Default | Set it to | Why |
| --- | --- | --- | --- |
| `FORMS_SESSION_HASH_SALT` | public built-in salt | a private per-environment random value | With the default salt, every stored session/IP privacy hash is dictionary-recoverable by anyone with the repo — the stored-no-raw-IP property degrades to pseudonymization theater. The server logs an ERROR on every boot until this is set. |
| `FORMS_REQUIRE_SESSION_HASH_SALT` | unset (boot degraded) | `true` | Turns the missing-salt error into a refusal to boot, so a config regression cannot silently ship hashes on the public salt. Opt-in by design (a fail-closed default would brick existing deployments), which is exactly why production should opt in. |
| `FORMS_TURNSTILE_ENFORCE_HOSTNAME` | unset (log only) | `true` once your hostnames are fully known | Without it, a Turnstile token solved on an **attacker's page** embedding your public sitekey still verifies — the code calls this "the token-farming hole". It is off by default because the expected set is derived from `MJAPI_PUBLIC_URL` + `AllowedOrigins` and may not name every host a deployment answers on; enumerate your hosts, then turn it on. |
| `FORMS_TRUSTED_PROXY_HOPS` | `0` | the real number of proxies/LBs in front of MJAPI | At `0` behind a load balancer, every IP-keyed control (completion caps, rate limits, knockout caps, upload caps) keys on the LB's socket address — one attacker exhausts the shared bucket and denies submission to **every** respondent (~20 req/min); conversely a value higher than reality hands X-Forwarded-For spoofing to callers. The once-per-process warning is easy to miss. |

## Known residual risks (accepted or tracked — know they exist)

- **Coarse read grants**: `Form Uploads`, `Form Responses` and `Form Response Answers` grant
  CanRead to the UI role with no row-level filter, so **any signed-in user of the host can read
  every form's responses and download every respondent upload** (`download.service.ts` documents
  this). On multi-team hosts this is a tenancy boundary — add row-level filters keyed on form
  ownership, or accept and communicate it.
- **Confirmation email is attacker-directed**: the on-submit confirmation falls back to any
  answer that looks like an email, so an anonymous respondent chooses the To address and the mail
  goes out branded from the org's sender. Bounded only by the per-IP completion cap (and the
  durable quota when a form sets one). Consider a per-distribution send ceiling and only sending
  when the author explicitly marks a question as the confirmation recipient.
- **Partial-row ceiling is a shared-DoS lever**: `FORMS_MAX_PARTIALS_PER_VERSION` (default
  10,000) fails closed per published version — an attacker who mints the ceiling in junk Partial
  rows breaks autosave/resume and knockout recording for every respondent of that version, and
  per-answer size is only capped when the author sets a maxLength rule. A TTL sweep of stale
  Partials and a server-side hard per-answer byte cap are the durable fixes.
- **Respondent-controlled identity links into the shared People table**: submitting a victim's
  email links the response to the victim's existing Person (create-or-link only — no overwrite),
  and unmatched emails mint junk Person rows at completion rate. Consider provenance-flagging
  Forms-created People and linking (vs creating) only on invite-addressed distributions.
- **LLM answer analysis is prompt-injectable** by respondents; blast radius is the persisted
  per-answer analysis columns shown to form owners. Keep answers delimited as data in the prompt
  template and validate output array length before persisting.

The transport-level defenses verified sound in the same review (for future auditors' reference):
SQL-literal/identifier discipline via `sql-literal.ts` + metadata-resolved identifiers, the
`1=0` Create-RLS respondent gate, `respondentSessionRefusal` + privilege-accretion scope checks,
single-waist response-ownership (`responseIsOurs`/`applyResponseIdentity`), resolve-then-verify
storage paths, per-context host-page escaping, and binding merges gated on verified respondents.
