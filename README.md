<div align="center">

<br/>

# 📋 &nbsp; MJ Forms

### Forms, surveys &amp; intake — beautiful, free, and built on _your_ data.

**A source-available [MemberJunction](https://github.com/MemberJunction/MJ) Open App.**
Anonymous-friendly public links. Gorgeous on mobile. Set up in two minutes by a human _or_ an AI agent.
And every response is a **first-class record in your MemberJunction database** — not an export trapped in someone else's silo.

<br/>

[![Live design gallery](https://img.shields.io/badge/%F0%9F%8E%A8_live_design_gallery-view_now-7c5cff?style=for-the-badge)](https://memberjunction.github.io/bizapps-forms/)
[![Built on MemberJunction](https://img.shields.io/badge/built%20on-MemberJunction-264FAF?style=for-the-badge)](https://github.com/MemberJunction/MJ)
[![MemberJunction 5.50.0](https://img.shields.io/badge/MJ-5.50.0-264FAF?style=for-the-badge)](https://www.npmjs.com/package/@memberjunction/core)
[![License: ISC](https://img.shields.io/badge/license-ISC-2c7be5?style=for-the-badge)](#-license)
[![Status: scaffold](https://img.shields.io/badge/status-Phase%201-e8a33d?style=for-the-badge)](plans/FORMS_BUILD_PLAN.md)

**🎨 Live design explorations →** [**memberjunction.github.io/bizapps-forms**](https://memberjunction.github.io/bizapps-forms/) — three contemporary UX directions (Aurora · Editorial · Warm) across the respondent form, builder, and analytics dashboard.

<br/>

[**What it is**](#-what-it-is) · [**The moat**](#-why-its-different-the-moat) · [**Anonymous by default**](#-anonymous-by-default) · [**Architecture**](#%EF%B8%8F-architecture) · [**Quick start**](#-quick-start) · [**Roadmap**](#%EF%B8%8F-roadmap) · [📚 **The full plan**](plans/FORMS_BUILD_PLAN.md)

</div>

---

## 🧭 What it is

The **80–90% of form/survey usage is simple** — contact forms, RSVPs, feedback/NPS, lead capture,
applications, registrations, quizzes — and it maps almost perfectly onto things **MemberJunction
already does well**. Standalone tools charge a recurring premium for capabilities that, on top of MJ,
are largely **reuse, not new build**.

So MJ Forms ships the simple 80% **beautifully and for free**, and makes the powerful 20% _possible_
by leaning on MJ infrastructure — **Actions, Agents, AI Prompts, RSU** — instead of a bespoke
workflow engine. It's deliberately **source-available under the Business Source License 1.1**, with a soft spot for the audiences
MJ already serves best: **nonprofits and associations**, for whom per-response metered survey tools
are a real, recurring budget pain.

```mermaid
flowchart LR
    A["📝 <b>Build</b><br/><sub>visual builder<br/>or AI-authored</sub>"] --> B["🚀 <b>Publish</b><br/><sub>link · embed<br/>QR · popup</sub>"]
    B --> C["📱 <b>Respond</b><br/><sub>mobile-first<br/>&lt;mj-form&gt; widget</sub>"]
    C --> D["💾 <b>Capture</b><br/><sub>FormResponse<br/>+ Answers</sub>"]
    D --> E["⚡ <b>Automate</b><br/><sub>on-submit<br/>Actions / Agents</sub>"]
    E --> F["📊 <b>Report</b><br/><sub>native MJ<br/>dashboards + Skip</sub>"]
```

---

## ✨ Why it's different (the moat)

A standalone survey tool traps responses in a silo. MJ Forms inverts that — responses are
**operational data the moment they land.**

|   | Capability | What it means |
|---|---|---|
| 🧩 | **Responses are records, not exports** | A submission can _become_ (or link to) a [bizapps-common](https://github.com/MemberJunction/bizapps-common) **Person / Organization / ContactMethod** — instantly actionable in the same system that runs the org's CRM, committees, and tasks. No CSV round-trip, no Zapier tax. |
| ⚡ | **On-submit automation — free** | Send an email, create a Task, upsert a Person, route to an agent, run an LLM-judge on a free-text answer. The "integrations + logic + AI" that incumbents charge the most for, MJ already has. |
| 🧬 | **Promote responses to first-class entities** | A recurring instrument can be projected — via a live SQL view, or an opt-in **RSU-materialized table** — into something the whole MJ toolchain (viewing system, query builder, dashboards, **Skip**) treats natively. _No form tool on the market does this._ |

> **Philosophy:** _beat the meter_ — free and unlimited at the core — and differentiate on **native
> data integration**, not on out-feature-ing the long tail.

---

## 🔐 Anonymous by default

The scary part of public surveys — anonymous identity with server-side scope that can't be escalated —
is **already solved by MJ.**

- Public submissions ride **anonymous magic-link sessions**: `IdentityMode='anonymous'`, authorization
  enforced server-side from the JWT's `mj_scopes` claims — **never DB roles**, so there's no privilege
  accretion. Two anonymous visitors share one identity but hold different scopes.
- A **`FormDistribution`** record wraps a multi-use, scoped link as a first-class "public form URL,"
  with its own quota, expiry, open/close window, and per-link analytics.
- The one deliberate exception to magic-link read-only convention is a restricted **"Form Respondent"**
  role with **CanCreate on response entities only** — authored as metadata.
- The only meaningful net-new server surface is a public-write **hardening layer**: Cloudflare
  Turnstile (per-form toggle) + rate-limit + quota + dedupe + IP-hash/UA capture.

```mermaid
sequenceDiagram
  actor V as Anonymous Visitor
  participant W as mj-form Widget
  participant S as Submit Endpoint
  participant A as MJ Auth (mj_scopes)
  participant DB as Forms Tables
  V->>W: open public link / embed
  W->>S: GET published FormVersion
  S->>A: validate anon scope (read)
  A-->>W: form definition
  V->>W: fill + submit (+ Turnstile)
  W->>S: POST answers
  S->>S: Turnstile · rate-limit · quota · dedupe
  S->>A: validate scope (CREATE response only)
  S->>DB: Save FormResponse + Answers
  S-->>W: confirmation / redirect
```

---

## 🏗️ Architecture

Two surfaces, one definition:

| Surface | What it is |
|---|---|
| 📱 **Respondent widget** | An Angular **custom element** (`<mj-form id="…">`) published to a CDN. Tiny, no Explorer shell — embed via `<script>`, iframe, popup, full-page, or QR. Two render modes (classic scroll **and** Typeform-style one-question-at-a-time) from the same definition. The public-facing ticket. |
| 🖥️ **Builder / Admin** | Runs in **MJExplorer**: visual form builder, response management, reporting dashboards. Internal staff only; full reuse of MJ dashboard / grid / query infrastructure. |

<details>
<summary><b>Repo layout</b> (mirrors the bizapps-common Open App skeleton)</summary>

```
bizapps-forms/
├─ mj-app.json            # OpenApp manifest
├─ mj.config.cjs          # schema + entity prefix + CodeGen output paths
├─ package.json           # npm workspace (apps/* + packages/*), turbo
├─ turbo.json
├─ migrations/            # VYYYYMMDDHHMM__v*__*.sql  (skyway)  ·  migrations-pg/
├─ metadata/              # mj-sync seed data (categories, styles, roles, perms)
├─ packages/
│  ├─ Entities/             @mj-biz-apps/forms-entities              (CodeGen entity subclasses)
│  ├─ Actions/              @mj-biz-apps/forms-actions               (CodeGen + hand-written actions)
│  ├─ CoreEntitiesServer/   @mj-biz-apps/forms-core-entities-server  (server-side lifecycle hooks)
│  ├─ Server/               @mj-biz-apps/forms-server                (bootstrap + resolvers + submit endpoint)
│  └─ Angular/              @mj-biz-apps/forms-ng                    (Explorer builder/admin + <mj-form> widget)
└─ apps/
   └─ MJAPI/               API-only dev harness    (mj-forms-api-harness, `node server.mjs`)
                           No MJExplorer here — the builder UI runs in MJ's own host.
                           See docs/local-host.md.
```

</details>

### 📐 Data model (Phase 1)

`FormCategory` (hierarchical) · `FormStyle` (themeable CSS) · **`Form`** · `FormVersion` (immutable
snapshots) · `FormPage` · `FormQuestion` · `FormQuestionOption` · **`FormResponse`** (identified
respondents link to a `bizapps-common` Person via `RespondentPersonID`) · `FormResponseAnswer`
(typed columns + JSON fallback) · `FormDistribution`. _Phase 2 adds `FormGroup` carrying the optional
`MaterializedEntityID` RSU bridge._

> **Hard dependencies:** MJ Forms builds on two sibling Open Apps —
> [`bizapps-common`](https://github.com/MemberJunction/bizapps-common) (identity) and
> [`bizapps-tasks`](https://github.com/MemberJunction/bizapps-tasks) (review/approve-before-publish
> routing). Both are free OSS and **auto-install** with MJ Forms (declared in `mj-app.json`).

### 🧱 ~70% is reuse, not new build

Anonymous magic-link `mj_scopes` · API-key scopes · Actions / Agents / AI Prompts · RunView / RunQuery /
dashboards · RSU (`RuntimeSchemaManager` + `SchemaEvolution`) · bizapps-common identity. **All present in
published MJ 5.50.0** — see the [reuse map](plans/FORMS_BUILD_PLAN.md#33-reuse-map--what-mj-already-gives-us-the-heart-of-this-plan).

---

## 🚀 Quick start

MJ Forms is an Open App: it installs **into** an existing MemberJunction database alongside its two
required siblings. A working local stack therefore needs an MJ core schema and both siblings present
before Forms' own steps do anything useful.

**1. Configure.** There is no default connection — nothing works until this exists.

```bash
npm install                        # repo root only — never inside a package dir
cp .env.example .env               # then fill in the placeholders (see the file's comments)
ln -sf ../../.env apps/MJAPI/.env  # MJAPI runs with cwd apps/MJAPI and reads .env from there
```

**2. Lay down MJ core.** Forms' migrations assume the `__mj` schema already exists; they do not
create it. Point MJ's own migrations at your database (from a MemberJunction checkout):

```bash
DB_HOST=localhost DB_PORT=<port> DB_DATABASE=<db> DB_USERNAME=sa DB_PASSWORD=<pw> \
  npm run mj:migrate --prefix /path/to/MJ
```

**3. Install the sibling Open Apps, leaf-first.** `bizapps-common` and `bizapps-tasks` are hard
`mj-app.json` dependencies — the on-submit hooks write into both schemas.

```bash
npx mj migrate --schema __mj_BizAppsCommon --dir /path/to/bizapps-common/migrations
npx mj migrate --schema __mj_BizAppsTasks  --dir /path/to/bizapps-tasks/migrations
```

**4. Install Forms.**

```bash
npm run mj:migrate          # schema, tables, AND the metadata seed
npm run mj:codegen          # generate entity / action / resolver / Angular subclasses
```

> **There is no separate metadata step any more.** Roles, entity permissions, actions, AI prompts,
> styles, categories, the application and its dashboards all ship inside
> `migrations/V…__Metadata_Sync.sql`, because `mj-app.json`'s `metadata.directory` is a dev-time
> pointer MJ's install engine never reads — migrations are the only channel to a database that is
> not yours. Earlier versions of this guide told you to run `mj sync push` here; that was the whole
> bug, and it meant every install but the author's got a Forms deployment with no `Form Respondent`
> role and no anonymous submit path, while reporting success at every step.
>
> **`mj sync push` is an authoring tool, not an install step, and a host never runs it.** It is how a
> *contributor* who edited `metadata/` pushes the change into a dev database and generates the seed
> migration. The push is how metadata gets into a migration; the migration is how it reaches anybody
> else. See [`migrations/README.md`](migrations/README.md) — and `npm run lint:distribution` fails
> the build if you edit `metadata/` without regenerating.

**5. Build and run.**

```bash
pnpm run build              # build all packages (turbo), including the <mj-form> bundle
cd apps/MJAPI && node server.mjs   # the API harness → http://localhost:4121
```

> There is **no `start:api` / `start:explorer` script** — they did not survive the pnpm migration,
> and this repo has no Explorer at all. `apps/MJAPI` is an API-only harness, which is enough for the
> respondent path, the submit endpoint and the smoke scripts. For the **builder / admin UI**, run
> MJ's own host with this repo linked in: `cd ~/Projects/MJ && pnpm start` (Explorer `:4201`).
> **[docs/local-host.md](docs/local-host.md)** is the full procedure.

> `npm run build` now also emits `dist/widget/mj-form.js`, the `<mj-form>` custom-element bundle
> the respondent page loads — it is part of `forms-ng`'s `build`, not a separate step you have to
> remember. (`npm run build:widget` still exists to rebuild just that bundle during widget work.)

A published form is then reachable anonymously at `http://localhost:4121/f/<distribution-slug>`.

> **What happens after Submit** — which automations run, how to configure or decline them from code,
> and which record owns respondent identity (read `FormResponse.RespondentPersonID`; do not derive a
> second Person) — is **[docs/on-submit-automations.md](docs/on-submit-automations.md)**. Read it
> before building an app that consumes Forms responses.

**Verify it actually works** — this exercises the public path end to end (host page, session token,
widget bundle, published definition, anonymous submit) and is the check that would have caught the
respondent-path defects in 0.2.1:

```bash
npm run smoke:respondent -- <distribution-slug>
```

---

## 🔌 Installing MJ Forms into a host app

MJ Forms is an Open App: it does not run standalone in production, it installs **into** another
MemberJunction application (the way [bizapps-caliber](https://github.com/MemberJunction/bizapps-caliber)
hosts it). `mj app install` handles the schema, migrations and package wiring from `mj-app.json`.
The metadata arrives *through* those migrations, not from the `metadata/` directory — the install
engine never reads it — and `mj app remove` retires the rows Forms wrote into the shared `__mj`
schema via `migrations-teardown/`.

One requirement it **cannot** wire for you, because it lives in the host's own server config:

```js
// <host>/apps/MJAPI/mj.config.cjs
module.exports = {
  magicLink: {
    enabled: true,
    restrictedRoleName: 'Form Respondent',   // the role Forms' seed migration creates
    grantableRoleNames: ['Form Respondent'],
    explorerUrl: process.env.MJ_EXPLORER_BASE_URL,
  },
};
```

Without it, forms still publish — but every public link answers **409**, because no anonymous
session can be minted and `FormDistribution.PublicLinkToken` stays null. Forms checks this at
startup and logs `[Forms] Anonymous respondent path is NOT ready: …` naming the exact setting, so
watch the host's boot log after installing.

| Host requirement | Why |
|---|---|
| **MJ `>=5.50.0`** | Set by our dependencies, not preference — `bizapps-common` and `bizapps-tasks` both require `>=5.44.0`, and 5.50.0 is where CodeGen's `includeSchemas` lands |
| **`bizapps-common` + `bizapps-tasks` installed** | Hard `mj-app.json` dependencies. The on-submit hooks write a `Person` and a `Task` across schema boundaries |
| **Their entity subclasses registered** | The hooks call `GetEntityObject` for both siblings' entities; unregistered, MJ returns a bare `BaseEntity` and every field assignment is silently lost |
| **`magicLink` configured** | As above — the anonymous respondent path depends on it entirely |
| **Forms metadata pushed** | Creates the `Form Respondent` role and its CanCreate-only permissions |

The host should also add Forms to its own CodeGen `excludeSchemas` (or use an `includeSchemas`
allow-list), so *its* CodeGen never generates `__mj_BizAppsForms` artifacts into *its* packages —
the mirror image of what this repo does.

| | |
|---|---|
| **Database schema** | `__mj_BizAppsForms` |
| **Entity prefix** | `MJ_BizApps_Forms: ` |
| **npm scope** | `@mj-biz-apps/forms-*` |
| **MJ version** | pinned to exactly **`5.50.0`**. The floor is set by our own dependencies, not by us: `bizapps-common` and `bizapps-tasks` both require `>=5.44.0`, and 5.50.0 is the first release with CodeGen's `includeSchemas` allow-list |
| **Ports** | MJAPI `4121` · MJExplorer `4321` |

---

## 🗺️ Roadmap

<table>
<tr><th>Phase 1 — MVP (the differentiating slice)</th><th>Phase 2 — Power</th></tr>
<tr valign="top"><td>

- Schema + entities, migrate + CodeGen
- **Public submit endpoint** (anon scope · Turnstile · rate-limit · quota)
- **Mobile-first `<mj-form>` widget** (both render modes, a11y, file upload)
- Visual **builder / admin** in MJExplorer + publish → `FormVersion`
- **AI authoring** action/agent + template gallery
- **Reporting dashboard** (summaries · funnel · export)
- On-submit hooks (link Person · email · create Task)

</td><td>

- `FormGroup` + **view-projection** & opt-in **RSU materialization**
- Advanced question types (Matrix, Ranking, Address, Signature, Payment)
- **LLM-judge** scoring on free-text answers
- **Review/approve-before-publish** routing via bizapps-tasks
- Partial-response resume · advanced quotas · richer logic

</td></tr>
</table>

---

## 📚 The plan is the source of truth

Everything above is distilled from **[`plans/FORMS_BUILD_PLAN.md`](plans/FORMS_BUILD_PLAN.md)** — the
durable, byte-for-byte build plan and business case. It holds the full entity model, the
anonymous-submission design, the dual-persistence / RSU approach, the phasing, and the decision gates
(DG-1…DG-6). **Read its Status Snapshot + Progress Log before starting any session.**

> The competitive-pricing section in the plan (§1.3) is from model knowledge and is flagged for live
> re-verification — it is not load-bearing and should not be quoted as fact.

---

## 🌿 Branching

`next` (integration — feature PRs land here) → `main` (release — publishes on push). Cut feature
branches **from `next`**; they must track the same-named remote. Never commit directly to `main`.

## 📄 License

[ISC](https://opensource.org/license/isc-license-txt) © [MemberJunction](https://memberjunction.com).
Full source on GitHub — free and unrestricted for nonprofits, forever.
