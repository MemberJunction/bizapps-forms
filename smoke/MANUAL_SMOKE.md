# MJ Forms — manual / agent-driven smoke checklist

A browser-driven pass over the surfaces the automated `smoke/*.mjs` paths **cannot** reach: the
builder UI, the rule editor, the Design tab, the analytics dashboard, and the respondent widget as a
real browser renders it. It is written to be handed to an agent and executed top to bottom.

The automated scripts already cover the anonymous respondent path (`pnpm run smoke:respondent`),
scope enforcement (`smoke:scope`), binding, uploads and resume arcs. **Run those first** — if one of
them is red, fix that before spending a browser pass here.

---

## How to run this

### 1. Bring up the host

Forms has **no Explorer of its own**. The builder renders only inside MJ's host:

```bash
lsof -nP -iTCP:4000 -sTCP:LISTEN     # API      — often already up for days
lsof -nP -iTCP:4201 -sTCP:LISTEN     # Explorer
# only if they are not:
cd ../MJ && pnpm turbo start --filter=mj_api --filter=mj_explorer
```

This repo's own harness (`cd apps/MJAPI && node server.mjs`, `:4121`) is API-only and cannot render
the builder.

Verify Forms is registered by grepping the **API startup log** for `Loaded Open App server package:`
— never by grepping `mj.config.cjs`, which does not hold the registration.

### 2. Use Playwright, not the Chrome extension

Drive the browser with the Playwright MCP tools. Prefer `browser_snapshot` (accessibility tree) over
screenshots, and `browser_find` over a full snapshot when you only need one element.

Explorer boots behind a `Loading workspace...` splash — wait for it to disappear before snapshotting,
or you capture the splash.

Two builder instances exist in the DOM at once (Explorer keeps background record tabs mounted), so
scope every selector to the visible one:

```
button.fb-palette-item[title="One line of free text"]:visible
[aria-label="Edit question Untitled Email question"]:visible
```

### 3. Set up the three observation points

A UI claim is not evidence on its own. Check each behaviour in as many of these as apply.

**UI** — Playwright, as above.

**DB** — `mssql` is not a dependency of this repo; it lives in the shared pnpm store alongside it.
Resolve it first, then drop the helper below in a scratch dir:

```bash
node -e "console.log(require.resolve('mssql', { paths: ['../MJ', '..'] }))"
# or: find ../node_modules/.pnpm -maxdepth 4 -type d -name mssql -path '*node_modules*' | head -1
```

```js
// q.mjs — node q.mjs "SELECT ..."   (run from the repo root)
import sql from '<the path printed above>';
import { readFileSync } from 'fs';
const env = Object.fromEntries(readFileSync('.env','utf8')
  .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]; }));
const pool = await sql.connect({
  server: env.DB_HOST, port: +env.DB_PORT, database: env.DB_DATABASE,
  user: env.DB_USERNAME, password: env.DB_PASSWORD,
  options: { trustServerCertificate: true, encrypt: false },
});
const r = await pool.request().query(process.argv.slice(2).join(' '));
console.log(JSON.stringify(r.recordsets.length === 1 ? r.recordsets[0] : r.recordsets, null, 1));
await pool.close();
```

**Public API** — `/graphql` returns `{"error":"Authentication required"}` without a JWT, *even for
the public queries*. Get one by reading it off the respondent host page:

```bash
curl -s http://localhost:4000/f/<slug> -o host.html
TOKEN=$(grep -o 'data-token="[^"]*"' host.html | sed 's/data-token="//;s/"$//')
curl -s -X POST http://localhost:4000/graphql \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"query($s:String!){PublishedForm(distributionSlug:$s){formVersionId definitionJSON}}","variables":{"s":"<slug>"}}'
```

---

## Gotchas that will otherwise cost you an hour

| Trap | What happens | What to do |
|---|---|---|
| **Blur binding** | Builder inputs bind `(change)`, which fires on **blur**. Playwright's `.fill()` does not blur, so the UI shows a value the DB never received — it looks exactly like a lost-write bug. | Always `browser_press_key: Tab` after typing, *then* query the DB. |
| **Rate limit** | 5 submissions/min per (session, distribution). A test battery trips it and every later assertion returns "Too many submissions". | Pace submits, or mint a fresh session by re-fetching `/f/<slug>` (each redeem gets a new `mj_sid`). |
| **`x-session-id`** | `FormResponse.AnonymousSessionID` comes from this **request header**, not the JWT. curl omits it, so curl-created rows take a different server code path than widget rows. | Send `-H 'x-session-id: <value>'` whenever you are testing behaviour that depends on session ownership. |
| **Column names** | `FormQuestion` uses `Prompt` / `DisplayOrder` (not QuestionText/Sequence); `FormDistribution` uses `ChannelType`; `FormAutomationRun` uses `FormAutomationID` / `FormResponseID`; `Trigger` needs bracket-quoting. Per-form styling is `Form.StyleID` → `FormStyle.CSSVariables` (FormStyle has **no** FormID). | Check `INFORMATION_SCHEMA.COLUMNS` before guessing. |
| **Wrong origin** | `/f/:slug` is served by the **API** (`:4000`). The same path on Explorer (`:4201`) silently redirects to the workspace and looks like the form failing to load. | Always use `:4000` for respondent links. |
| **Multi-statement SQL** | `r.recordset` shows only the first result set. | Print `r.recordsets` (the helper above already does). |

---

## Checklist

Each row is *action → expected*. Mark ⚠️ and capture the evidence when expected does not hold.

### A. Builder — question CRUD
- [ ] `New form` → a `Form` row is created immediately (note: not deferred until save)
- [ ] Rename the form → `Form.Name` updates in the DB
- [ ] Add one of each palette type: Email, ShortText, Number, SingleChoice, MultiChoice, Dropdown, YesNo, Rating, Date, FileUpload, NPS
- [ ] All persist with the right `QuestionType` and a **contiguous** `DisplayOrder` from 0, no gaps or duplicates
- [ ] Edit a prompt → persists (remember to Tab)
- [ ] Toggle `Required` → `IsRequired` flips
- [ ] Edit choice option labels → persist; `DisplayOrder` stays contiguous
- [ ] `Add option` → new row appended. Its default name is derived from the labels that **exist**, so a list of `Free / Pro / Enterprise` mints `Option 1`, not `Option 4` — **this is deliberate**, not a bug
- [ ] Delete a mid-list question → remaining `DisplayOrder` renumbers contiguously
- [ ] Note: deletion has **no confirmation and no undo** — confirm this is still the intended behaviour

### B. Validation rules
- [ ] Enable *Answer validation* on a Number question → min/max fields appear
- [ ] Set a sane min/max → `ValidationRule` round-trips as JSON
- [ ] **Set min above max** (e.g. 500 / 120) → *expected once #80 lands:* refused at authoring time. Until then it is accepted silently and traps the respondent

### C. Reorder and rule safety (#73)
- [ ] Move up/down at the ends of the list → *expected once #84 lands:* `disabled`. Either way, confirm clicking it does **not** corrupt `DisplayOrder`
- [ ] Open *Edit logic* → Show (Always / Only when…), jump rules, and dialog buttons **confirm left, cancel right**
- [ ] The rule source dropdown offers **only preceding** questions
- [ ] Changing the source question repopulates the comparison-value list
- [ ] Save a rule → `ConditionalRule` JSON holds a real question ID
- [ ] Move the dependent question above its source → toast *"broke N rule(s) on it"* + **Undo**, plus a per-card badge naming the cause
- [ ] Click Undo → order restored, badge clears
- [ ] Single-move Undo restores **exactly** one step (after several moves it returns to the last state where the rule was intact — both are correct)
- [ ] Delete a rule's source question → badge reads *"(deleted question) … no longer exists"*, and the rule keeps the dangling id so it stays repairable

### D. Publish and versioning
- [ ] Publish a clean form → `FormVersion` row, `Status='Published'`, `DefinitionSnapshot` populated
- [ ] Publish with a **broken rule** on screen → *expected once #79 lands:* blocked or confirmed. Verify the dangling `questionId` is/is not present in `DefinitionSnapshot`
- [ ] After publish with no share link → header chip reads **"Published, not shared"** in amber and is a button; clicking it lands on **Distribute**. It must not claim the form is "live on its public link" (#83)
- [ ] Create the first share link → the chip flips to plain **"Published"** with no reload
- [ ] Switch that link's *Open to responses* off (or let it hit its response limit / expiry) → chip reads **"Published, not collecting"** (#83)
- [ ] No state of that chip shows a green check unless a link is genuinely accepting responses
- [ ] Edit anything after publishing → button becomes **"Publish changes"** and the panel reads *"Saved · publish to put it live"*
- [ ] After a second publish → *expected once #82 lands:* exactly **one** `Published` version per `FormID`, the previous one `Retired`

### E. Distribution and magic link
- [ ] `Create a share link` → `FormDistribution` row with a slug and a `MagicLinkInviteID`
- [ ] Link / QR / Embed tabs render; copy-link works
- [ ] Settings persist: *Open to responses*, *Response limit*, *Expires*
- [ ] A link that has responses refuses deletion and explains why
- [ ] `GET /f/<slug>` → 200 with a `data-token`
- [ ] Decode the JWT → `role: "Form Respondent"`, `resourceId` = **this** distribution, `mj_anon: true`, sane expiry
- [ ] Two separate fetches mint **distinct** `mj_sid`

**Credential lifecycle (#104).** The automated end-to-end version of this is
`pnpm run smoke:credentials` — it boots the harness in-process and drives the real hook, so run
that FIRST and use the list below only for what a browser adds (the badge, the switch, the copy).
The rows here exist because the server assertions used to have no home at all: every unit suite
mocks the minter, so nothing checked that a revoked token actually stops redeeming.

- [ ] Turn *Open to responses* OFF → the row's `MagicLinkInviteID` and `PublicLinkToken` are both
      NULL, and the invite is `Revoked`
- [ ] `POST /magic-link/redeem` with the OLD raw token → refused, `errorCode: "revoked"`
- [ ] The badge reads **Paused** and does NOT claim the token was withdrawn if the columns are
      still populated (a failed revoke is fail-soft and leaves them)
- [ ] Turn it back ON → a NEW token, the **same** `/f/<slug>`, and the old token still refused
- [ ] `Reissue link` → new token, same slug, previous invite `Revoked`, previous token refused
- [ ] The switch reads OFF for a row at `Status='Active', IsActive=0`, and clicking it REOPENS
- [ ] Delete a link with no responses → its invite is `Revoked`, not left `Active`

### F. Public GraphQL — read
- [ ] `PublishedForm` with the right slug → correct ids, `renderMode`, `settingsJSON`
- [ ] `PublishedForm` with **another form's** slug → `null`
- [ ] `PublishedForm` with a **bogus** slug → `null`, byte-identical to the previous case (no existence leak)

### G. Public GraphQL — submit
- [ ] Happy path → `success:true`, `status:"Complete"`, confirmation message
- [ ] Omit a required answer → refused, error carries the offending `questionId`
- [ ] Malformed email → *"Enter a valid email address."*
- [ ] Answer for a `questionId` **not in this form** → the foreign answer is dropped (verify by joining `FormResponseAnswer` → `FormQuestion.FormID`)
- [ ] Answer for a question belonging to **another form** → same
- [ ] Wrong `formVersionId` → *"version-mismatch"*
- [ ] Submit to **another distribution's** slug with this token → *"distribution-not-found"*
- [ ] Exceed 5 submits/min → clear rate-limit message naming the wait
- [ ] Answer typing lands in the right columns: text → `TextValue`, multi-select → `JSONValue`, NPS/number → `NumericValue`

### H. Response adoption and ownership — **security**
- [ ] Replay a `responseId` whose row is already `Complete` → row untouched, never downgraded to `Partial`, quota not double-counted
- [ ] Create a `Partial` **with** `x-session-id`, then replay its `responseId` from a different JWT **with no header** → *expected once #78 lands:* refused. Until then it overwrites the victim's answers, clears `AnonymousSessionID`, and seals the row
- [ ] Same, but with a **different** `x-session-id` → must be refused
- [ ] A genuinely header-less client can still resume **its own** row

### I. Respondent widget
- [ ] Public link renders: progress bar, required markers, and the right control per type (checkbox group, select, date, file, NPS 0–10 radios)
- [ ] Question count matches the published snapshot — a question hidden by a **broken** rule silently disappears, which is the runtime symptom of #79
- [ ] Submit empty → field marked `[invalid]`, a `role="alert"` message, focus moved to the field
- [ ] Trip a validation rule → the message is one a respondent can actually act on
- [ ] Interrupt and re-submit → *"Progress saved"* autosave works
- [ ] Complete a submission → confirmation message renders

### J. XSS and injection
- [ ] Submit `<img src=x onerror="window.__xss=1"><script>window.__xss2=1</script>'"--><b>BOLD</b>` as a text answer
- [ ] It is stored **verbatim** in `TextValue` — correct; escaping is a rendering concern
- [ ] Response detail renders it as **text**: `window.__xss` stays undefined, and the DOM has zero `img[src=x]`, zero injected `<script>`, zero `<b>BOLD</b>`
- [ ] **Confirm the payload is actually on screen** (`body.innerText` contains `onerror=`) — otherwise a view that simply failed to render the answer looks like a pass
- [ ] Analytics dashboard renders it safely too
- [ ] CSV / Excel export: an answer beginning `=`, `+`, `-` or `@` is a spreadsheet-injection vector. This repo does no escaping and delegates to MJ core's `ExportService` — **verify against core**, it is still unconfirmed either way

### K. Quota, closing and expiry
- [ ] Set *Response limit* to the current response count → submit is refused with a quota message
- [ ] Load the public link while full → *expected once #81 lands:* the "Form unavailable" view. Until then it renders a fully fillable form and only refuses at Submit
- [ ] Set *Open to responses* off → `GET /f/<slug>` returns **410 Gone**, "Form unavailable", and mints **no** token
- [ ] Set an expiry in the past → behaves the same as closed
- [ ] Restore the distribution afterwards so the fixture stays usable

### L. Design tab
- [ ] Change font / colours → a per-form `FormStyle` row is created, `CSSVariables` are all semantic `--mjf-*` tokens with **no hardcoded values**
- [ ] Live preview updates, and desktop / tablet / mobile widths all render (mobile-first is a shipping requirement)
- [ ] The change does **not** reach the live form until republish, and the UI says so
- [ ] After republish → `PublishedForm.styleTokensJSON` carries the new tokens

### M. Analytics, responses, cross-app
- [ ] Responses tab lists responses with status, respondent and answered count
- [ ] Response detail shows every answer
- [ ] Dashboard: completion stats, typical time, NPS banding, choice distributions, email-domain breakdown
- [ ] Beware: two **distinct forms sharing a name** look like a duplicate-rendering bug in the form list. Check `Form.ID` before filing
- [ ] Automate tab lists the built-in on-submit steps
- [ ] The built-in respondent upsert writes real `__mj_BizAppsCommon.Person` rows
- [ ] `FormResponse.RespondentPersonID` is linked, and a **repeat** email reuses the same `PersonID` rather than creating a duplicate
- [ ] Browser console is clean through the whole pass (a `401` on `/favicon.ico` from the respondent origin is a known, cosmetic exception)

---

## Not covered here

Worth adding as they stabilise: One-question render mode, the Preview modal, welcome/ending screens
and score-band routing, Templates and *Author with AI*, file-upload storage end to end, Turnstile /
captcha, the *Add a step* automation builder, and multi-page forms with cross-page branching.

## Reporting

File one issue per defect rather than a batch — this repo's convention is a focused title stating the
problem, often with the fix direction after an em-dash (see #78–#84). Include the reproduction, the
confirmed consequence, and what you checked in the DB or API, not just what the UI showed.
