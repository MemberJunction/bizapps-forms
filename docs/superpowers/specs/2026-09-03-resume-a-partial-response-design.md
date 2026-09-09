# Resume a partial response — design of record

**Issue:** [MemberJunction/bizapps-forms#138](https://github.com/MemberJunction/bizapps-forms/issues/138)
**Design revision:** 2026-09-01 (two-channel invite), artifact `86e41d60-07ef-401d-91c1-a6ad83e556c7`
**Design review:** `rkihm-BC`, 2026-09-04, traced against `next` @ `cb023c8` — verdict *"the shape is right; build it"* plus two must-fix findings, one decision flip, three should-fixes and five notes.
**Decisions locked in this document:** everything below is settled. An executor does not need GitHub.

---

## 1. Problem

A respondent who closes the tab is a stranger to their own draft. Autosave already banks progress as
`Status='Partial'` rows, but the two correlators that let the server find that row again — the
`x-session-id` header and the widget's `clientResponseId` — are minted per widget instance
(`forms-api.graphql.service.ts:91`, `mj-form.component.ts:236`) and die with the tab. Every `/f/:slug`
load redeems a fresh anonymous session, and no operation can return a draft's answers: the
`Form Respondent` role has `CanRead=false` on both response entities.

Folded in: **ownership is decided by a browser-chosen header anyone can replay.** Naming
`responseId=R1` under a fresh JWT while replaying header `S1` succeeds and overwrites R1's answers.
The header, not the JWT, is the credential.

## 2. What exists today (verified against the tree)

| Fact | Where |
|---|---|
| `/f/:slug` redeems the distribution's multi-use invite server-side on every GET | `respondent-host/redeem.service.ts`, `RespondentHostMiddleware.ts` |
| The host page is a static template + an inline boot script that reads `data-*` and mounts `<mj-form>` | `respondent-host/host-page.ts` |
| The only anonymous read is `PublishedForm` (definition only) | `public-submit/PublicFormResolver.ts:40` |
| The one ownership rule: writable when the stored owner is blank or equals the caller's header | `persistence.service.ts` — `responseIsOurs`, `refuseIfNotOurs`, `applyResponseIdentity` |
| Row selection for an upsert: owned-by-id → resumable-by-id (blank session) → session key | `submit-pipeline.ts` — `resolveExistingPartial` |
| Every lookup filters `FormVersionID`; `FormResponse` has **no** distribution FK | `response-lookup.service.ts` |
| Forms mints anonymous resource-share invites itself (core's `CreateInvite` cannot) | `magic-link/MagicLinkInviteMinter.ts`, `magic-link/token.ts` |
| Scope-filtered reads already exist for Distributions and Versions, shape `CAST(col AS NVARCHAR(450)) = '{{ScopeResourceID}}'` | `migrations/V202608131600__v0.10.x__Respondent_Grant_Hardening.sql` |
| MJ core copies `mj_scopes[].resourceId` onto `UserInfo.MagicLinkScope` and substitutes `{{ScopeResourceID}}`, empty string when absent (fails closed) | MJ `context.ts`, `MarkupFilterText` |

**Pinned core caveat:** `MagicLinkScope.ResourceType` is never populated — `RedeemInvite` passes only
`resourceId`. So one untyped claim will carry three kinds of id once #137 lands.

## 3. The design

### 3.1 One invite, two channels

A half-finished response is reopened by a **`MagicLinkInvite` whose `ResourceID` is the
`FormResponse.ID`**, `IdentityMode='anonymous'`, `Kind='resource-share'`. Redeeming it mints an
ordinary Form Respondent JWT scoped to that one response; reading and continuing the draft become
row-level-security filters. No new table, no second token format, no new endpoint family.

| | Device invite | Emailed invite |
|---|---|---|
| `MaxUses` | 1, rotated on every resume | 25, host-configurable |
| `ExpiresAt` | min(`CloseAt`, now + 15 days) | min(`CloseAt`, now + 30 days) |
| `Email` | `null` (keeps it out of the re-send match) | the address it was sent to |
| Raw token goes to | an `HttpOnly` cookie | the email body |
| Minted when | first partial save; every successful resume | respondent presses "Save and continue later" |
| Works on | the same browser profile, hosted link only | any device, hosted link only |

From the redeem onward the channels are indistinguishable: one response-scoped session, one read
path, one ownership rule.

### 3.2 Data

- **No new table.** Invites are `__mj.MagicLinkInvite` rows written by the existing minter.
- **Two columns, one migration.**
  - `FormResponse.FormDistributionID UNIQUEIDENTIFIER NULL`, FK to `FormDistribution`, stamped on
    CREATE. A response-scoped session must load the definition of the distribution it came through,
    and `JSON_VALUE(SourceMetadata)` inside an RLS filter would put authorization on a JSON blob.
  - `FormDistribution.AllowDeviceResume BIT NOT NULL DEFAULT 1` — the owner switch.
  - Legacy rows keep `FormDistributionID` NULL and are not resumable by either channel.

### 3.3 Row-level security (the only read gate)

Every predicate keeps the existing shape and is **wrapped in parentheses**, because MJ ANDs the
filter onto the caller's own predicate and an unparenthesised `OR` would bind wrong.

| Filter | Entity | Predicate | Change |
|---|---|---|---|
| Respondent Own Response | Form Responses | `(CAST(ID AS NVARCHAR(450)) = '{{ScopeResourceID}}')`, with `CanRead=1` granted | NEW |
| Respondent Own Response Answers | Form Response Answers | `(CAST(ResponseID AS NVARCHAR(450)) = '{{ScopeResourceID}}')`, with `CanRead=1` granted | NEW |
| Respondent Own Distribution | Form Distributions | existing clause `OR ID IN (SELECT FormDistributionID FROM vwFormResponses WHERE <scope>)` | EXTENDED |
| Respondent Own Form Versions | Form Versions | existing clause `OR ID IN (SELECT FormVersionID FROM vwFormResponses WHERE <scope>)` | EXTENDED |
| Create filters | all four | `1 = 0` | unchanged |

Both scope values are UUID primary keys of different tables, so a public-link session reads **zero**
response rows and a resume session reads exactly one response, its answers, and its own distribution
and version.

### 3.4 Authorization: read filter and write rule test the same fact

`responseIsOurs` takes a **caller identity** instead of a bare header string and gains one clause:

```
caller  { sessionId, scopedResponseId }
yes if  row.AnonymousSessionID is blank
   or   row.AnonymousSessionID = caller.sessionId       (the header, as today)
   or   row.ID = caller.scopedResponseId                (the new clause, from the JWT)
```

Same call sites, same function. The new read runs under the **anonymous** `contextUser`, not the
elevated one, so the database filter is the gate. `checkRespondentScope` is unchanged.

### 3.5 What the scope claim names (finding 7 — decided)

`mj_scopes[].resourceId` carries a distribution id today, a response id here, and a
`FormDistributionRecipient` id once #137 lands, in one untyped claim. **Decision: fixed-order lookup
inside Forms; no MJ core dependency.** Implemented as a pure comparison plus at most one read:

1. If the scope id equals the resolved `distribution.ID` → an ordinary public-link session. **Zero
   extra reads on the public path.**
2. Otherwise treat it as a candidate response id and look it up once (`ID = scope`, resumable
   statuses, **no version filter**). A hit is a resume session; a miss (a #137 recipient id, a stale
   id) falls through to today's behaviour.

The typed-claim core change stays a follow-up; when it lands it collapses step 1–2 into a switch.

### 3.6 The cookie

| Attribute | Value | Why |
|---|---|---|
| Name | `mjf_resume` | one cookie per form path |
| Value | the raw invite token | the server stores only its hash, as core does |
| `HttpOnly` | yes | invisible to every script on the page |
| `Secure` | yes (config-disableable for `http://localhost` harnesses) | TLS only |
| `SameSite` | `Lax` | not sent on cross-site POSTs; the resume route is CSRF-safe by default |
| `Path` | `/f/<slug>` | two forms on one host never see each other's pointer; GraphQL never receives it |
| `Max-Age` | the invite's remaining life, at most 15 days | dies with the invite |

### 3.7 Server routes

All in `RespondentHostMiddleware`, beside the existing `GET /f/:slug`. Nothing in the GraphQL layer,
the submit pipeline or the frozen `FormSubmissionInput` / `FormSubmissionResult` contracts changes.

| Route | Guards, in order | On success | On refusal |
|---|---|---|---|
| `GET /f/:slug` | as today | as today, plus `data-has-draft="1"` when an `mjf_resume` cookie is present. Presence only, no redeem — GET stays side-effect-free | as today |
| `POST /f/:slug/resume` | cookie present; distribution resolves and `AllowDeviceResume`; door predicates (open, not full); rate limit | redeem through core `/magic-link/redeem?format=json`; mint the rotation invite; rewrite the cookie; return the JWT | `410` with a reason code; never the token. **Cookie cleared only when the refusal proves the pointer is dead — never on `consumed`** (finding 1) |
| `POST /f/:slug/remember` | `AllowDeviceResume`; `checkRespondentScope`; **caller session id present**; `responseIsOurs`; row is `Partial`; row's `FormDistributionID` equals the JWT's distribution scope; **the existing cookie does not name a different live Partial**; rate limit | mint the device invite; prune this response's spent device invites; set the cookie; `204` | `4xx`, no cookie change; logged with the response id |
| `POST /f/:slug/forget` | cookie present | revoke only invites with `Email IS NULL` for that response; clear the cookie; `204` | clear the cookie regardless |

**The rule that unifies the channels:** every successful response-scoped redeem on the host — from the
cookie or from the emailed link's interstitial — ends by minting a fresh device invite and setting the
cookie, if the distribution allows it. `/remember` is the only other mint point, and exists solely
because the first sitting has no redeem to hang a mint on.

**Why the mint is not inside `SubmitFormResponse`:** the GraphQL endpoint can sit on a different host
from the page, and a cookie set there would never reach `/f/<slug>`. Cost: one extra POST after the
first partial save.

### 3.8 Page and widget

The widget stays a host-agnostic custom element that knows nothing about cookies or host routes. The
page's boot script does all the cookie-side work; the widget talks to it through three DOM events.

- **Boot on load:** `data-has-draft="1"` → POST `/resume` before mounting. `200` → mount with the
  returned JWT. `410`/network failure → mount with the distribution JWT (the respondent always gets a
  form) and pass the reason through an attribute so the widget shows one line.
- **`mjf-partial-saved` `{responseId, sessionId}`** — once, on the first acknowledged partial save →
  POST `/remember` with both, plus the JWT. (The `sessionId` is finding 2: without it `/remember`
  cannot run the ownership rule it is specified to run.)
- **`mjf-start-over`** — POST `/forget`, then reload. The reload matters: under a response-scoped
  session the pipeline would update the scoped row rather than create a new one.
- **`mjf-submitted`** — POST `/forget`.
- **Sealed is decided at mount**, from `resumeJSON.status`, never learned from a save (finding 4):
  `savePartial` ignores `res.status` and the pipeline answers a partial against a sealed row with
  `success: true`.
- **Embeds:** a page without the boot script sends none of these calls; an embedded widget behaves
  exactly as today, with no conditional code in the widget.

### 3.9 Failure handling

Two rules hold every row: **the respondent always gets a form**, and **a resume failure never harms
the draft row.**

| Situation | Respondent sees | System does |
|---|---|---|
| `/remember` fails | nothing new; autosave still says saved | logged with the response id; no cookie; the save already succeeded |
| `/resume` gets `410` expired/revoked | fresh form + "We couldn't reopen your saved answers on this device. Start fresh, or request a link by email." | cookie cleared; row stays `Partial` |
| `/resume` gets `410` **consumed** (two tabs, session restore) | fresh form + "This form is already open in another tab." | **cookie left alone** — the winner just rotated it (finding 1) |
| Owner turned device resume off | fresh form + the neutral line | `/resume` clears the cookie without redeeming; `/remember` mints nothing |
| Rotation mint fails after a good redeem | resumes normally this time | old invite spent, cookie cleared, logged; the emailed link still works |
| Emailed link expired/exhausted/revoked | "This link has expired. Enter the email you used and we'll send a fresh one" | re-send matches `Email` + `ResourceID`; identical answer for a known and an unknown address |
| Distribution closed or full, either channel | "This form closed on `<date>`; your draft was not submitted" | the door's own predicates refuse **before** redeeming; no use burned |
| Draft already sealed | the sealed screen | decided at mount from `resumeJSON.status`; the device cookie is cleared on that visit |
| Two tabs on one row | both continue; first final submit seals | `reconcileAnswers` upserts per question; `reconcileDuplicate` accepts the scope |

### 3.10 Security

`HttpOnly` closes script access; `Secure`/`SameSite=Lax`/`Path` close plaintext leak, cross-site POST
and cross-form pointer reads; `MaxUses=1` with rotation makes a stolen token visible at the owner's
next reopen; the 15-day cap tied to `CloseAt` bounds staleness; ownership from the JWT scope plus row
filters closes header replay; rate limits bound mint spam; the owner switch, start-over and
clear-on-submit cover shared devices; logs carry the response id, never the token or the address; one
neutral message for every `410` hides whether a draft exists; nothing but the token is on the device.

**Residual, stated plainly:** physical access to an unlocked device inside 15 days; header-based
ownership of the very first sitting (waits on the core follow-up exposing `mj_sid`); invite row growth
on high-volume forms — mitigated here by pruning a response's own spent device invites, with the
deployment-wide purge still a follow-up.

## 4. The review's changes, itemized

| # | Finding | What changes |
|---|---|---|
| 1 | **Must fix — two-tab race orphans the real draft.** Both tabs POST `/resume`; the loser's `410 consumed` clears the winner's freshly-rotated cookie (one cookie jar), then creates a second Partial row and points the cookie at it | `/resume` never clears on `consumed`; loser is told "open in another tab"; `/remember` refuses (409) to replace a cookie naming a different live `Partial` |
| 2 | **Must fix — `/remember` cannot run its own ownership rule.** The `x-session-id` is a private field of the widget's API service; the boot script never sees it | `mjf-partial-saved` carries `{responseId, sessionId}`; the boot script forwards both plus the JWT; `/remember` additionally requires the JWT's distribution scope to equal the row's `FormDistributionID` |
| 3 | Should fix — the scoped row must win **explicitly**, not through the duplicate-key fallback (a regex over SQL error text, a failed INSERT per autosave) — and `partialCapExceeded` counts a resumed autosave as a new draft | an explicit branch at the top of `resolveExistingPartial`; version filter dropped on that branch; the client hint ignored for row selection |
| 4 | Should fix — the widget must decide "sealed" at mount | read `resumeJSON.status` before the autosave controller is wired; start-over is the only action |
| 5 | Should fix — revoke by **resource**, not by token; scope `/forget` to device invites | `RunView` on `MJ: Magic Link Invites` by `ResourceID` + `Status='Active'`, then the minter's existing `RevokeAnonymousInvite`. **Core follow-up 4 (revoke-by-token) is deleted.** `/forget` revokes only `Email IS NULL` rows — the person pressing "Not you? Start over" is not the owner |
| 6 | Verify — core's redeem rate limit is one bucket for the whole deployment (`redeemLimiter` keys on `req.ip`; the loopback POST carries no forwarded address) | a verification step (25 rapid `/f/:slug` loads); if confirmed, forward client IP + UA on the loopback POST, which also fixes the audit rows |
| 7 | Note — typed scope claim | fixed-order lookup in Forms (§3.5); core change stays a follow-up |
| 8 | Note — re-send abuse | cap re-sends per `ResourceID` per day, not only per IP |
| 9 | Note — `SourceMetadata`/`StartedAt` rewritten on every save | keep the first sitting's `StartedAt` and `SourceMetadata`; record resumes as a count |
| 10 | Note — `CanRead` opens the generic entity query, filtered | say so in the filter's own description |
| 11 | Verified — file answers survive a resume (`evaluateProvenance` matches the adopted row id) | nothing to do |

Also verified by the review and relied on here: **question ids are stable across versions**
(`snapshot-builder.ts:173` embeds `FormQuestion.ID`), which is decision 7's precondition.

## 5. The eight decisions

| # | Decision | Answer |
|---|---|---|
| 1 | Emailed link delivery | **Explicit request with an email.** No automatic mail |
| 2 | Emailed link lifetime | `MaxUses=25`, `min(CloseAt, 30 days)`, host-configurable. Window is fixed, not sliding; re-send is the answer |
| 3 | A link opening a **sealed** response | **FLIPPED on review: revoke on submit.** Final submit revokes every `Active` invite whose `ResourceID` is the response; a later open answers `410` "This response was submitted on `<date>`". #136 mints its own edit-window link when it lands |
| 4 | Does the emailed address become identity | **No.** `Email` is a delivery address and a re-send key only; `RespondentPersonID` belongs to #137 |
| 5 | Interstitial or direct redeem on GET | **Interstitial**, and the token rides the **URL fragment** (`#resume=`) so it never reaches access logs, proxies or `Referer` |
| 6 | Device token numbers | 15 days, single use, rotated on every resume, host-configurable; `AllowDeviceResume` default on. The window **slides**; every sitting leaves an invite row plus an audit row |
| 7 | A resumed row whose version moved on | **Re-stamp `FormVersionID`** on the next save and reconcile by question id. Answers to removed questions are deleted on the first save after resume; a changed question type fails the autosave, so the widget marks the offending question |
| 8 | Same-device resume for embeds | **Not in this version.** Embeds get the emailed link only; the email copy says the link opens the hosted page |

## 6. Deliberately not built

Answers in the browser, or localStorage of any kind (repo rule 8 stays intact with no documented
deviation) · same-device resume in embeds · a Forms-owned token table · `IdentityMode='email'` invites
(they provision a real `__mj.User` per address — a respondent is not an account) · making
`x-session-id` unforgeable (needs `mj_sid` on `UserInfo` — core follow-up) · any change to the frozen
submission contracts.

## 7. Acceptance criteria

**Emailed channel**

1. `RequestResumeLink` after a partial save creates exactly one anonymous resource-share
   `MagicLinkInvite` (`ResourceID` = response id, `Email` set, configured `MaxUses`/`ExpiresAt`); the
   result contains no token.
2. Redeeming it from a second session yields a JWT scoped to the response, and `PublishedForm`
   returns `resumeJSON` with that id and the saved answers. Under an ordinary `/f/:slug` JWT,
   `resumeJSON` is null and `mjBizAppsFormsFormResponse(ID)` returns zero rows for any id.
3. A partial save from the resumed session with a new `x-session-id` updates the original row (same
   `ID`, owner unchanged, no second row); naming a `responseId` the scope does not cover is refused
   and writes nothing (SQL-verified); final submit promotes the row, counts once, fires automations
   once, and a repeat is recognised.
4. Two concurrent partial saves from two resumed sessions leave one row with each question answered
   exactly once.
5. Redemption past `MaxUses`, `ExpiresAt` or `Revoked` renders the friendly page and mints nothing; a
   re-send answers identically for a known and an unknown email; a closed distribution refuses before
   redeeming (`UseCount` unchanged); a failed send leaves a `Revoked` invite and an untouched draft.
6. Migration idempotent, `npm run lint:distribution` clean, existing suites green,
   `smoke/resume-link-path.mjs` covers happy path, refusal and exhaustion.
7. Resuming by emailed link on a device also sets that device's cookie.

**Device channel**

8. The first partial save on the hosted link creates one anonymous resource-share invite with
   `MaxUses=1`, null `Email`, `ExpiresAt` at or under min(`CloseAt`, 15 days), and the page receives an
   `HttpOnly; Secure; SameSite=Lax` cookie scoped to `/f/<slug>`; the GraphQL endpoint never receives it.
9. A new browser session presenting the cookie gets a response-scoped JWT and `resumeJSON` with the
   saved answers; the cookie is rotated and the previous token answers `410`.
10. A partial save from the cookie-resumed session updates the same row (SQL-verified).
11. Start over clears the cookie, the next load is a fresh distribution session, and the old row is
    untouched; final submit clears the cookie.
12. A closed distribution refuses before redeeming; a distribution with `AllowDeviceResume=0` mints
    nothing on save and clears the cookie on resume.
13. An embedded widget without the boot script makes none of the three host calls.
14. `smoke/device-resume-path.mjs` covers remember, resume with rotation, replay of the spent token,
    same-row write, forget, closed distribution, and the switch off.

**From the review**

15. Two tabs presenting the same device cookie: one resumes, the other reports "open in another tab",
    **the cookie is not cleared**, and no second `Partial` row is created (SQL-verified).
16. `/remember` with a cookie naming a different `Partial` response answers `409` and leaves the
    cookie unchanged.
17. `/remember` without the owning session id (header absent or wrong) mints nothing, even with a
    valid distribution JWT and a real response id.
18. A resumed session whose row is on a retired version: `resumeJSON` returns the answers, the first
    save re-stamps `FormVersionID`, answers to removed questions are deleted, every surviving answer
    is unchanged (SQL-verified).
19. A resumed widget on a sealed row never issues `SubmitFormResponse`; the only control is start over.
20. Final submit revokes every `Active` invite whose `ResourceID` is the response.
21. Re-send for one response id is refused after N per day whatever the caller address.
22. 25 sequential `/f/:slug` loads inside one minute all return 200 (guards finding 6).

## 8. Testing strategy

- **Unit (Vitest, `.spec.ts`, hand-rolled fakes — no `@memberjunction/test-utils`).** Cookie attribute
  builder. Guard order in `/resume`: a closed distribution refuses with the redeem mock never called.
  Rotation on success; clear on a dead pointer; **no clear on `consumed`**. `/remember` refusing a row
  the caller does not own, and refusing to replace a live cookie. Switch off means no mint and a
  cleared cookie. `data-has-draft` stamped only when the cookie is present. Boot-script event→route
  mapping. Scope classification. The scoped lookup branch. Prefill by question id.
- **Smoke (curl-driven, `smoke/*.mjs`, `-b` on every `sqlcmd`).** `device-resume-path.mjs` and
  `resume-link-path.mjs` per AC 14 and 6.
- **Unchanged gates.** Existing smoke suites green, `npm run lint:distribution` clean, migration
  idempotent, `npm run typecheck`, and one Playwright pass on the hosted page confirming the reopen
  actually shows the answers.

## 9. Follow-ups to log

1. **Purge exhausted and expired `MagicLinkInvite` rows deployment-wide.** Core table, so ideally
   upstream; a Forms scheduled job is the interim. This spec ships only the bounded mitigation
   (a response's own spent device invites are pruned when its next one is minted).
2. Retention for untouched `Partial` rows, which live forever while both links expire.
3. Same-device resume for embedded widgets, only if asked for — the one justified localStorage use,
   behind the owner switch, with a documented rule 8 deviation.
4. MJ core: populate `ResourceType` from the invite's `ResourceTypeID` in `RedeemInvite` + the JWT
   builder, and expose `mj_sid` on `UserInfo`. Collapses §3.5 into a switch and makes the first
   sitting's ownership unforgeable.

*(The review deleted the original follow-up "core: revoke by token" — finding 5 shows it is not needed.)*

## 10. Related issues

- **#137 per-person invitations** — shares the ownership seam and the scope claim. Once the invite is
  stamped onto the response, `responseIsOurs` generalises to "scope or invite names the row".
- **#136 edit window** — blocked by this; needs exactly this link-to-a-response identity and read
  path, and mints its own link where decision 3 now revokes.
- **#135 signed-in respondent** — the caller-identity object introduced here is where a `UserID`
  owner slots in later without inverting the scope check.
