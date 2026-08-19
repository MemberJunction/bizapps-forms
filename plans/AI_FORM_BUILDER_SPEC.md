# AI Form Builder — Implementation Spec

**Status:** Draft for implementation · **Date:** 2026-08-19 · **Author:** Soham Desai (research + verification via Claude)
**Audience:** the build agent implementing this feature. Every file/class/line reference in this document was
verified against the working tree (branch `feat/forms-ui-redesign`) and against the MemberJunction source
checkout at `~/Projects/MJ` on 2026-08-19 — including at the **`v5.51.0` git tag**, so nothing here depends on
6.x-only APIs. Where behavior differs between 5.51.0 and the current 6.1.0-edge workspace, it is called out.

---

## 1. Goal

When an author types a natural-language brief — or pastes a raw list of questions — MJ Forms generates a
**complete, review-ready draft form**: pages, questions with correct types/options/validation, conditional
logic where the brief implies it, a Welcome and Ending screen, AI-generated images where they add value
(PictureChoice options, screen hero media), and a visual theme. The build is **streamed**: the author watches
the form assemble live in the existing builder preview with a determinate progress bar, then lands in the
normal editable Design tab. **No new rendering technology, no headless browser, no screenshot verification —
anywhere.** Correctness comes from schema-constrained generation + deterministic validation, and the review
surface is the existing live `<mj-form>` preview.

### Non-goals (hard exclusions — do not build these)

- **No Playwright / headless-render / screenshot loop** in generation or verification. The preview stage
  (`packages/Angular/src/lib/builder/form-preview-stage.component.ts`) renders the real widget from entity
  data; that *is* the verification surface, and the author is the verifier.
- **No `@memberjunction/ai-form-builder` dependency.** Verified: that package generates a JSX
  `ComponentSpec` overriding one entity's CRUD detail form (MJ Explorer's Form Studio). Its payload has no
  field a survey schema can populate. We reuse its *pattern* (Designer LLM → deterministic Builder →
  bounded lint-fix retry), not its code.
- **No `BaseAgent`/`MJAIAgentRun` hierarchy.** The existing single-Action + `AIPromptRunner` architecture
  already provides schema-constrained output and validated retry. Revisit only if/when the Phase-3
  iterative-refine turn needs multi-turn state.
- **No new realtime infrastructure.** Progress rides MJ's existing `PubSubManager` →
  `statusUpdates` graphql-ws subscription (verified present at v5.51.0; see §6).
- **No open-ended DB/schema discovery ("RAG over the database").** Known-data reuse is scoped to
  `bizapps-common` People fields only (Phase 3).
- **No live per-keystroke generation.** Generation triggers on explicit submit. The "live" part is the
  *build* streaming, not the input.

---

## 2. Current state (all verified in-tree)

The pipeline already exists as `Forms: Generate Form From Brief` — this project **extends** it.

| Piece | File | Verified behavior |
|---|---|---|
| Action | `packages/Actions/src/custom/authoring/generate-form.action.ts` | `@RegisterClass(BaseAction, 'Forms: Generate Form From Brief')`. Params: `Brief` (required), `OwnerUserID`. Outputs: `FormID`, `FormVersionID`, `PageCount`, `QuestionCount`, `OptionCount`, `Blueprint`. Result codes: `SUCCESS`, `MISSING_PARAMETERS`, `DESIGN_FAILED`, `PERSIST_FAILED`, `FAILED`. Pipeline entry: `runAuthoring()` (line 59). |
| Designer | `packages/Actions/src/custom/authoring/llm-form-designer.ts` | Runs the metadata-driven **`Forms: Form Designer`** AIPrompt via `AIPromptRunner.ExecutePrompt<FormBlueprint>` with `attemptJSONRepair = true` (line 75). Retry loop `designFormFromBrief()` feeds `PreviousAttempt` + `ValidationError` back into the prompt, capped at `MAX_DESIGNER_ATTEMPTS = 3` (line 108). Model selection is 100% metadata (`SelectionStrategy='Specific'` + AI Prompt Model row) — **no model name in code, keep it that way**. Testability seam: `FormDesignerModel` interface + `setFormDesignerModel()` for stubs. |
| Blueprint | `packages/Actions/src/custom/authoring/form-blueprint.ts` | Zod schema. Question-type enum **derived** from the contract (`FORM_QUESTION_TYPES` in `packages/Entities/src/contracts/question-types.ts`, 25 types) with a compile-time drift guard (lines 148-152). `CHOICE_QUESTION_TYPES` derived from `questionTypeBehavior().optionMode`. Options support `imageURL` + `matrixAxis`. `parseFormBlueprint()` + `extractJSON()` handle fenced/prose-wrapped LLM JSON. |
| Builder | `packages/Actions/src/custom/authoring/form-blueprint-builder.ts` | `buildFormFromBlueprint()` deterministically persists Form (Draft) → FormVersion (v1, Draft) → FormPages → FormQuestions → FormQuestionOptions via `GetEntityObject` + checked `Save()`. Throws `FormPersistError` on **first** failed save — no retry (gap G4). Entity name map at lines 22-28. |
| Prompt metadata | `metadata/templates/templates/forms-form-designer.template.md` (prompt text), `metadata/ai-prompts/forms-form-designer.output-example.json` (schema-by-example), plus mj-sync record files `metadata/templates/.forms-form-designer-template.json`, `metadata/ai-prompts/.forms-form-designer-prompt.json`. Shipped via `migrations/V202608182130__v0.11.x__Metadata_Sync_Designer_Taxonomy.sql`. |
| Client wiring | `packages/Angular/src/lib/home/forms-home-dashboard.component.ts:241` `authorWithAI()` → `forms-home.service.ts:108` `runAuthoringAction()` → `new GraphQLActionClient(GraphQLDataProvider.Instance).RunAction(actionId, inputs)` (line 116). One blocking mutation; on success opens the created form. |
| Preview | `form-preview-stage.component.ts` renders the real `<mj-form>` from `buildPublishedDefinition(tree, style, …)` (`packages/Angular/src/lib/builder/snapshot-builder.ts`, used at `form-builder.component.ts:228`). Builder state is **local-only**: `builder-state.service.ts` `loadTree()` runs RunView once; nothing polls or refetches. |

### Confirmed gaps this spec closes

- **G1 — No theme.** Builder never sets `Form.StyleID` / creates a `FormStyle` row.
- **G2 — No screens.** No `FormScreen` (Welcome/Ending) rows created.
- **G3 — No logic/validation.** Blueprint has no `conditionalRule` / `validationRule`; the DB columns and
  the published contract both already support them.
- **G4 — No persist self-heal.** First failed `Save()` aborts.
- **G5 — Blocking single-shot UX.** No streaming, no progress, no brief-vs-pasted-questions distinction.
- **G6 — No images.** `FormQuestionOption.ImageURL` / `FormScreen.MediaURL` are never populated by AI.

### Schema facts the build agent needs (ground truth = generated ORM, per `.claude/rules/data-access.md`)

From `packages/Entities/src/generated/entity_subclasses.ts` (verified):

- **`mjBizAppsFormsFormScreenEntity`** (`MJ_BizApps_Forms: Form Screens`): `FormID`, `ScreenType`
  (`'Welcome' | 'Ending'`), `Title`, `Body`, `ButtonLabel`, `MediaURL`, `RedirectURL`, `SocialLinks`,
  `DisplayOrder`, `ConditionalRule`, `IsDefault`. At most one Welcome per form (filtered unique index);
  multiple Endings allowed, `ConditionalRule` selects among them, `IsDefault` marks the fallback.
- **`mjBizAppsFormsFormStyleEntity`** (`MJ_BizApps_Forms: Form Styles`): `Name`, `Description`,
  `CSSVariables` (JSON map of `--mjf-*` token overrides), `CustomCSS`, `LogoURL`, `DisplayRank`, `IsActive`.
  Linked from `Form.StyleID`.
- **`mjBizAppsFormsFormQuestionEntity`**: has `ValidationRule` (JSON) and `ConditionalRule` (JSON) columns.
  `mjBizAppsFormsFormPageEntity` has `ConditionalRule` too.
- **Contracts:** `packages/Entities/src/contracts/conditional-rule.ts` defines `ConditionalRule` +
  `ValidationRule` (operators `equals/notEquals/in/notIn/isAnswered/greaterThan/lessThan/contains`,
  combinators `all/any`). `packages/Entities/src/contracts/form-definition.ts` — the published shape —
  **already carries** `conditionalRule` on pages/questions/screens (lines 85/101/150/198), `styleTokens`
  (line 214), and `screens` (line ~232). **The preview can therefore render everything this spec generates
  with zero contract changes.**

**No schema migration is required for any phase of this spec.** New AIPrompt/template metadata *does*
require a regenerated `V…__Metadata_Sync.sql` migration + `npm run seed:manifest` (repo rule: `migrations/`
is the only thing that ships; `npm run lint:distribution` enforces). Follow `migrations/README.md` for the
regeneration recipe — it is not a plain re-push.

### MJ-core APIs this spec depends on — availability verified at the `v5.51.0` tag

| API | Location (MJ repo) | Verified |
|---|---|---|
| `PubSubManager.Instance.Publish(topic, payload)` | `packages/MJServer/src/generic/PubSubManager.ts:39` (BaseSingleton) | ✅ at v5.51.0 |
| `statusUpdates` subscription, topic `PUSH_STATUS_UPDATES` | `packages/MJServer/src/generic/PushStatusResolver.ts` — filter is **`payload.sessionId === args.sessionId` only** at 5.51.0 (a stricter owner filter exists in 6.x) | ✅ at v5.51.0 |
| `GraphQLDataProvider.PushStatusUpdates(sessionId): Observable<string>` | `packages/GraphQLDataProvider/src/graphQLDataProvider.ts:3123`; client's own id via `public get sessionId()` (line 384) | ✅ at v5.51.0 |
| Client progress-filter template | `graphQLVersionHistoryClient.ts:117-140` (`CreateLabelProgress` pattern: subscribe before mutation, `JSON.parse`, filter on discriminator fields) | ✅ at v5.51.0 |
| `Generate Image` core Action | `packages/Actions/CoreActions/src/custom/ai/generate-image.action.ts` — params `Prompt`, `Model?`, `Size?`, `Quality?`, `Style?`, `NegativePrompt?`, `OutputFormat` (`'base64'` default); outputs `Images` (`MediaOutput[]` with base64 `data`), `RevisedPrompt`, `ModelUsed`. Resolves any active `AIModelType='Image Generator'` model + vendor `DriverClass` from metadata. | ✅ at v5.51.0 |
| `BaseImageGenerator` + providers (OpenAI gpt-image, Gemini, FLUX) | `packages/AI/Core/src/generic/baseImage.ts:358` | ✅ at v5.51.0 |
| `FileStorageEngine.UploadFile` | `packages/MJStorage/src/FileStorageEngine.ts` | ✅ at v5.51.0 |

Note: this branch's `packages/*` peer ranges currently read `^6.1.0-edge.1` (e.g.
`packages/Server/package.json:36`), ahead of the CLAUDE.md 5.51.0 note. Every API above exists in both, so
this spec is safe under either resolution. Do not "fix" the pins as part of this work.

---

## 3. Architecture overview

One Action, staged internally. The LLM never touches the database; deterministic code never guesses.

```
Author submits brief (or pasted questions) + SessionID
        │
        ▼
Forms: Generate Form From Brief  (packages/Actions — extended, same registration)
        │
        ├─ Stage 0  OUTLINE   AIPrompt "Forms: Form Outline"  → skeleton blueprint
        │                     persist Form + FormVersion + Pages + stub Questions
        │                     ── publish outline event (totals now known) ──▶
        ├─ Stage 1  DETAIL    AIPrompt "Forms: Page Detail" × N pages (bounded parallel)
        │                     validate (zod, derived from contracts) → persist per page
        │                     ── publish page event per page ──▶
        ├─ Stage 2  IMAGES    Designer-flagged imagePrompts → "Generate Image" core action
        │                     → GeneratedImageStore seam → forms-assets URL → ImageURL/MediaURL
        │                     ── publish image event per image ──▶
        ├─ Stage 3  THEME     AIPrompt "Forms: Theme Designer" → --mjf-* token JSON
        │                     contrast-check (readable-ink) → FormStyle row → Form.StyleID
        │                     ── publish theme event ──▶
        └─ done               ── publish complete event ──▶  + normal action result
        │
        ▼
Angular builder: subscribed via PushStatusUpdates(sessionId); patches local tree per event;
progress bar total = 1 + N pages + M images + 1 theme; final loadTree() reconciles.
```

**Resilience principle (load-bearing):** the progress channel is **cosmetic only**. The awaited `RunAction`
result plus a final `builder-state.service.loadTree()` refetch is the single source of truth. A dropped
websocket, missed event, or subscription race must never corrupt the outcome — worst case the author sees a
plain spinner and then the finished form.

### Dependency seams (required — verified dependency constraints)

`packages/Actions` has **no** dependency on `@memberjunction/server` or `@memberjunction/storage` (only
`packages/Server` does). Do not add them. Instead follow the repo's existing seam precedent
(`setFormDesignerModel()` in `llm-form-designer.ts`):

1. **`FormsProgressPublisher`** — interface in `packages/Actions` (`publish(event: GenerateFormProgressEvent): void`),
   default no-op. `packages/Server` registers the real implementation in `LoadBizAppsFormsServer()`
   (`packages/Server/src/index.ts:84`) wrapping
   `PubSubManager.Instance.Publish('PUSH_STATUS_UPDATES', { sessionId, message: JSON.stringify(event) })`.
2. **`GeneratedImageStore`** — interface in `packages/Actions`
   (`store(formId, bytes: Buffer, contentType, fileName, contextUser): Promise<{ url: string }>`), no
   default (image stage skips with a logged notice if unregistered). `packages/Server` registers an
   implementation in `LoadBizAppsFormsServer()` that reuses the existing authoring-asset pipeline:
   `runAssetUpload()` / `FileStorageEngine.UploadFile` with `assetPathPrefix(formId)` and returns
   `assetPublicUrl(fileId)` (`packages/Server/src/asset/asset.service.ts:153`, `asset/config.ts:100,160`).

Unit tests stub both seams; no network, no storage account, no websocket needed — exactly like the
existing `generate-form.action.spec.ts` stubs the Designer.

---

## 4. Workstream A — Extend the blueprint + Designer (closes G1/G2/G3, part of G6)

**Packages:** `packages/Actions` (schema + builder), `metadata/` (prompt), one regenerated Metadata_Sync migration.

### A1. Blueprint schema (`form-blueprint.ts`)

Extend — deriving every type from the contracts in `packages/Entities/src/contracts/` (never hand-copy a
union; keep the existing drift-guard style and add guards for any new derived union):

```
blueprintQuestionSchema  += key?: string            // unique slug within the form, e.g. "diet";
                                                    // conditional rules reference keys, since real IDs
                                                    // don't exist until persist
                          += validationRule?        // shape from contracts/conditional-rule.ts ValidationRule
                          += conditionalRule?       // shape from contracts ConditionalRule, but with
                                                    // question KEYS in place of question IDs
blueprintOptionSchema    += imagePrompt?: string    // Designer's request for a generated image (PictureChoice)
blueprintPageSchema      += conditionalRule?        // key-referencing, as above
formBlueprintSchema      += screens?: {
                               welcome?:  { title, body?, buttonLabel?, imagePrompt? }
                               endings:   [{ title, body?, buttonLabel?, redirectURL?,
                                             conditionalRule?, isDefault?, imagePrompt? }]
                             }
                          += theme?: {
                               brandAdjectives?: string[]   // e.g. ["warm","professional"]
                               brandURL?: string            // reserved; NOT fetched in this phase (see A4)
                             }
```

Add a zod `superRefine` that validates key integrity: every `conditionalRule` reference resolves to a
declared question `key`, keys are unique, and a rule never references a question on a later page than the
one it gates (forward-only visibility, matching the runtime evaluator). A violation is a normal validation
error → flows back through the existing Designer retry loop.

### A2. Builder persistence (`form-blueprint-builder.ts`)

- Maintain a `key → created FormQuestion.ID` map during persist; serialize `ConditionalRule` JSON with real
  IDs substituted before saving to `FormPage.ConditionalRule` / `FormQuestion.ConditionalRule` /
  `FormScreen.ConditionalRule`.
- Persist `FormQuestion.ValidationRule` when present.
- Create `FormScreen` rows: at most one Welcome; endings in order; exactly one ending `IsDefault` (force
  the first if the Designer marks none — never zero, never two).
- Create a `FormStyle` row + set `Form.StyleID` (Workstream C fills its contents; on Phase-A-only builds
  a form simply has no style row, as today).
- **G4 — bounded persist retry:** wrap each `save()` failure in one classification step. Transient/fixable
  failures (duplicate name → append suffix; string-too-long → truncate with ellipsis; FK/ordering issue →
  re-sequence) get **one deterministic repair, then one retry**, overall attempts per row capped at
  `MAX_PERSIST_ATTEMPTS = 3`. Anything else throws `FormPersistError` immediately, as today. This mirrors
  MJ's `RETRYABLE_LINT_CODES` pattern (`FormBuilderBuilderAgent`) but with deterministic repairs, not an
  LLM call — do not add an LLM to the persist path.
- Half-built cleanup: on abort after the Form row exists, leave the Draft form in place and return its ID
  with result code `PARTIAL` and a clear message — a reviewable partial draft beats a silent orphan, and
  Draft forms are already invisible to respondents.

### A3. Prompt metadata

Update `metadata/templates/templates/forms-form-designer.template.md` +
`metadata/ai-prompts/forms-form-designer.output-example.json` for the extended shape, including:

- The two **input modes**: template receives `InputMode` (`'brief' | 'questions'`). For `questions`
  (author pasted a raw list), instruct: *preserve pasted question wording verbatim; only infer types,
  options, ordering, and grouping* — the Typeform "import questions" distinction.
- Guidance on when to emit `imagePrompt` (PictureChoice options; a Welcome hero when the form's subject is
  visual; **never** decorative images on every question) and on conditional logic (*only when the brief
  implies it — never invent branching*).
- Keep `OutputType='object'`, `ResponseFormat='JSON'`, `SelectionStrategy='Specific'` as-is. Model changes
  are metadata operations (AI Prompt Model row), never code.

Then: `mj sync push` → regenerate the Metadata_Sync migration per `migrations/README.md` →
`npm run seed:manifest` → `npm run lint:distribution` must pass.

### A4. Theme input — text-only in this phase

`theme.brandURL` is accepted into the schema but **not fetched**. Server-side fetching of author-supplied
URLs is an SSRF vector (this API also serves anonymous traffic) and needs its own hardening design
(scheme allowlist, private-IP blocklist, timeout, size cap). Deterministic brand extraction is Phase 3
(§9). Competitors' data says extraction beats LLM-guessed palettes — we get there, safely, later.

**Action params added:** `InputMode` (optional, default `'brief'`), `SessionID` (optional — enables
progress publishing; absent = silent build, e.g. tests/API callers).

**Acceptance (A):** unit tests with a stubbed `FormDesignerModel` prove: extended blueprint round-trips;
key-referencing rules persist with real IDs; screens rows created with exactly one default ending;
invalid key references trigger the Designer retry path; persist retry repairs a forced duplicate-name
failure and caps at 3.

---

## 5. Workstream B — Staged generation (closes G5 server half)

Restructure the inside of `runAuthoring()` into the four stages of §3, keeping the external Action
contract identical (same name, params superset, same output params).

- **New prompts** (same metadata layout + sync/migration workflow as A3):
  - `Forms: Form Outline` — returns form name/description/renderMode/screens-skeleton + pages with
    question stubs (`key`, `type`, `prompt` only). Small and fast — this gates time-to-first-paint.
  - `Forms: Page Detail` — input: the brief, the full outline (for coherence), and one page's stubs;
    returns that page's complete questions (options, settings, helpText, validationRule, conditionalRule,
    imagePrompts). Run per page with concurrency `PAGE_DETAIL_CONCURRENCY = 3`.
  - Keep `Forms: Form Designer` (single-shot) as the fallback path when `SessionID` is absent — one call,
    no events, current behavior. This also keeps existing tests meaningful during the transition.
- Persist order: outline persists Form/Version/Pages/stub Questions immediately (stubs are real
  `FormQuestion` rows with type+prompt, refined in place by detail passes); each detail pass updates its
  page's questions and adds options; images and theme update rows as they land.
- Each stage failure is isolated: a failed page-detail call falls back to keeping that page's stubs
  (flagged in the completion event as `degraded: ["page:2"]`); a failed image or theme stage never fails
  the run. Only outline failure fails the action (`DESIGN_FAILED`).
- Every stage call goes through the existing `FormDesignerModel`-style seam so the whole pipeline is
  unit-testable offline; per-stage LLM retry stays at `MAX_DESIGNER_ATTEMPTS = 3` *per stage call*.

**Acceptance (B):** stubbed-model test drives the full staged pipeline and asserts the exact event
sequence of §6 against a stub publisher; a page-detail stub that always fails yields a completed run with
that page degraded and the correct `degraded` marker; no-`SessionID` invocation emits zero events and
matches today's single-shot behavior.

---

## 6. Progress event protocol (closes G5 transport)

Published through the `FormsProgressPublisher` seam; each event is one `statusUpdates` message whose
`message` field is JSON:

```jsonc
{ "resolver": "FormsGenerate", "type": "GenerateFormProgress",   // fixed discriminators — client filters on both
  "formId": "…", "step": 3, "total": 9,                          // total = 1 outline + N pages + M images + 1 theme
  "stage": "outline" | "page" | "image" | "theme" | "complete",
  "payload": { /* stage-specific, see below */ } }
```

- `outline` payload: form name/description/renderMode + pages (id, title, question stubs with real IDs) +
  screens skeleton. From this event the client knows `total` — the progress bar is determinate from step 1.
- `page` payload: pageId + fully-detailed questions/options for that page (real IDs, ready to graft into
  the tree).
- `image` payload: target (`{ optionId }` or `{ screenId }`) + final asset `url`.
- `theme` payload: the `CSSVariables` token map + `styleId`.
- `complete` payload: the action's summary counts + `degraded: string[]`.

Size guard: events carry entity-shaped fragments, never base64 image bytes (images travel as URLs — the
same reason MJ's `Generate Image` action keeps base64 out of its `Message`).

Privacy note (5.51.0 semantics): the subscription filter is sessionId equality only, and the sessionId is a
client-generated UUID passed by the same authenticated author — do not put anything in events beyond what
that author's own form contains.

---

## 7. Workstream C — Images (closes G6) and theme (closes G1)

### C1. Image stage

For each `imagePrompt` collected from the blueprint (options + screens), up to
`MAX_GENERATED_IMAGES = 6` per run (excess prompts are skipped **and named** in the completion event —
no silent caps):

1. Invoke the core **`Generate Image`** action via `ActionEngineServer.Instance.RunAction(...)` (the same
   in-process invocation pattern MJ's FormBuilderBuilderAgent uses), `OutputFormat: 'base64'`. Model
   selection stays metadata-driven — pass no `Model` param; operators pin the image model by activating
   exactly the `AIModelType='Image Generator'` model they want.
2. Decode → hand bytes to the **`GeneratedImageStore`** seam. The server-side implementation MUST route
   through the existing asset pipeline (`runAssetUpload` context), inheriting its verified constraints:
   5 MiB cap, raster-only allowlist (PNG/JPEG/GIF/WebP — **SVG stays excluded**), public
   `forms-assets/<formId>/` prefix, immutable-cache response headers. Request PNG or WebP from the
   generator; validate through the same `validateImage()` gate as human uploads.
3. Write the returned URL to `FormQuestionOption.ImageURL` / `FormScreen.MediaURL` (checked `Save()`),
   publish the `image` event.
4. Any failure (no image model configured, generation error, storage error): log with context, mark
   degraded, continue. Images are enhancement, never a gate.

### C2. Theme stage

1. New AIPrompt `Forms: Theme Designer`: inputs are the brief + `theme.brandAdjectives`; output is a JSON
   object **constrained to the exact `--mjf-*` token vocabulary** the design panel edits (enumerate the
   tokens in the prompt's `OutputExample` — source of truth is the token set applied by
   `applyStyleTokens()` in `packages/Angular/src/lib/widget/core/theming.ts` and written by
   `design-panel.component.ts`). Unknown keys are stripped by a zod schema before persist.
2. **Deterministic contrast gate:** validate ink-vs-background pairs with the existing
   `packages/Angular/src/lib/widget/core/readable-ink.ts` helpers (WCAG AA is the §2 UX bar). If a
   generated pair fails, fix it deterministically with the readable-ink computation — do not re-prompt.
   (If that helper isn't importable from the Actions package cleanly, move the pure contrast math to
   `packages/Entities/src/contracts/` as its own refactor-only commit first — it has no Angular
   dependency; both widget and Actions then import the contract.)
3. Persist: `FormStyle.CSSVariables` = validated token JSON, `Name` = form name + " theme",
   `Form.StyleID` = new row. The design panel's `ensureOwnStyle()` model means the author lands with a
   per-form style they can immediately edit — identical to a hand-made theme.

**Acceptance (C):** stub image-model + stub store test proves cap enforcement, degraded-not-failed
behavior, and that stored URLs land on the right rows; theme test proves token-vocabulary stripping and
that a deliberately unreadable palette is corrected to AA before persist.

---

## 8. Workstream D — Client: streaming build UX (closes G5 client half)

**Package:** `packages/Angular`. Follow rule #4 (standalone leaf components, `@if`/`@for`, `inject()`).

### D1. `FormGenerationService` (new, `packages/Angular/src/lib/builder/`)

- `generate(brief, inputMode)`:
  1. `const sessionId = GraphQLDataProvider.Instance.sessionId;`
  2. Subscribe `PushStatusUpdates(sessionId)` **before** firing the mutation (the verified
     `CreateLabelProgress` template: `JSON.parse`, filter `resolver === 'FormsGenerate' && type === 'GenerateFormProgress'`);
     expose a typed `progress$` stream.
  3. Fire the existing `runAuthoringAction()` path with the added `SessionID` + `InputMode` params.
  4. On the awaited action result: unsubscribe, emit terminal state. **Always** trigger a final
     `loadTree()` reconcile — events are cosmetic (§3 resilience principle).
- Malformed/out-of-order events are dropped with a console warning, never thrown.

### D2. Builder "cooking" mode

- `authorWithAI()` navigates to the builder immediately after the `outline` event supplies `formId`
  (today it waits for the whole action). The builder opens in **generating mode**: the normal Design tab
  layout with (a) a determinate progress bar (`step/total` from events) + stage label ("Designing
  pages…", "Generating images…", "Painting theme…"), (b) edit controls disabled until terminal state,
  (c) skeleton shimmer on screen-strip slots for not-yet-detailed pages — reuse `<mj-loading>`'s visual
  language and existing `--mjf-*` tokens (rule: no hardcoded colors).
- Each event **patches the local tree** (`builder-state.service` gets narrow apply methods:
  `applyOutline`, `applyPageDetail`, `applyImage`, `applyTheme`) — `buildPublishedDefinition()` then
  re-derives the preview on normal change detection. No polling, no refetch per event.
- Theme event applies live via the same `applyStyleTokens()` path the design panel already uses.
- Terminal state → reconcile `loadTree()` → enable editing → the form is now indistinguishable from a
  hand-authored one. If the subscription never delivered (proxy strips websockets, etc.), the awaited
  result alone produces the identical end state — just without the show.

### D3. Prerequisite fix (separate commit, refactor-only)

`mj-form.component.ts` reads its `definition` input **once** in `ngOnInit` (line 226; verified — no
`ngOnChanges`/signal reactivity), which is why `form-preview-modal` re-instantiates the component per
open. Make `definition` reactive (input setter or `ngOnChanges` re-running the existing `load()` path),
and remove the modal's re-instantiation workaround. Its own commit, before D2 lands; the input's
contract becomes "the current definition", which is what its name already claims.

**Acceptance (D):** spec tests for the service's event parsing/filtering/terminal reconcile with a mocked
observable; component test that an `applyPageDetail` patch changes `designPreviewDefinition` output;
manual smoke via the MJ host (`~/Projects/MJ && pnpm start`, Explorer :4201) — watch a real brief build
live; kill the websocket mid-run and confirm the identical final form.

---

## 9. Phasing, commits, and constants

**Phase A (correctness):** Workstream A. Ships alone: single-shot generation now emits theme-less but
screen/logic/validation-complete forms. Commits: (1) blueprint+builder extension + tests, (2) prompt
metadata + regenerated Metadata_Sync migration.
**Phase B (streaming):** D3 fix commit → Workstream B + §6 seam/events → Workstream D. The dashboard
keeps working between commits because no-`SessionID` behavior is unchanged.
**Phase C (media + theme):** Workstream C (image stage commit, theme stage commit).
**Phase 3 (later, out of this spec's scope):** brand-URL extraction with SSRF hardening; People-field
context injection (curated `bizapps-common` People block in the outline prompt, preferring
`RespondentPersonID` capture over redundant free-text identity questions); iterative refine turn
(entity→blueprint reverse mapping + delta prompts).

Every phase: build the touched packages, run their `.spec.ts` suites (vitest — this repo uses `.spec.ts`,
no `test-utils`), and keep refactors in separate commits from behavior. No commits without explicit
approval (repo critical rule #1).

**Constants (all new caps in one place, `packages/Actions/src/custom/authoring/limits.ts`):**

| Constant | Value | Meaning |
|---|---|---|
| `MAX_DESIGNER_ATTEMPTS` | 3 (existing) | LLM retries per stage call |
| `MAX_PERSIST_ATTEMPTS` | 3 | per-row save attempts incl. deterministic repairs |
| `PAGE_DETAIL_CONCURRENCY` | 3 | parallel page-detail prompt calls |
| `MAX_GENERATED_IMAGES` | 6 | images per generation run; overflow reported, never silent |
| `STAGE_TIMEOUT_MS` | 120 000 | per stage; timeout ⇒ that stage degrades (outline ⇒ `DESIGN_FAILED`) |

## 10. What unit tests structurally cannot catch here (be honest in the PR)

Per `.claude/rules/testing.md`: prompt *quality* (does the outline actually match the brief), metadata
correctness on a host DB (prompt/template rows present — the `AIEngine` lookup fails loudly by design),
websocket behavior through real proxies, image model availability/cost, and the end feel of the streaming
UX. These are covered by the manual smoke in D's acceptance plus the degraded-path design (every optional
stage fails soft). Say so in the PR body rather than implying test coverage proves them.
