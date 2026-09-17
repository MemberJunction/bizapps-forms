# Per-distribution AllowedOrigins — design

**Issue:** [#203](https://github.com/MemberJunction/bizapps-forms/issues/203) · **Date:** 2026-09-12

## The gap

Forms has no origin control of any kind. `grep -rn "AllowedOrigins" packages migrations` returns
nothing; `grep -rni "cors|access-control-allow-origin|allowedorigin" packages/Server/src` returns
nothing outside tests. The only origin control reaching a Forms request is MJ core's **host-wide**
`cors.allowedOrigins`, default `['*']` — all-or-nothing across every app sharing the host, and
incapable of expressing "this link may be embedded on customer A's domain".

The product ruling is that the widget embeds on customer-controlled third-party sites. That makes
the **distribution** the authorization unit, because a distribution is the thing a customer is
actually handed.

## Reproduction (2026-09-12, against the shared host on `:4000`, branch `next`)

| # | Probe | Result |
|---|---|---|
| 1 | `GET /f/gauntlet186-captcha` response headers | no `X-Frame-Options`, no `Content-Security-Policy` |
| 2 | A page served from `http://127.0.0.1:8917` framing that URL in a real Chromium | iframe loaded; form rendered and fillable |
| 3 | `POST /graphql` `PublishedForm` with `Origin: https://evil.example` | `200`, definition returned |
| 4 | `POST /graphql` `SubmitFormResponse` with `Origin: https://evil.example` | `success: true`, `FormResponse` row written |

The probe row from #4 was deleted afterwards.

## The fact that decides the design

The embed snippet this product generates is an **`<iframe>`**
(`packages/Angular/src/lib/builder/distribution.service.ts:423`). So the framed document's origin
is **ours**, not the customer's. Measured, in the same browser, by having both the top-level
customer page and the embedded widget `POST` to a local echo server:

```
{"from":"TOP-LEVEL-CUSTOMER-PAGE",    "origin":"http://127.0.0.1:8917", "referer":"http://127.0.0.1:8917/"}
{"from":"INSIDE-THE-EMBEDDED-WIDGET", "origin":"http://localhost:4000",  "referer":"http://localhost:4000/"}
```

Two consequences, and the whole design follows from them:

1. **The API can never see a legitimate embed's customer origin.** An `Origin` check on
   `SubmitFormResponse` that only consulted the author's list would refuse every real embed. What
   it *can* refuse is a caller that is neither our own page nor a declared origin — a leaked link
   replayed from someone else's page. So the API gate admits **the author's list ∪ the API's own
   origin**.
2. **`Content-Security-Policy: frame-ancestors` is the only control that can see the customer
   origin**, because the browser evaluates it against the framing ancestor. It is therefore the
   real embed control, and it goes on the respondent host page.

`Referer` is not an escape hatch: inside the iframe it is our own page too (second column above).

## Decisions

**Container: a JSON array of origin strings.** `bizapps-caliber`'s `Step.AllowedOrigins`
(`V202609021400`) holds a *keyed JSON object* because a Caliber step inherits config down a
company → step chain and a child must be able to add one origin, keep inheriting the rest, and
tombstone an inherited one with `__suppress`. A Forms distribution inherits from nothing — it is a
leaf, authored whole — so the keys would name a vocabulary with nothing to say. **The per-entry
grammar is Caliber's, unchanged**, which is what issue #203's third acceptance criterion asks for;
only the container differs, and this paragraph is the documented reason.

**NULL and empty mean unrestricted.** Every existing distribution is NULL, so nothing live changes
behaviour.

**Authored means fail-closed.** Once any origin is named, an absent or unmatched `Origin` is a
refusal, not a warning — an allowlist that admits on no-match is decorative. A consequence worth
stating: a non-browser client (curl, server-to-server) sends no `Origin` and is refused by a
restricted link. That is the intent.

**Authored-but-unusable is closed, not unrestricted.** Invalid JSON, or a list in which every entry
fails the grammar, refuses everything. An author who wrote something meant to restrict something;
falling back to unrestricted would be the worst of the three possible answers. A *partially* bad
list keeps its good entries, because dropping one entry can only ever narrow the allowlist. The
authoring path refuses the whole edit instead, so the drop never happens silently.

**No wildcards, as a refusal rather than an omission.** `*.acme.com` reads as obviously useful and
is why origin allowlists fail in practice: on shared hosting it admits `evil.acme.com`, and
implementations disagree about whether it spans schemes and ports. An author who needs three
subdomains names three origins.

**No `X-Frame-Options`.** It cannot express a list — `ALLOW-FROM` is unsupported in every current
browser — and `SAMEORIGIN` would refuse the very embeds this feature exists to permit. A browser
too old for `frame-ancestors` therefore gets no framing control, which is today's behaviour.

**What this is not.** Defense in depth behind the magic link, not a replacement for it. A
distribution's link is anonymous and multi-use by construction, so a leaked link is replayable from
anywhere until it closes; an allowlist bounds that to pages the author named. Nothing here weakens
the case for a tight `CloseAt` / `MaxResponses`.

## Scope boundaries

**The widget bundle route is not per-distribution, and cannot be.** `/forms/widget/mj-form.js` is
one static asset shared by every distribution, so there is no distribution in the request to look a
policy up on — and a `<script src>` sends no `Origin` at all (confirmed in the same probe:
`"origin":"(none)"`). The control is unrepresentable there, not merely unimplemented. Nothing is
lost: the bundle is the public, source-available widget, identical for every form, carrying no
per-link data.

**The `SameSite=Lax` resume cookie is out of scope.** `packages/Server/src/respondent-host/resume-cookie.ts:11,51`
sets `SameSite=Lax`, so the same-device resume pointer does not travel inside a cross-site embed.
Real, related, and not inside this change's blast radius: a CSP header has no effect on cookie
attributes, so this PR neither causes nor worsens it; it is named in none of the issue's three
acceptance criteria; and the fix (`SameSite=None; Secure; Partitioned`) can only be exercised over
HTTPS and removes the `Lax` property that `resume-cookie.ts` names as what makes the resume route
CSRF-safe without a token of its own. Follow-up issue.

## DG-5

`plans/FORMS_BUILD_PLAN.md:675-676` lists "iframe vs. direct-element embed default" as undecided.
Half of it is settled by what shipped: the embed default **is** the iframe, and this enforcement
model is built on that. A direct-element embed would move the control from `frame-ancestors` to the
`Origin` header, because the widget's document would then be the customer's. CDN hosting,
versioning and cache strategy remain open.
