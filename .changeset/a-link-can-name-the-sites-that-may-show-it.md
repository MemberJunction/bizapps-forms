---
"@mj-biz-apps/forms-entities": minor
"@mj-biz-apps/forms-server": minor
"@mj-biz-apps/forms-ng": minor
---

A share link can name the sites that may show it

Forms had no origin control of any kind. `grep -rn "AllowedOrigins" packages migrations` returned nothing, and `grep -rni "cors|access-control-allow-origin"` over `packages/Server/src` returned nothing outside tests. The only lever reaching a Forms request was MJ core's host-wide `cors.allowedOrigins` — default `['*']`, shared by every app on the host, and incapable of saying "this link may be embedded on customer A's domain". The product ruling is that the widget embeds on customer-controlled third-party sites, which makes the **distribution** the authorization unit: it is the thing a customer is actually handed.

`FormDistribution.AllowedOrigins` now holds a JSON array of full browser origins. Leave it empty and nothing changes — every existing link stays embeddable anywhere, which is what keeps live embeds working. Name a site and the link is fail-closed from that moment: an absent or unmatched origin is a refusal, never a warning, because an allowlist that admits on no-match is decorative.

**Enforced at the two doors an embed actually goes through, which are not the two you would guess.** The embed snippet this product generates is an `<iframe>`, so the framed document's origin is *ours*. Measured in a real browser: a `fetch` from the top-level customer page reports `http://127.0.0.1:8917`, and the same `fetch` issued from inside the embedded widget reports `http://localhost:4000` — the API's own origin. Two consequences follow, and the whole design is built on them.

`Content-Security-Policy: frame-ancestors` on `GET /f/:slug` is the only control that can see the customer's origin, because the browser evaluates it against the framing ancestor. That is the real embed control. No `X-Frame-Options` beside it: it cannot express a list (`ALLOW-FROM` is unsupported in every current browser) and `SAMEORIGIN` would refuse the very embeds this feature exists to permit.

The public API therefore can never see a legitimate embed's customer origin, so `SubmitFormResponse` and `PublishedForm` admit the author's list **plus this API's own origin** (`MJAPI_PUBLIC_URL`). What that refuses is a caller that is neither — a leaked link replayed from somebody else's page. Before this change, `Origin: https://evil.example` on `SubmitFormResponse` returned `success: true` and wrote a `FormResponse` row.

The gate sits after the distribution is resolved and **before** the rate limiter, because its verdict is a fact about the link rather than about the caller, and the pipeline's rule is that a request one gate refuses does not eat the respondent's budget in another. A mis-embedded page would otherwise burn a real respondent's window on refusals they cannot influence.

**The grammar is `bizapps-caliber`'s, unchanged**, which is issue #203's third acceptance criterion: a full origin — scheme, host, optional port — matched exactly, `http` only for loopback, and no wildcards. `*.acme.com` is *refused*, not accepted-and-ignored: on shared hosting it admits `evil.acme.com`, and an author who writes it, is told nothing, and believes they restricted something is worse off than one with no allowlist at all. An author needing three subdomains names three origins. Only the container differs from Caliber — an array, not a keyed object — because Caliber's keys exist so an inheriting step can tombstone an inherited origin, and a Forms distribution is a leaf that inherits from nothing.

An authored value that parses to nothing usable — invalid JSON, or a list in which every entry fails the grammar — refuses everything rather than falling back to unrestricted. A *partially* bad list keeps its good entries, because dropping one entry can only ever narrow an allowlist; the authoring path refuses the whole edit instead, so that drop never happens silently.

The Distribute panel's Embed view gains the editor, directly under the snippet an author is copying into the third-party page. It states the cost rather than naming the column: once you list a site, the form only opens inside the sites you list.

`minor`: ships `V202609121200__v0.12.x__Distribution_Allowed_Origins.sql`, so a host must migrate and run CodeGen. Closes #203.
