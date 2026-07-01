# Phase 1 — Parallel Build Decomposition

> Supervisor working doc. Companion to `FORMS_BUILD_PLAN.md` (the source of truth for **what**;
> this doc is **how we split it across agents**). Every spawned agent must read both this file
> and `FORMS_BUILD_PLAN.md` (§§4–8) before writing code.

## Where we are (branch flow)

Push to `MemberJunction/bizapps-forms` is **blocked** for the current account (read-only). We work
**locally** until write access is sorted; nothing here pushes.

```
feature/phase1-foundation   ← 31a523d  SHARED BASE. Has the committed codegen gate
        │                      (entities, resolvers, Angular forms, schema.graphql; build green).
        │                      EVERY agent forks its branch from THIS commit.
        ▼
   feature/<slice>          ← one per work package below; merged back into the foundation locally
        ▼
      next (= main)         ← local promotion target once Phase 1 integrates
```

- **Base for all agents:** `feature/phase1-foundation` (`31a523d`). Fork with
  `git checkout -b feature/<slice> feature/phase1-foundation`.
- Recommend **git worktree isolation** for the three `forms-ng` packages (WP-C/D/F) so they don't
  collide in one working tree.
- `next` and `main` are realigned locally (both at `042a252`); the foundation commit sits on top of
  them on the foundation branch only.

## Foundation facts (already done — do NOT redo)

- Migration `migrations/B202606281200__v0.1.x_Schema_and_Tables.sql` applied; 10 Forms entities live.
- CodeGen ran; generated types committed in `31a523d`. `npm run build:packages` is green.
- **NEVER hand-edit `**/generated/**`.** Re-run `npm run mj:codegen` after any schema change.

### Entity name reference (use these exact names with `md.GetEntityObject<T>(name, contextUser)`)

| Entity name | Generated class |
|---|---|
| `MJ_BizApps_Forms: Forms` | `mjBizAppsFormsFormEntity` |
| `MJ_BizApps_Forms: Form Categories` | `mjBizAppsFormsFormCategoryEntity` |
| `MJ_BizApps_Forms: Form Styles` | `mjBizAppsFormsFormStyleEntity` |
| `MJ_BizApps_Forms: Form Versions` | `mjBizAppsFormsFormVersionEntity` |
| `MJ_BizApps_Forms: Form Pages` | `mjBizAppsFormsFormPageEntity` |
| `MJ_BizApps_Forms: Form Questions` | `mjBizAppsFormsFormQuestionEntity` |
| `MJ_BizApps_Forms: Form Question Options` | `mjBizAppsFormsFormQuestionOptionEntity` |
| `MJ_BizApps_Forms: Form Responses` | `mjBizAppsFormsFormResponseEntity` |
| `MJ_BizApps_Forms: Form Response Answers` | `mjBizAppsFormsFormResponseAnswerEntity` |
| `MJ_BizApps_Forms: Form Distributions` | `mjBizAppsFormsFormDistributionEntity` |

Server bootstrap export: `LoadBizAppsFormsServer` (`packages/Server/src/index.ts`). Client:
`LoadBizAppsFormsClient` (`packages/Angular/src/public-api.ts`). Server-side entity lifecycle hooks
live in `@mj-biz-apps/forms-core-entities-server`.

---

## Shared seams (the contract — frozen by supervisor, agents code against it)

These are the only cross-agent interfaces. Treat them as fixed; propose changes back to the
supervisor rather than diverging.

### S1 — Public submit + read API (owned by WP-B, consumed by WP-C)

Net-new **custom resolvers** in `forms-server` (NOT the generated CRUD — those require auth; these
run under the anonymous magic-link `mj_scopes` session per FORMS_BUILD_PLAN §4).

```graphql
# Read: widget loads a published form by its distribution slug
query PublishedForm(distributionSlug: String!): PublishedFormDefinition
# PublishedFormDefinition = { formVersionId, renderMode, settingsJSON, styleTokensJSON,
#                             pages[] -> questions[] -> options[], with ConditionalRule/Validation JSON }

# Write: submit (or partial-save) a response
mutation SubmitFormResponse(input: FormSubmissionInput!): FormSubmissionResult!

input FormSubmissionInput {
  distributionSlug: String!      # resolves FormDistribution -> Form -> published FormVersion
  formVersionId: ID!             # echoed back from PublishedForm; pins the response
  partial: Boolean               # true => Status 'Partial', false => 'Complete'
  startedAt: DateTime
  turnstileToken: String         # required iff the form/distribution has captcha on
  clientMeta: ClientMetaInput     # { referrer, userAgent } — IP-hash computed server-side
  answers: [FormAnswerInput!]!
}
input FormAnswerInput {
  questionId: ID!
  textValue: String  numericValue: Float  dateValue: DateTime
  booleanValue: Boolean  jsonValue: String  fileId: ID
}
type FormSubmissionResult {
  success: Boolean!  responseId: ID  status: String
  confirmationMessage: String  redirectUrl: String  errors: [FieldError!]
}
```

Server responsibilities behind `SubmitFormResponse`: Turnstile verify (per-form toggle) → rate-limit
→ quota (`FormDistribution.MaxResponses`/`ResponseCount`) → dedupe → IP-hash + UA capture → Save
`FormResponse` + `FormResponseAnswer` (anonymous-scope CanCreate) → fire on-submit Actions by name
(see S3). Server re-validates ConditionalRule visibility + required/validation before Save.

### S2 — ConditionalRule + Validation JSON (shared schema; each side implements its own evaluator)

Stored on `FormPage.ConditionalRule` and `FormQuestion.ConditionalRule` / `.ValidationRule`.
Widget (WP-C) evaluates client-side; server (WP-B) re-validates. Canonical shape:

```jsonc
{ "show": { "all": [ { "questionId": "<id>", "op": "equals", "value": "Other" } ] } }
```

Operators: `equals notEquals in notIn isAnswered greaterThan lessThan contains`. Combinators:
`all` / `any`. WP-C owns the canonical TS model + evaluator in `packages/Angular/src/lib/shared/`
(`form-definition.model.ts`, `conditional-rule.ts`); WP-D/WP-F **import** from there, don't fork it.

### S3 — On-submit Action names (owned by WP-E, invoked by WP-B by name)

WP-B invokes these via the MJ Action runner by name; WP-E implements them as Action subclasses.
Names are the contract:

- `Forms: Upsert Respondent Person` (create/link `MJ_BizApps_Common: People`, set
  `FormResponse.RespondentPersonID`)
- `Forms: Send Confirmation Email`
- `Forms: Create Followup Task` (`MJ_BizApps_Tasks: Tasks`)

### File-ownership / collision rules (non-negotiable for clean parallel merges)

- **Never touch `**/generated/**`** — CodeGen owns it.
- **Append-only shared files** (one line per WP; on conflict keep both lines):
  `packages/Angular/src/public-api.ts`, `packages/Server/src/index.ts`,
  `packages/Actions/src/index.ts`.
- **`metadata/`** is owned solely by **WP-A**.
- `forms-ng` subfolders are partitioned: `lib/widget/` (C), `lib/builder/` (D), `lib/dashboard/` (F),
  `lib/shared/` (C owns, D/F read-only).

---

## Work packages (all fork from `feature/phase1-foundation`; can run in parallel after this doc)

> Dependency note: only two real runtime couplings exist, and the seams above decouple them —
> WP-C↔WP-B (via S1) and WP-B↔WP-E (via S3). Everything else is independent. End-to-end integration
> (widget → submit → save → hooks) is verified when A+B+C+E land together.

### WP-A — Metadata & access (mj-sync)
- **Branch:** `feature/phase1-metadata` · **Owns:** `metadata/` only · **Deps:** none (start now)
- **Build (FORMS_BUILD_PLAN §9 line 3, §4.1):**
  - FormCategory starter tree; FormStyle defaults = the 3 themes (Editorial default / Aurora / Warm)
    as `CSSVariables` rows lifted from `docs/app/design-system.css` `[data-theme]` blocks.
  - **"Form Respondent" role + entity permissions: CanCreate on `Form Responses` /
    `Form Response Answers` ONLY**, read on the published-form definition entities. The one magic-link
    write exception (§4.1). Author as mj-sync metadata, following `MJ/guides/MAGIC_LINK_GUIDE.md` §4.
  - Application + nav metadata so the builder/admin surfaces appear in Explorer.
- **Done:** `mj sync push` (dry-run ok locally) validates; role grants exactly CanCreate-on-responses.

### WP-B — Public submit endpoint + anti-abuse (forms-server)
- **Branch:** `feature/phase1-submit-endpoint` · **Owns:** `packages/Server/src/**` (non-generated) ·
  **Deps:** S1 (defines it), S3 (calls by name), WP-A role (for real e2e; mock until then)
- **Build (§9 line 4, §4.2):** implement S1's `PublishedForm` + `SubmitFormResponse` custom resolvers;
  anonymous `mj_scopes` check; Cloudflare Turnstile verify (per-form toggle, DG-4); rate-limit; quota;
  dedupe; IP-hash + UA capture; Save `FormResponse` + answers; fire S3 Actions by name. Decompose into
  small services (turnstile, ratelimit, quota, persistence). Wire resolver paths via `RESOLVER_PATHS`.
- **Done:** Vitest covers scope-denied, quota-exceeded, turnstile-fail, happy-path Save + hook fire.

### WP-C — Respondent widget (forms-ng custom element)
- **Branch:** `feature/phase1-widget` (worktree) · **Owns:** `lib/widget/**`, `lib/shared/**` ·
  **Deps:** S1 (codes against it; mock resolver until WP-B lands), S2 (owns the model+evaluator)
- **Build (§9 line 5, §2):** `<mj-form>` Angular **custom element** (no Explorer shell). Both render
  modes (Scroll + OneQuestion); mobile-first to the §2 UX bar (WCAG AA, per-field mobile keyboards,
  large tap targets, progress signal); themed purely via `--mj-*`/`--mjf-*` tokens from `styleTokensJSON`
  (zero hardcoded colors); client-side ConditionalRule eval (S2); file upload → `MJ: Files`; partial save.
- **Done:** renders all Phase-1 question types (§5.3), passes a11y checks, builds as an element bundle.

### WP-D — Builder / admin app (forms-ng + MJExplorer)
- **Branch:** `feature/phase1-builder` (worktree) · **Owns:** `lib/builder/**`, MJExplorer route/config ·
  **Deps:** generated entity forms (foundation), S2 model (read-only import from `lib/shared/`)
- **Build (§9 line 6):** visual builder (pages/questions/options + ConditionalRule editor);
  publish → snapshot into `FormVersion.DefinitionSnapshot`; FormDistribution management (public link /
  embed / QR). Reuse MJ dashboard/grid infra; dialog buttons confirm-LEFT cancel-RIGHT.
- **Done:** can build a form, publish a version, mint a distribution slug the widget can load.

### WP-E — AI authoring + on-submit actions + templates (forms-actions)
- **Branch:** `feature/phase1-actions` · **Owns:** `packages/Actions/src/**` (non-generated) ·
  **Deps:** entities (foundation); provides S3
- **Build (§9 lines 7 & "On-submit hooks"):** AI authoring agent/action (§7) that writes
  Form/Page/Question/Option rows from an NL brief (reuse the deterministic Form Builder agent pattern);
  starter template gallery; the 3 S3 on-submit Action subclasses. Use latest Claude models for the agent.
- **Done:** NL brief → valid draft form; each S3 action runs and is registered by name.

### WP-F — Reporting dashboard (forms-ng + MJExplorer)
- **Branch:** `feature/phase1-reporting` (worktree) · **Owns:** `lib/dashboard/**`, MJExplorer dashboard
  registration · **Deps:** entities (foundation); S2 model read-only; sample responses (seed/mock)
- **Build (§9 line 8, §8.1):** BaseDashboard — summary stats, per-question breakdowns (charts / AG Grid),
  completion + drop-off funnel, individual response view, CSV/Excel export. RunView/RunViews + RunQuery only.
- **Done:** dashboard renders against seeded responses; export works; all colors are tokens.

### Cross-cutting — Tests & CI gates (§9 last line)
Each WP ships its own Vitest coverage. A small CI pass (UI-token gate, `mj-btn` gate) can be a WP-A
add-on or a final supervisor task.

---

## Suggested wave plan
- **Now (parallel, 6 agents):** A, B, C, D, E, F all fork from `31a523d` and build against the seams.
- **Integration checkpoint:** merge A+B+C+E → run the anonymous submit e2e (widget → endpoint → Save →
  hooks). Then fold in D (authoring path) and F (reporting over real responses).
- Supervisor merges each `feature/<slice>` back into `feature/phase1-foundation` as it greens, then
  promotes the foundation to `next` once Phase 1 integrates.
