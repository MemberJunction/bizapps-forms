# @mj-biz-apps/forms-core-entities-server

## 0.12.0

### Patch Changes

- c9366ea: The release runbook describes a pipeline that has now been run

  Four files still said the release had never been executed, which stopped being true on 2026-09-15
  when `v0.11.0` shipped through it. They now record that, the two defects the first run found
  (#225, #226), and what to expect next time. The "some packages published, others did not" row was
  the one actively misleading entry: npm's packument is eventually consistent and served a mixed view
  for about three minutes after `v0.11.0`, so following that advice would have triggered a needless
  re-run. It now says to wait and read the publish step's own output first.

- 899739b: Widen the MemberJunction compatibility range so Edge and 6.1.0 hosts can install MJ Forms.

  The `^6.1.1` peer range admitted no prerelease build at all — semver only accepts a
  prerelease when a comparator shares its exact major.minor.patch and carries a prerelease
  tag. A `6.1.0-edge.6` host therefore failed with ERESOLVE, which `mj app install` reports
  as an npm auth problem before finalizing the app as Disabled (#211). Plain `6.1.0` hosts
  were locked out too.

  Peers move to `^6.1.0-edge.6` and `mjVersionRange` to `>=6.1.0-edge.6 <7.0.0`. This is a strict
  widening: every host that could install before still can, plus 6.1.0 itself and 6.1.0 Edge
  builds from `edge.6` onward. The era boundary is unchanged — MJ's installer coerces a
  prerelease host to its base tuple, so a 7.0.0-edge.0 host still correctly fails the
  `<7.0.0` cap.

  The `edge.6` floor was verified by checking all 74 imported `@memberjunction/*` symbols
  against the real `6.1.0-edge.6` typings — an API-surface check, not a compile.

- Updated dependencies [ec8b090]
- Updated dependencies [c9366ea]
- Updated dependencies [899739b]
  - @mj-biz-apps/forms-entities@0.12.0

## 0.11.0

### Minor Changes

- 29789ba: A respondent can reopen a half-finished form, and the server — not a replayable browser header — decides whose draft it is.

  Autosave has always banked progress as `Partial` rows, and nobody could ever get one back. The two things that let the server find that row again, the `x-session-id` header and the widget's `clientResponseId`, are minted per widget instance and die with the tab; every load of `/f/:slug` redeems a fresh anonymous session; and the `Form Respondent` role held no read at all on the two response entities, so no operation could return a draft's answers even in principle. A respondent who closed the tab was a stranger to their own work. Folded into the same change: ownership of a draft was decided by a header anyone could replay — naming a `responseId` under a fresh session while replaying somebody else's `x-session-id` succeeded, and overwrote their answers. Progresses #138.

  **The resume credential is a magic link whose resource is the response.** Not a new table, not a second token format, not a new endpoint family: a `MagicLinkInvite` with `IdentityMode='anonymous'`, `Kind='resource-share'` and `ResourceID` set to the `FormResponse`. Redeeming it mints an ordinary Form Respondent session scoped to that one row, so reading the draft becomes row-level security and continuing it becomes one extra clause in the ownership rule that already existed. Every property that makes core's magic links safe — hash-only storage, atomic use counting, expiry, revocation, an audit trail — arrives with it rather than being re-implemented next to it.

  **The read filter and the write rule now test the same fact.** `responseIsOurs` takes a caller identity (`{ sessionId, scopedResponseId }`) instead of a bare header string, and answers yes when the row is unowned, when the caller is its owner, or when the caller's _verified_ session scope names the row. That third clause is what makes resume possible at all — a second sitting mints a new `x-session-id`, so the row's owner column names a session that no longer exists anywhere — and it is deliberately the same predicate the database applies: the new `MJ Forms: Respondent Own Response` filter is `ID = {{ScopeResourceID}}`, and so, in TypeScript, is this. The two cannot disagree about which row a session may touch.

  **`PublishedForm` gained one nullable field, `resumeJSON`.** It carries the draft a scoped session may continue — the row's id, its status, the version it was created on and its stored answers — and it is null for an ordinary public-link session, whose scope is a distribution id and therefore matches no response row under the filter. The read runs under the ANONYMOUS context user rather than the elevated one, which is the point: the database is the gate, so a misconfigured grant yields no resume rather than somebody else's answers. The frozen `FormSubmissionInput` / `FormSubmissionResult` contracts are untouched.

  **The scoped row now wins explicitly, and that fixes a bug nobody had noticed.** A resumed save missed all three of the pipeline's existing lookups — every one pins `FormVersionID`, and the owner column still names the first sitting — fell through to CREATE at the row's own id, collided on the primary key, and was rescued by the duplicate-key recovery. That path works, and depending on it would have been wrong twice: it decides whether a failure was a collision by running a regex over the driver's error text, and it issues a failed INSERT on every autosave. It also silently broke the per-version draft ceiling, which counts a save as a NEW draft whenever no existing partial was resolved — so a resumed autosave, which adds no row, was refused outright on a saturated form. There is now one branch at the top of `resolveExistingPartial`: if the caller carries a response scope, that row is the row, on any version.

  **A draft survives its form being republished.** The scoped lookup drops the version filter deliberately, so a typo-fix republish under an open draft no longer strands it; the first save afterwards re-stamps the current version and reconciles answers by question id. The widget puts back only the answers whose question still exists and whose stored value round-trips into its control, and says how many it could not — because the alternative is invisible in the worst way: a value a control silently rejects leaves the field blank, and a value in the wrong column fails server-side validation on every autosave from then on, with autosave being fail-soft and nothing on screen saying so.

  **Same-device resume, without putting anything but a pointer in the browser.** After the first acknowledged partial save the page asks the host to remember the draft; the host mints a single-use invite and returns its raw token in an `HttpOnly; Secure; SameSite=Lax` cookie scoped to `/f/<slug>`. No answers on disk, no `localStorage` anywhere, and the GraphQL endpoint never receives the cookie at all. Every resume rotates the token, so a stolen pointer becomes a visible failure at the owner's next reopen rather than a silent, lasting read. Three routes carry it — `POST /f/:slug/{resume,remember,forget}` — with the page's boot script doing all the cookie-side work: the widget stays a host-agnostic custom element that knows nothing about any of it, which is also why an embedded widget (a page with no boot script) behaves exactly as it did before.

  **Two defects found in design review, fixed before the code was written.** _A second tab must not orphan the real draft._ Both tabs POST `/resume` with the same single-use pointer; core's compare-and-swap lets one win and the other gets `410 consumed`. Clearing the cookie on that refusal — which is what "clear on any failure" would do — discards the pointer the WINNER has just rotated, because there is one cookie jar per browser profile. The loser then starts a second draft, the next reopen resumes that one, and the real draft is orphaned. So a consumed pointer never clears the cookie, is reported as "this form is already open in another tab", and `/remember` additionally refuses to replace a pointer that names a different, still-live draft. _And `/remember` cannot mint on a bare response id._ The only ownership proof a first sitting has is the `x-session-id` header, which lives inside the widget's API service and was invisible to the page — so the widget now announces both correlators, and the route refuses without the session id and without a distribution that matches the caller's own scope.

  **Sealing a response retires the links that could reopen it.** The design originally left an emailed invite Active so a submitted response stayed readable; review flipped it, and rightly — an Active bearer sitting in an inbox for another 30 days is disclosure the moment that mail is forwarded. Every terminal status revokes, `Disqualified` included. Revocation is by RESOURCE rather than by token, which also deleted a follow-up the design had logged against MJ core: every invite for a response carries it in `ResourceID`, so listing them and using the minter's existing `RevokeAnonymousInvite` needs no core change. `/forget` is narrower on purpose — it revokes only invites with no email, because the person pressing "Not you? Start over" on a shared device is by definition not the owner, and letting a stranger kill the owner's emailed link would lock them out of their own draft.

  **Two columns and four row filters ship in one migration.** `FormResponse.FormDistributionID` (a real FK, stamped once on create, because a row filter must not put authorization on a JSON blob) and `FormDistribution.AllowDeviceResume` (the owner's switch, default on, for kiosks and shared devices). Two new filters grant the anonymous role a scope-filtered READ on the two response entities — the first time it has held one — and the two existing filters gain a clause so a resumed session can reach the distribution and version its own draft belongs to. Every predicate is parenthesised, because MJ ANDs a row filter onto the caller's own and an unparenthesised `OR` binds wrong. The migration asserts its own end state: both grants present and filtered, and no unfiltered grant left on any Forms entity for that role.

  **Operators should expect this**: nothing changes for a form until the migration is applied. After it, links get same-device resume by default; turn it off per link with `AllowDeviceResume`, or host-wide with `FORMS_DEVICE_RESUME_ENABLED=false`. `FORMS_DEVICE_RESUME_DAYS` (15) sizes the pointer, and `FORMS_RESUME_COOKIE_SECURE=false` exists only for a host serving the respondent page over plain http. A submitted response's resume links are revoked at submit, so a link opened afterwards will refuse rather than show the sealed answers.

  **Still to come on this issue**: the emailed resume link (`RequestResumeLink` and its interstitial), which lets a respondent continue on a different device. The server-side identity, the read path and the ownership rule it needs are all in this release; what is missing is the mutation, the message and the page that redeems it.

- 89ca16f: A share link's magic-link credential is now withdrawn when the link is, and can be reissued without changing the URL.

  The credential outlived the thing it authorised. A distribution's `MagicLinkInvite` was minted once and then never written again — pausing, closing or setting a link back to Draft stopped **Forms** honouring it and left the invite `Active`, `ExpiresAt` roughly a century out, `MaxUses` a million, with no way to rotate a token whose URL had leaked short of deleting the distribution and losing the slug. Nothing was exploitable: the session JWT is scoped to its own distribution, and after #90 all three Forms gates refuse a link that is not `Active`. What was wrong is that the protection was one layer deep, and that layer had failed twice in a fortnight in the same file (#81, and the `Status='Draft'` case in #90). Closes #104.

  **One invariant, on the writer-agnostic seam.** A distribution that is a live, linkable public channel holds exactly one live credential; anything else holds none. `decideProvisioning` is now a function of the distribution's current state rather than of a mint-once flag, and `FormDistributionEntityServer` restores it after every `Save()` — so a link closed by an Action, an import or the public submit path revokes too, with no transition to detect and no old value to read. A raw SQL `UPDATE` reaches no entity object and so triggers nothing at the moment it runs; what the state function buys there is that the next save of that row restores the invariant regardless, where a transition function would have missed it permanently. Revocation writes MJ core's own `MagicLinkInvite.Status='Revoked'`, which `evaluateInvite` rejects ahead of every other check and the atomic consume `UPDATE` excludes by matching only `Status='Active'`; core ships that state machine but no method to drive it, so the seam that already owned minting (`IAnonymousMagicLinkMinter`) gained `RevokeAnonymousInvite` beside it.

  **Reissue needed no new mechanism.** "Holds a credential" means the invite id AND the raw token, so clearing `PublicLinkToken` on a live link reads as "holds none, warrants one" — the old invite is revoked and a replacement minted in the same save, under the unchanged slug. That is the builder's new **Reissue link** control, and equally an import's or a data fix's. A link that stays `Active` throughout is not touched at all: no churn, and existing URLs keep working, because `/f/:slug` resolves the token at request time rather than carrying it.

  **Two failure directions, chosen deliberately.** A revocation that fails leaves the credential LINKED and retries on the next save — unlinking one we could not kill would orphan a live invite nothing references. A mint that fails leaves the link credential-less, which the builder badges "Not ready" with its existing one-click fix. And a mint that returns no raw token is now a failure rather than a partial success, because a tokenless invite is a dead `/f/:slug` link that would also re-trigger the reissue path on every save.

  **The expiry now keeps up with the date it mirrors.** It was set at mint and never revisited, so moving or clearing a link's closing date afterwards left the credential expiring on the old one — and the builder's own "Remove the expiry" fix produced a link badged Live whose token core refused. Every save of a live, credentialled link re-bounds its invite, writing only when the value actually moved. That pass is the reason the no-expiry sentinel is now a fixed instant (`9999-12-31`) rather than `now + 100 years`: a relative sentinel never compares equal to itself, so the pass could not tell "already unbounded" from "needs changing" and would have walked every unbounded invite's expiry forward on every save. The fixed one also reads as what it is, where `2126-08-28` looked like a century somebody had chosen.

  `resolveExpiry` takes the EARLIER of the link's `CloseAt` and any host-wide `FORMS_MAGICLINK_EXPIRY_HOURS` ceiling; the ceiling used to win outright, which let a 30-day ceiling keep a credential alive for a link that shut on Friday. A short _default_ was considered and rejected: nothing on the distribution records the credential's expiry, so a link would go dead while the builder still badged it Live — the credential dying with the link is what removes the century's sting, not a smaller number. `MaxUses` stays at 1,000,000 for the same reason and it is now written down where the constant lives: it counts page opens rather than submissions, `MaxResponses` is the real quota and is enforced at submit, and any lower cap would lock respondents out invisibly.

  Deleting a distribution revokes its credential too. Without that the invariant survived every state change except the one that ends the record — and delete-and-recreate was the pre-#104 recourse for a leaked link, so it is the path most likely to be used on a credential someone wants dead. The delete runs first and the revocation follows it, because refusal is the common case here (`FormUpload.DistributionID` is a required FK) and revoking first would kill a live link's credential every time a delete was bounced.

  In the builder, `Paused` now outranks `Not ready` in the share-state cascade, because a paused link legitimately has no token by design; leading with "Not ready · Issue the link" would offer a button as the cure for a switch the author turned off themselves. Pausing, reopening, issuing and reissuing all re-read the record afterwards, since each makes the server write the credential in a second save this client never sees.

  **The credential columns are server-owned, and now enforced as such.** Both ride the generated GraphQL update input and MJ's client sends every writable field, so a builder tab holding a record from before a rotation wrote the OLD pair back on its next ordinary save — silently reverting the rotation, leaving the link badged Live on a token that no longer redeems and the replacement invite `Active` with nothing referencing it. `MagicLinkInviteID` is now never honoured from a client, `PublicLinkToken` may only be CLEARED (which is the reissue request), and a credential supplied on CREATE is stripped. The minter additionally refuses any invite whose `ResourceID` is not the distribution asking — the scope the mint already recorded — so a hand-run `UPDATE` cannot point one link at another's invite and have it revoked by the next save, including the save the public submit path performs under the elevated system user.

  **The host lifetime ceiling is anchored to the credential's issue instant.** `FORMS_MAGICLINK_EXPIRY_HOURS` is a duration, and the re-bounding pass resolved it against `now` — a different answer on every save, so it rewrote the invite every time and walked the expiry forward forever, leaving a ceiling that bounded nothing. `SetAnonymousInviteExpiry` now takes the BOUNDS rather than an instant and resolves them against the invite's own `__mj_CreatedAt`, which only the implementation holding that row can do. Measured against a live server: 3.8 seconds of drift over three unrelated saves before, a single 3 ms settle onto the row's instant and then nothing after.

  **A failed unlink is reported apart from a failed revoke** in the runner's outcome and its log, because for the reissue flow they are opposites: one means the leaked token may still redeem, the other that it is dead and only the record's copy is stale. The BUILDER cannot tell them apart, and no longer pretends to — the two leave identical columns, so every surface built on the record says only that the withdrawal is not confirmed. That is the strongest claim those facts support, and it is true in both.

  **A second review round found four more, each pinned with a failing test first.**

  _The backfill trusted the pointer it was written to distrust._ All three of `V202608302210`'s `UPDATE`s joined `MagicLinkInvite` to `FormDistribution` on `MagicLinkInviteID` alone — the writable, FK-less column whose untrustworthiness is the entire argument for the minter's `ResourceID` check, on exactly the population that predates the hook enforcing it. A closed distribution pointing at a live one's invite had that live credential revoked and only the closed row's columns cleared, leaving the live link holding both halves of a dead credential: `decideProvisioning` reads that as `current` and never re-mints, `shareState` badges it "Live", and no later save repairs it. A permanently dead public link caused by the repair. Reproduced against a real database, fixed by re-deriving the scope from `MagicLinkInvite.ResourceID` in all three statements, and re-verified on the four cases the migration exists for.

  _The "Open to responses" switch read half the question and then acted on the other half._ Its on/off state came from `Status === 'Active'`, but open means `Status='Active'` AND `IsActive` — the pair the server requires and `openForResponses` writes. On the exact row shape `openForResponses` was written to repair, the switch rendered ON beside a "Paused" badge and its handler, sharing the half-predicate, decided the link was already open and CLOSED it. The predicate is now one exported function, `isOpenToResponses`, which the badge, the switch and the handler all ask. A test was asserting the defect — it permitted exactly two `link.Status` reads "where it is the actual control" — which is how this survived; the allowance is gone.

  _A paused link claimed its token had been withdrawn without checking._ Revocation is fail-soft by design — the save returns `true` whether or not the invite could be written — so a green close and a still-redeemable token are indistinguishable from the client, and at the time this was written a host that did not grant Update on `MJ: Magic Link Invites` got the second every time (fixed below, #114). The badge asserted the first anyway. The record carries the answer, because the server leaves the credential linked precisely so the next save retries: `credentialMayStillRedeem` names that signal, the paused detail now says which case it is, and turning a link off warns when the withdrawal did not land, the way issuing and reissuing already warned when a mint did not.

  _Three tests were asserting against signatures that do not exist._ Every package excludes `**/__tests__/**` from `tsc`, and vitest transpiles without type-checking, so a spec calling `RevokeAnonymousInvite('   ', user)` — the pre-`AnonymousCredentialRef` signature — compiled, ran, and passed for the wrong reason. Two more were mis-typed the same way. Fixed. The missing gate was first filed rather than added, on the claim that closing it repo-wide needed "five" pre-existing errors fixed in unrelated specs; the real number, measured, was **seventy** (Entities 3, Server 32, Angular 35, none in the two packages this branch is about). Both the errors and the gate ship in this release — see below.

  **Closing a link no longer requires the person closing it to be a Developer (#114).** `MJ: Magic Link Invites` is a CORE entity, and no Forms seed touches its permissions — on a stock database only `Developer` and `Integration` hold Create/Read/Update. Every credential write is driven by an ordinary save of a `FormDistribution`, and until now they ran as whoever saved it. So on the ordinary least-privilege shape — an author with full rights on the links they own and nothing on core's magic-link table — `BaseEntity.Load` threw on Read before the revoke was even attempted, provisioning is fail-soft by design, and pausing a link returned green with the token still redeeming. The defect #104 exists to remove, surviving intact on precisely the deployments careful enough to build a narrow role. Minting failed the same way one permission over, so such a host could not publish a working link at all.

  The fix is not a wider grant. The invite is the APPLICATION's row: not one field on it comes from the caller, and the caller's authority has already been spent — and checked by MJ — proving they may write the distribution it belongs to. Requiring a second permission on an unrelated core entity is an implementation detail leaking into the operator's access model, where it corresponds to no decision they actually make; and a grant broad enough to work would let any form author revoke another app's magic links, since the shipped seed carries no row scoping on that entity. So `MagicLinkInviteMinter` now resolves the identity it writes under exactly the way MJ core's own `MagicLinkService` does for the same table — `magicLink.contextUserForProvisioning`, then `userHandling.contextUserForNewUserCreation`, then an Owner — and falls back to the caller when none of those resolve, which is what it did before and therefore never worse. The ROW still records the author in `CreatedByUserID`: that is the audit trail, and core's redeem path fails closed on it, refusing every outstanding invite of a deactivated inviter.

  `pnpm run smoke:credentials:least-privilege` is the proof. It seeds the author such a host would have, drives the ordinary builder operations as that user against a real booted server, and asks core to redeem the token afterwards — with the same operations run as System beside each one, so a failure names the principal rather than the mechanism. Sixteen assertions; before the fix the four that matter were red, including a paused link whose token still redeemed with HTTP 200.

  **Version bump is `minor` because this ships two migrations**, neither of which changes the schema.

  `V202608302200` is documentation only, and `@mj-biz-apps/forms-entities` is in the bump list for it: the corrected description reaches TypeScript through CodeGen, so both `entity_subclasses.ts` and the GraphQL `@Field` description in `generated.ts` change with it. Without that bump the migration would fix the database while the published packages went on telling an integrator that clearing `PublicLinkToken` means nothing — the two-copies-out-of-step condition this migration exists to end, one layer up.

  `V202608302200` corrects what the database says. It corrects `FormDistribution.PublicLinkToken`'s column description, which asserted the exact behaviour being replaced ("Written once after a successful mint and left unchanged thereafter") and is the one place a non-builder writer would look to learn that clearing it now means "reissue".

  `V202608302210` retires the credentials minted before a link could lose one, in three guarded, idempotent `UPDATE`s. The lifecycle hook restores the invariant on every _save_, and nobody saves a link they closed last month — so without this, every already-paused and never-published link on an existing install keeps a redeemable invite until something happens to touch its row. `Active` invites whose distribution is not open for responses go to `Revoked`; those distributions have both credential columns cleared; and a live link whose closing date is already set has its invite's expiry pulled back to it. Invites already `Consumed` or `Expired` are left alone, because overwriting how they ended would claim an operator action that never happened — and the clearing step is restricted to links that are not open for responses, because a LIVE link pointing at a revoked invite is an operator's deliberate kill (core calls that status "the primary revocation mechanism", and before this release it was the only way to stop a leaked Forms link without losing its slug). Clearing those columns would have revived it: the hook reads a live link holding no credential as "mint one".

  **One configuration change becomes destructive, and it did not used to be.** `FORMS_MAGICLINK_CHANNELS` was a mint GATE: narrowing it stopped new links of that channel getting a credential and left existing ones alone. It is now read by a state function, so a channel dropped from the list is a channel whose live links are no longer warranted — and the next save of each revokes its credential, including the save the public submit path performs to bump `ResponseCount`. That is the correct reading of the invariant and it is what makes the config meaningful rather than advisory, but it means narrowing the list retires working links rather than merely declining to make new ones. Widen-only is the safe direction; narrowing wants the same care as pausing the links by hand.

  **One population the backfill deliberately does NOT reach: invites whose distribution was already deleted.** `V202608302210` joins `FormDistribution`, so a credential whose link no longer exists is never matched — and that is exactly the corpus delete-and-recreate produced before this release, when deleting was the only way to kill a leaked link. Running the new end-to-end smoke against the shared development database found sixteen such rows, the newest predating this branch, every one still `Active` with a century-long expiry and nothing in any UI that shows them.

  They are left alone on purpose rather than by oversight. Nothing in SQL can tell a Forms orphan from another app's: `MagicLinkInvite.ResourceID` names a row that is gone, and `ResourceTypeID` — the column that would identify the owning entity — is NULL on every `Kind='resource-share'` invite on that host, because the minter resolves it best-effort and no `ResourceType` row is registered for Form Distributions. A cleanup step matching orphaned resource-share invites would therefore revoke `bizapps-common`'s and `bizapps-tasks`' credentials too, on any host that shares the schema. That is precisely the "re-derive the scope, never trust a bare pointer" rule the commit above this one exists to enforce, so the backfill honours it rather than making an exception for its own convenience.

  The exposure is small and worth stating exactly: such an invite still redeems, but the session it mints is scoped to a distribution id that resolves to nothing, so every Forms gate refuses it. It is a standing grant of the restricted `Form Respondent` role with nothing reachable behind it — not a route into anybody's data, and not something this release can close without a way to prove ownership. Registering a `ResourceType` for Form Distributions would give future invites that proof; it is metadata, which is release work, and is filed rather than smuggled in here.

  **Operators should expect this**: a link that is currently paused or closed will be issued a NEW token the next time it is turned back on, and its previous token stops working on upgrade. A live link that already has a closing date will have its credential's expiry pulled back to that date. A live link whose invite was revoked by hand is left exactly as it is. The web address is unchanged in every case, so nothing already printed or embedded breaks.

### Patch Changes

- 3fa29bf: Move MemberJunction to `6.1.0-edge.5`

  `6.1.0-edge.5` is the current `edge` dist-tag, three releases past the `6.1.0-edge.2` this repo was
  pinned at. All 54 `@memberjunction/*` specifiers move together — the exact `dependencies` in
  `apps/MJAPI`, the exact root `devDependencies` and `pnpm.overrides`, and the caret `peerDependencies`
  floors in all five packages. They move as one because a single stale pin forks the dependency graph,
  and under pnpm that surfaces as a build failure rather than a silent duplicate.

  `mj-app.json`'s `mjVersionRange` moves to `>=6.1.0-edge.5 <7.0.0`. **This is the part a host has to
  act on**: `mj app install` validates that range against the installed MJ, so a host still on
  `6.1.0-edge.4` or below is now refused rather than installed into. Hosts already running our sibling
  Open Apps are unaffected — `bizapps-common` and `bizapps-tasks`, both hard dependencies of Forms,
  declare the same floor.

  Nothing in Forms' own source needed to change: a forced rebuild against edge.5 compiled all five
  packages with no type errors, and all 2,952 tests pass. No respondent-facing or API-facing behaviour
  differs.

- 75906b8: The CodeGen-append gate checks a main-bound ref against `next`, not against `main`

  A pull request into `main` is a release or a back-merge, and its base is `main` — hundreds of
  commits back. The gate's banner rule applies only to files the diff adds, so against that base every
  migration merged since the last release read as newly added, and the four that predate the gate
  relit. It is a required check with no bypass, so the release pull request would have opened and
  stalled. The base is now resolved from the branch the ref is aimed at; a hotfix committed straight
  onto `main` still owes its CodeGen output and still fails.

- d0ac9e2: `Prepare a release` pushes as the App again, not as `github-actions[bot]`

  `actions/checkout` defaults to `persist-credentials: true`, which writes an
  `http.https://github.com/.extraheader` entry carrying `GITHUB_TOKEN` into the local git config.
  That header matches every github.com remote — including the one whose URL carries the App token —
  and outranks URL credentials, so the release branch was pushed as `github-actions[bot]`. The job
  holds `contents: read` by design, so the push was refused with a 403 that named neither credentials
  nor the cause. The checkout no longer persists a credential. `publish.yml` is deliberately left
  alone: it pushes the release tag through `origin` and needs the persisted one.

- 42819f3: The respondent page and the public asset read are transferred compressed, like everything else MJAPI sends.

  MJServer mounts `compression()` at `index.ts:1129`, long after it collects the routes contributed through `ConfigureExpressApp` at `index.ts:824`, and Express dispatches layers in registration order — so both routes finished their responses before the compressor could wrap `res.write`. `GET /f/:slug` went out as ~9 KB of uncompressed HTML to every respondent who opened a shared link, however much gzip and brotli their browser had offered, on the phones and cellular connections this product is built for. It compresses to about 47% of that. This is the same defect #121 fixed for the widget bundle; both routes were scoped out of that change on purpose and are finished here.

  **Both routes moved to `GetPreAuthMiddleware`, the slot the base class documents as running "after compression but before OAuth/REST/GraphQL routes".** A handler in that slot has no route pattern, so each route now matches its own path — and the rules Express's router applied are not obvious ones to re-derive: the literal is case-insensitive, exactly one trailing slash is tolerated, and the `:param` arrives percent-decoded. Those rules live in one place (`http/route-match.ts`) shared by all three routes that need them, pinned to a table probed case by case against a live Express app, because a move that quietly narrows a public URL sends a respondent to MJAPI's authenticated routes and a bare 401 that nothing explains.

  **The asset half saves nothing on a default host, and is taken anyway.** `FORMS_ASSET_ALLOWED_TYPES` defaults to PNG, JPEG, GIF and WebP; `mime-db` marks all four incompressible, so `compression.filter` was never going to encode them in either slot. The defect is the registration slot rather than the payload — an operator who adds `image/svg+xml` to the allowlist would otherwise inherit the bug with no sign of it, and leaving one route in the broken slot would preserve the trap for whoever next asks why the respondent path is slow.

  **Operators should expect one behaviour change beyond the bytes.** Pre-auth contributions are mounted as one ordered chain, so these routes are no longer ahead of every other pre-auth handler — they are behind them, including MJ's global `RateLimitMiddleware` (off by default). A host that switches rate limiting on will see the respondent page and form images counted, where they were previously exempt. That is the right posture for public unauthenticated routes, but a respondent refused there sees an error page or a broken image rather than a rate-limit explanation.

  Also fixed, same root cause: `POST /f/:slug/resume` never saw the globally mounted request-identity handler either, so its rate limit keyed on the form's slug instead of the caller — one bucket every respondent of a link shared, which a single caller could spend. It now keys on the resolved peer, as the page route already did.

- Updated dependencies [29789ba]
- Updated dependencies [925087e]
- Updated dependencies [7293c62]
- Updated dependencies [ff19377]
- Updated dependencies [ea001c3]
- Updated dependencies [3599074]
- Updated dependencies [11a838e]
- Updated dependencies [4831864]
- Updated dependencies [9eb264b]
- Updated dependencies [1bc7aa3]
- Updated dependencies [5935085]
- Updated dependencies [3a4b449]
- Updated dependencies [88143e7]
- Updated dependencies [d117a59]
- Updated dependencies [89ca16f]
- Updated dependencies [89f4c0a]
- Updated dependencies [3fa29bf]
- Updated dependencies [396d4b5]
- Updated dependencies [1b0f56a]
- Updated dependencies [126662f]
- Updated dependencies [30f73d3]
- Updated dependencies [3e67383]
- Updated dependencies [48c0f45]
- Updated dependencies [64b6385]
- Updated dependencies [8299fed]
- Updated dependencies [a8e8a1d]
- Updated dependencies [75906b8]
- Updated dependencies [d0ac9e2]
- Updated dependencies [42819f3]
- Updated dependencies [912164c]
- Updated dependencies [3de26d8]
  - @mj-biz-apps/forms-entities@0.11.0

## 0.10.0

### Minor Changes

- f01e810: Harden the `Form Respondent` role's entity grants, and make the 0.8.0 metadata seed installable
  on a database where that role already exists (#39).

  **Security.** The 0.8.0 seed created all nine of the role's permission rows with every row-level
  security filter column explicitly NULL. Because MJ publishes a generic `Create<Entity>` mutation
  for every entity and treats a null `CreateRLSFilterID` as exemption from create-time RLS, the
  `CanCreate` grant that exists only to satisfy forms-server's `checkRespondentScope` gate doubled
  as direct write access that never entered the submit pipeline — past Turnstile, the rate limiter,
  the `MaxResponses` quota, field validation and the distribution's open/close window, all of which
  live only there. And because one shared anonymous principal backs every respondent, the unfiltered
  reads were instance-wide: any respondent to any form could enumerate every `FormDistribution` row,
  `PublicLinkToken` included.

  A new migration attaches a deny-all create filter to both response grants and scope filters —
  keyed on the distribution the session's own magic-link invite names — to the Form Distributions and
  Form Versions reads. Nothing legitimate is lost: the scope check reads only the `CanCreate` flag,
  and every real response write is performed by the elevated system user.

  **Five grants removed, not filtered.** No anonymous code path has ever read Forms, Form Questions,
  Form Question Options, Form Pages or Form Styles — `resolvePublishedDefinition` reads only
  Distributions and Versions, and the published version's `DefinitionSnapshot` already embeds the
  questions, options, pages and style tokens. Those grants were removed. **If you have built
  anything that reads those entities under an anonymous respondent session, it will stop working**;
  it needs a scoped grant of its own.

  **Installability.** The seed's two `spCreateRole` calls were blind INSERTs against a table whose
  `Name` column is UNIQUE, so 0.8.0 halted the migration chain with `Msg 2627` on any database where
  `Form Respondent` already existed — which is every host that installed bizapps-caliber first. Both
  creates are now adopt-or-skip by name, and every reference to either Forms role resolves the id by
  name rather than assuming the canonical UUID.

  Co-installation with bizapps-caliber (≥ #220) is verified in both orders: Caliber's own
  postconditions test that a filter is present rather than whose it is, so it leaves these in place,
  and because the filter records are owned by this app a later Caliber uninstall can no longer return
  the grants to their unfiltered state.

  No API or TypeScript change: this ships entirely as migrations.

### Patch Changes

- Updated dependencies [f01e810]
  - @mj-biz-apps/forms-entities@0.10.0

## 0.9.0

### Minor Changes

- cc13065: Migrate the workspace from npm to pnpm, remove the MJAPI/MJExplorer dev harness, and
  settle the MemberJunction graph on a single 6.1.0-edge.2 copy.

  Two dependency corrections ship with this and affect consumers:

  - `@mj-biz-apps/forms-server` declared `type-graphql` nowhere while importing it in
    `PublicFormResolver` and `graphql-types`. It resolved off a hoisted transitive copy
    under npm, so an installer outside this monorepo had no guarantee of getting it. Now
    declared as a peer at `2.0.0-beta.3`, matching what `@memberjunction/server` ships.
  - `UserCache` moved from `@memberjunction/sqlserver-dataprovider` to
    `@memberjunction/generic-database-provider` in MJ #3734, which lands in 6.1.0-edge.2.
    That was `forms-server`'s only sqlserver-dataprovider usage, so the peer swaps over
    entirely rather than being added alongside.

### Patch Changes

- Updated dependencies [cc13065]
  - @mj-biz-apps/forms-entities@0.9.0

## 0.8.0

### Minor Changes

- de1998f: Upgrade MemberJunction to 6.1.0-edge.1 (task-graph line) and regenerate CodeGen
  output against the 6.1 generator: GraphQL reverse-relationship resolver fields
  lose the redundant schema prefix (mjBizAppsFormsMJ*BizApps_Forms_Forms*… →
  mjBizAppsFormsForms\_…), shrinking apps/MJAPI/schema.graphql accordingly.

### Patch Changes

- Updated dependencies [be2f81b]
- Updated dependencies [c30ac35]
- Updated dependencies [de1998f]
  - @mj-biz-apps/forms-entities@0.8.0

## 0.7.0

### Minor Changes

- 4080fac: Make Forms installable on PostgreSQL, without a CodeGen run.

  **A minor rather than a patch, because a new install target ships.** `migrations-pg/` previously held nothing but a README saying it was empty until the SQL Server migrations existed. It now carries the two converted DDL/metadata migrations plus one `.pgonly.sql` capture of CodeGen's PostgreSQL objects, so a PostgreSQL host can install Forms the way a consumer actually installs an Open App — `mj app install`, not `mj codegen`. No SQL Server behaviour changes: `migrations/` is untouched.

  **Verified on a virgin PostgreSQL 16.11** — the oldest major supported, deliberately, not the newest — with MJ core and bizapps-common installed first (Forms hard-FKs `__mj_BizAppsCommon.Person`). Result: 10 tables, 10 base views, 30 CRUD functions, 10 triggers, 10 entities, 121 fields, 39 permissions, 13 relationships; a subsequent `mj codegen` produces a 0-line diff across metadata, `pg_get_viewdef`/`functiondef`/`triggerdef` and column defaults; a 19-assertion functional test (`scripts/pg-objectmodel-test.mjs`) passes; MJAPI boots against it. Runbook and measured numbers in `migrations-pg/docs/PG_INSTALL_VERIFICATION.md`.

  **The CodeGen objects are captured from the catalog, not from CodeGen's SQL log.** That log records only entities whose metadata changed, and these migrations already carry the metadata — so CodeGen logged almost nothing while still building every object. Without the capture an install has tables and registered entities but no base views and no CRUD functions, i.e. nothing the API can read or write through.

  **`mj.config.cjs` gains lower-case twins** for `schemaPlaceholders`, `includeSchemas` and `NameRulesBySchema`. PostgreSQL folds unquoted identifiers, so CodeGen reads the schema back as `__mj_bizappsforms` while these rules match case-sensitively; the generic `__mj` rule then matches that name's _prefix_ and emits `${mjSchema}_bizappsforms`, a schema that does not exist. The same pass names `__mj_BizAppsCommon` explicitly, which had no rule at all and was being rewritten by the generic rule in the shipped T-SQL (harmlessly there, since `mjSchema` is `__mj` — but it is a reference this repo does not own).

  Several converter gaps in CLI 5.51.0 are worked around here and worth reporting upstream: `--bake-codegen` emitted no CodeGen objects; BIT→BOOLEAN literals were not coerced (1,590 rewritten by looking each target column's type up in `information_schema`); the schema qualifier came out quoted in `CREATE TABLE` and unquoted in `ALTER TABLE`; cross-schema `REFERENCES` kept a mixed-case schema name that no unquoted schema matches; and the four CodeGen reconciliation `EXECUTE`s were reported unhandled despite existing natively on PostgreSQL — they are ported as `SELECT`s because they rewrite placeholder field `Sequence` values into real ordinals.

### Patch Changes

- Updated dependencies [4080fac]
  - @mj-biz-apps/forms-entities@0.7.0

## 0.6.0

### Patch Changes

- @mj-biz-apps/forms-entities@0.6.0

## 0.5.0

### Minor Changes

- 287cfc7: Ship the `<mj-form>` widget bundle, and make client and server agree on what a valid answer is

  **The bundle (#20).** No published `forms-ng` tarball has ever contained
  `dist/widget/mj-form.js` — verified by downloading all five on npm (`0.0.0`, `0.2.0`, `0.2.1`,
  `0.3.0`, `0.4.0`) and listing their contents. `0.0.0` predates the widget, so the four releases
  from `0.2.0` on shipped the AOT-compiled `dist/widget-entry.js` with nothing that bundles it:
  `/forms/widget/mj-form.js` 404'd, the custom element never upgraded, and no public form ever
  rendered. The bundler was never broken — it lived in a separate `build:widget` script that no CI
  path invoked. `build` now runs both halves (`ngc && node scripts/build-widget.mjs`).

  It survived all four because turbo declares `outputs: ["dist/**"]`: anyone who ran `build:widget`
  by hand had the artifact captured into the build cache as if `build` had produced it, so local
  builds looked correct forever after while cold-cached CI never made it.
  `.github/scripts/validate-widget-bundle.sh` now asserts against the pack manifest — presence,
  plausible size, zero unlinked `ngDeclare` sites, and that the element registers — and runs on
  every PR as well as before publish.

  **One definition of "answered".** The predicate was hand-written in four places, and they had
  already drifted: the conditional evaluator tested `answer.length > 0` while all three validators
  tested `value.trim().length > 0`. A respondent who typed a single space into an optional question
  therefore satisfied an `isAnswered` conditional — revealing whatever branch depended on it —
  while that same question simultaneously reported as unanswered. `isAnswerSupplied` in
  `@mj-biz-apps/forms-entities` is now the only copy, and whitespace is not an answer.

  **Type-derived format validation.** `Email`, `Number`, `Rating` and `NPS` questions authored
  without an explicit `validationRule` were validated by the widget but not by the server, so a
  direct POST at `SubmitFormResponse` persisted `not-an-email` into an `Email` question as a
  `Complete` response — while the service's own docstring claimed format could not be bypassed.
  `Phone` and `Date` were validated by _neither_ side; the widget's type switch fell through to
  `default: return VALID` for both. The check now lives in `@mj-biz-apps/forms-entities`
  (`validateAnswerFormat`) and both sides call it. An explicit `ValidationRule` still applies on
  top and can narrow a type further.

  Two gaps in that check are closed with it. `Date` accepted any non-string outright, so answering
  a `Date` question with `numericValue` skipped validation entirely and stored a number on a date
  question — `dateValue` is a plain GraphQL `String` with no date scalar behind it, so nothing
  upstream had vetted it either. And `Number` accepted anything `Number()` could convert, which
  includes `0x10`, `0b101` and `0o17`; those passed as valid and were then persisted as the literal
  text typed, which nothing downstream reads back as a number.

  A numeric `min`/`max` is now enforced on any answer that IS a number, not only on one that
  arrived in the `numericValue` column. The rule path branched on `typeof value`, so
  `{ numericValue: 9999 }` was rejected against `max: 100` and `{ textValue: "9999" }` was
  accepted — while the widget coerced the string and rejected both. The builder only offers
  `min`/`max` on numeric question types, and the widget sends those as `numericValue`, so reaching
  this needed a direct call at the mutation rather than the ordinary UI — which is exactly the
  traffic a public anonymous endpoint has to assume.

  **An unsubmittable form.** `matchesValidationPattern` is now shared too. The widget treated an
  author `pattern` that would not compile as valid (never block the respondent) and the server
  treated it as invalid, so a form carrying a malformed regex showed no error while being filled in
  and then refused every submit with a field error no input could clear. Both sides now fail open;
  the type floor still applies underneath, and the respondent is not the one who made the mistake.

  **Autosave drafts.** A `partial` (autosave) save is no longer held to finished-value rules — a
  half-typed email or a value still under `minLength` no longer fails the debounced autosave and
  discards the respondent's progress. Upper bounds (`maxLength`, `max`) ARE still enforced on a
  draft: "not finished yet" and "already too big" are different claims, and exempting the ceilings
  meant an author's `maxLength` bought nothing on the autosave path — which matters here because
  `TextValue` is `NVARCHAR(MAX)` and the widget sets no `maxlength` attribute. A question with no
  `validationRule` at all is still bounded only by MJAPI's 50mb body limit, on both paths; a global
  answer-size cap would be a product decision, not a bug fix.

  **When the widget shows an error.** A question is now marked "touched" when focus leaves it,
  not when the respondent types in it. This is a consequence of the validation work above: with
  `Phone` newly validated and `isPhone` wanting seven digits, marking touched on every keystroke
  rendered "Enter a valid phone number." on keystrokes one through six of every phone number — and
  that message carries `role="alert"`, so a screen reader re-announced it each time. Errors still
  appear on blur, on trying to advance in one-question mode, and on submit (which marks every
  visible question touched). Moving focus BETWEEN two controls of the same question — option to
  option in a `MultiChoice`, `SingleChoice`, `Rating`, `NPS` or `YesNo` — does not count as leaving
  it, so choice questions no longer flash "required" while the respondent is reading the options.

  **Widget sourcemap.** The bundle is built with `minify: true, sourcemap: true` and ends with
  `//# sourceMappingURL=mj-form.js.map`, but nothing served that path, so it fell through to
  MJAPI's authenticated routes and answered 401 on every devtools session. `/forms/widget/
mj-form.js.map` is now served beside the bundle, and answers 404 rather than 401 when the build
  emitted no map.

  This rejects submissions that previously succeeded — any answer that does not fit its question's
  type. Already-published forms are covered without re-publishing, because the check derives from
  `question.type` rather than from the stored rule.

  **Host readiness.** `checkRespondentReadiness` no longer requires the deployment-global
  `magicLink.restrictedRoleName` to equal `Form Respondent`. Core treats that value only as the
  default for invites that name no role, and Forms' minter always names one — so the requirement
  made every stock host report unready (core defaults it to `Magic Link Baseline`) and meant two
  Open Apps could never both be ready on one MJAPI instance. The real requirement, that the role be
  grantable, is unchanged, and now compares names the way core's `isRoleGrantable` does:
  case- and whitespace-insensitively. The check reads the role from the same `FORMS_MAGICLINK_ROLE`
  config the minter uses, so it cannot drift from what is minted.

### Patch Changes

- Updated dependencies [287cfc7]
  - @mj-biz-apps/forms-entities@0.5.0

## 0.4.0

### Minor Changes

- f88839f: Raise the MemberJunction floor to 5.51.0, and make the release workflow's schema-change rule enforceable.

  **A minor rather than a patch, because installs are affected.** `mj-app.json` now requires MJ `>=5.51.0` and all five packages' peer ranges moved to `^5.51.0`. A host below that can no longer install Forms. Nothing in 5.51.0 is _required_ by Forms — this is a routine rev to the current `latest` to keep the delta to MJ small — but the raised requirement is what consumers see, and this repo treats a raised install requirement as a minor.

  **Upgrading is a database operation, not just a pin bump.** 5.51.x ships two core `__mj` migrations, so `npx mj migrate -t v5.51.0` is required per environment. A partially-migrated core still installs, builds, tests and boots cleanly; the failure surfaces later as `Entity <name> not found in metadata` from an unrelated feature. Verified end to end on the dev database: frontier advanced, entity count held at 422, MJAPI startup clean, and the anonymous respondent path passes all 8 smoke assertions.

  **The release workflow's migration rule could only ever abort a release, never enforce one.** `changeset version` reads solely `.changeset/*.md` and knows nothing about `migrations/`, so raising the predicted bump moved the expectation away from what would actually happen — the mismatch guard then failed the release reporting a predictor error instead of naming the missing changeset. The rule is now an explicit policy gate that runs on every path that can cut a release, including `workflow_dispatch`, which previously skipped it and shipped a patch carrying a schema change.

  Also fixes the E404 fast path in the npm placeholder check, which never fired because it read `$?` after an `if` — always 0 — so a genuinely missing package burned every retry before being reported.

### Patch Changes

- Updated dependencies [f88839f]
  - @mj-biz-apps/forms-entities@0.4.0

## 0.3.0

### Minor Changes

- 6830bde: Repair the anonymous submit path, raise the MemberJunction floor to 5.50.0, and scope CodeGen with an allow-list.

  **A minor rather than a patch, because installs are affected.** `mj-app.json` now requires MJ `>=5.50.0` and the packages' peer ranges moved to `^5.50.0`. A host below that can no longer install Forms. The old `>=5.43.0` floor was never real: `bizapps-common` and `bizapps-tasks` both require `>=5.44.0` and are hard dependencies, so Forms promised a configuration that could not exist.

  **The anonymous submit path could never succeed in 0.2.x.** Two independent defects, either of which alone breaks every public submission — the one thing the product exists to do.

  - The published-version check compared GUIDs case-sensitively. The snapshot embeds the client-minted (lowercase) id; SQL Server returns it uppercased; the widget echoes the snapshot's spelling back. Every submission was rejected with `version-mismatch`.
  - The scroll form ran the browser's native submit. The component is standalone and does not import `FormsModule`, so `(ngSubmit)` bound to nothing, the page navigated away, and the in-flight mutation was aborted — which also hid the error above, so the form appeared to silently reset and discard the respondent's answers.

  **On-submit hooks reported failures with no cause.** `createPerson`, `createTask` and `createTaskLink` collapsed MJ's per-field validation detail into a bare `null`, so a real defect surfaced as `"Failed to create Person record."` and nothing else. They now carry the provider's explanation, and a fourth silent `null` for an entity missing from metadata says which entity and why.

  **CodeGen is now scoped by an `includeSchemas` allow-list.** A deny-list can only name schemas known in advance; a real deployment holds Open Apps this repo has never heard of, and generating their artifacts here is what took MJAPI down in #10. Anything unnamed is now out of scope by construction. The generated output is byte-identical to the deny-list run, so this is behaviour-preserving.

  Also fixes contamination the #10 fix missed (`apps/MJAPI/schema.graphql` carried 392 foreign-schema references), extends the regression gate to catch it, adds the root `build:widget` script the server's own error message told operators to run, and ships a `.env.example` so the repo can be stood up at all.

### Patch Changes

- Updated dependencies [6830bde]
  - @mj-biz-apps/forms-entities@0.3.0

## 0.2.1

### Patch Changes

- Updated dependencies [234286f]
  - @mj-biz-apps/forms-entities@0.2.1

## 0.2.0

### Minor Changes

- 8fbf9fb: Phase 1: anonymous forms, submit hardening, AI authoring and reporting

  Adds the first working slice of MJ Forms:

  - public submit endpoint with anonymous magic-link scope enforcement (create-only on response entities) and anti-abuse hardening: Cloudflare Turnstile (per-form, fail-closed), rate limiting, distribution and form quotas, and duplicate-submission recovery
  - the `<mj-form>` respondent widget as a shell-free Angular custom element, with scroll and one-question render modes, design-token theming, conditional logic, file upload and debounced partial-save
  - server-side `/f/:slug` magic-link redeem and widget bundle serving
  - metadata-driven AI form authoring from a plain-language brief, plus 5 starter templates
  - 4 on-submit actions: person upsert, confirmation email, follow-up task, and written-response analysis
  - reporting dashboard with summaries, per-question breakdowns, net promoter score, funnel, response views and CSV or Excel export

### Patch Changes

- Updated dependencies [8fbf9fb]
  - @mj-biz-apps/forms-entities@0.2.0
