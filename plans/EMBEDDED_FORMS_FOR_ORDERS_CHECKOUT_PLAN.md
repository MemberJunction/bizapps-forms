# Embedded Forms Surface & Orders Checkout Consumption Plan

> **Timing:** Post-AIDP Go-Live (do not start before AIDP go-live is complete).  
> **Owners:**
> - **Forms side (`bizapps-forms`):** Soham (`@SDesai-BC`) — embeddable chromeless widget surface (`<mjf-form-embed>`), parent-driven validation/focus controller, theme bridge, and server-side embedded projection/submission API.
> - **Orders consumption side (`bizapps-orders`):** Boston (`@bg-BC`) — ingesting `Forms` inside `<mj-checkout-widget>` and `CheckoutSessionService`, supporting `perLine` and `perUnit` (`FormRuntime` per attendee/unit), registering `Orders` as a Forms distribution claim provider, and retiring bespoke checkout question renderers.
> - **Reviewer / Architecture Sign-Off:** Robert (`@rkihm-BC`)

---

## 1. Context, Codebase Research & Two-Tier Architecture

> **Note for Boston (`@bg-BC`) & Soham (`@SDesai-BC`):** The pre-work audit of how `bizapps-orders` currently collects checkout fields and how `bizapps-forms` materializes answers onto target entities (`FormEntityBinding`) has already been completed and is documented below so you do not need to do that discovery from scratch when picking this up.

### 1.1 Research Findings: The 3 Existing Mechanisms in `bizapps-orders` Checkout

An audit of `CheckoutSessionService.ts` (`packages/CoreEntitiesServer/src/services/CheckoutSessionService.ts`) and `CheckoutWidgetComponent` (`packages/Angular/src/lib/checkout-widget/`) shows that `bizapps-orders` currently has **three completely separate mechanisms** inside checkout, each storing data in a different place:

| # | Current Mechanism in `bizapps-orders` | Where Defined | Where Stored | Scope | Disposition in This Plan |
|---|---|---|---|---|---|
| **1** | **`extensionFields` (`ExtensionFieldDef`)** | Auto-introspected in `CheckoutSessionService.ts` (lines 977–1058) from `ProductType.OrderLineExtensionEntity` MJ metadata | Hydrated directly onto the IsA child row (e.g., `MJ_BizApps_Orders: Event Order Lines` columns: `DietaryPreference`, `AccessibilityNeeds`, `TrackPreference`, `SpecialAccommodations`, plus attendee `Person` resolution in lines 2657–2682) | **Per-Unit** (`perUnit`, 1 row per attendee/unit) or **Per-Line** | **Replace UI with `<mjf-form-embed>` + materialize onto `EventOrderLine` via `FormEntityBinding` (Two-Tier Model below)** |
| **2** | **`CheckoutWidgetConfiguration.questions` (`CheckoutQuestion`)** | Hand-authored JSON in `CheckoutWidget.Configuration` (`packages/Entities/src/checkout-questions.ts`); supports only `'text'` and `'select'` (with `otherOptionKey`) | Stored as flat key-value rows in `MJ_BizApps_Orders: Order Checkout Answers` (`OrderCheckoutAnswer`: `OrderHeaderID`, `QuestionKey`, `QuestionLabel`, `AnswerValue`, `OtherText`) in `CheckoutSessionService.ts` (lines 2686–2692) | **Order-level only** (`OrderHeaderID` — cannot even attach to a specific `OrderLine` or attendee unit) | **100% Replaced by `bizapps-forms` (`FormResponse` + `FormResponseAnswer`)** |
| **3** | **`CheckoutWidgetConfiguration.choiceGroups` (`CheckoutChoiceGroup`)** | `packages/Entities/src/checkout-choices.ts` (*"Choose N of M options"*) | Stored as JSON in `OrderLine.Choices` (`OrderLineChoice` in `CheckoutSessionService.ts`, lines 2694–2708) | **Per-Line** (`OrderLine.Choices`) | **Keep in `bizapps-orders`** — `ProductEntitlement.ChoiceGroupKey` / `ChoiceOptionValue` reads `OrderLine.Choices` to grant conditional entitlements (e.g., picking 2 of 5 publications) and subscription renewals copy `OrderLine.Choices` forward |

### 1.2 Two-Tier Architecture: Unified Form UX + Organic Row Materialization (`FormEntityBinding`)

A key architectural insight from this audit is that checkout intake is **two-tier**:
- When an organization configures an Event Registration or Product intake form, they want **one unified form surface** in the UX that collects **both**:
  1. **Structured columns that belong on the organic entity row** (e.g., `DietaryPreference`, `SpecialAccommodations`, `TrackPreference` on `EventOrderLine`, and `FirstName`, `LastName`, `Email`, `Title` on `Person`), **AND**
  2. **Ad-hoc / event-specific questions that are NOT columns on `EventOrderLine`** (e.g., *"Which afternoon breakout room do you want?"*, *"Do you need a visa invitation letter?"*, *"Upload speaker bio/headshot"*, *"Sign liability waiver"*).

#### What `bizapps-forms` Already Has Built Today (`FormEntityBinding`)
`bizapps-forms` **already implements Two-Tier Storage + Entity Materialization** via `MJ_BizApps_Forms: Form Entity Bindings` (`FormEntityBinding`) and `MJ_BizApps_Forms: Form Entity Binding Records` (`FormEntityBindingRecord`):
- **Contracts (`packages/Entities/src/contracts/entity-binding.ts`):**
  - `FieldMappings` (`version: 1`): Maps `{ kind: 'question', questionId }` or `{ kind: 'static', value }` to `targetField` on a target MJ entity (`TargetEntityID`).
  - `IdentityRule`: Supports `'AlwaysCreate' | 'MatchThenCreate' | 'MatchOrSkip'` with match normalization (`LowerCaseTrim | Trim | ExactMatch`) and scope filters.
  - `MergePolicy`: Supports field-level `'neverBlank' | 'latestWins' | 'writeOnce'` merge semantics.
- **Executor (`packages/CoreEntitiesServer/src/binding/binding-executor.ts` & `mj-binding-gateway.ts`):**
  - `executeBinding(...)` reads canonical answers from `FormResponseAnswer` (including temporal vs. string conversion via `readDateAnswersForTarget`), plans field merges (`planMerge`), writes to the target MJ entity via `MjBindingGateway`, and records an idempotent audit row in `FormEntityBindingRecord` (`Outcome: 'Created' | 'Merged' | 'Unchanged' | 'Skipped'`) keyed by `(BindingID, FormResponseID)`.

#### How the Two-Tier Flow Works in Checkout
```
┌────────────────────────────────────────────────────────────────────────────┐
│  TIER 1: Unified Form UX (<mjf-form-embed>) & Canonical Form Storage       │
│  • Buyer sees ONE seamless form per unit/order (all 25 question types,     │
│    branching, file uploads, validation).                                   │
│  • On CompleteCheckout (after payment settles), ALL answers—both extension │
│    fields and extra custom questions—are saved canonically in              │
│    MJ_BizApps_Forms: Form Responses + Form Response Answers.               │
└───────────────────────────────────────┬────────────────────────────────────┘
                                        │
                                        ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  TIER 2: Organic Entity Materialization via FormEntityBinding              │
│  • Questions mapped in FormEntityBinding materialize directly onto the     │
│    organic target row(s):                                                  │
│      1. Person (via UpsertRespondentPerson / MatchThenCreate on Email)     │
│      2. EventOrderLine (or any OrderLineExtensionEntity) columns           │
│  • Unmapped ad-hoc questions remain queryable/exportable in FormResponse   │
│    (and optional FormGroup SQL views) without polluting EventOrderLine DDL │
│    or needing OrderCheckoutAnswer.                                         │
└────────────────────────────────────────────────────────────────────────────┘
```

#### The Small Gap to Close in `FormEntityBinding` for Host-Created Records
Today, `executeBinding` in `binding-executor.ts` either matches an existing record by `IdentityRule.match` (`MatchThenCreate` / `MatchOrSkip`) or creates a brand-new standalone record (`AlwaysCreate` calling `gateway.writeRecord(entityName, null, plan)`).
However, during `CheckoutSessionService.CompleteCheckout`, `bizapps-orders` constructs the `OrderLine` / `EventOrderLine` (IsA child) inside its own order-confirmation flow (`order.AddLine(...)` → `order.Confirm()`).
To support `Orders` cleanly:
1. **`FormEmbeddedHostService` / `binding-executor.ts` adds Target-Record Hydration & Binding:**
   - Provide `ExtractBoundFieldValues(params)` so `Orders` can extract the mapped `{ [targetField: string]: CanonicalAnswerValue }` dictionary for `MJ_BizApps_Orders: Event Order Lines` (and attendee `Person` fields) directly from the validated answers when constructing the `EventOrderLine` in `CompleteCheckout`.
   - Allow `RecordEmbeddedFormSubmission` to accept an optional `preboundRecords?: ReadonlyArray<{ targetEntityName: string; targetRecordId: string }>` (or `TargetRecord` binding mode) so when `Orders` creates the `EventOrderLine` with those materialized fields, `Forms` either updates the target `targetRecordId` or logs the `FormEntityBindingRecord` linking `(BindingID, FormResponseID) -> EventOrderLine.ID` without creating a duplicate row.
2. **Allowlist Extension (`mj-binding-gateway.ts`):**
   - Allow `MJ_BizApps_Orders: Event Order Lines` (or host-registered target entities) alongside `FORMS_BINDING_ALLOWED_ENTITIES`.

### 1.3 Architectural Direction Summary
```
bizapps-common ──► bizapps-tasks ──► bizapps-forms ──► bizapps-orders
```

- **`bizapps-forms` stays 100% consumer-blind:** It has zero imports or schema references to `bizapps-orders`. Instead, it exposes a **chromeless, inline-placeable Angular component (`<mjf-form-embed>`)** and a **server-side embedded projection, submission, and entity-binding seam** (`FormEmbeddedHostService`) that any host app (`Orders`, `Caliber`, `Credentialing`, `Awards`, `Abstracts`) can mount inside its own wizard or checkout container.
- **`bizapps-orders` owns the checkout shell, `choiceGroups`, and the payment gate:** `Orders` loads the published form definition during `/checkout/initialize`, mounts `<mjf-form-embed>` inline inside `<mj-checkout-widget>`, validates the form(s) before opening/confirming the payment intent, and persists the `FormResponse` row(s) + materializes mapped `EventOrderLine` fields server-side inside `CompleteCheckout` **only after payment settlement succeeds** (preventing abandoned carts from creating junk `FormResponse` rows or firing premature on-submit automations).

---

## 2. Why `<mj-form>` Cannot Be Dropped Inside Checkout As-Is Today

`FormRuntime` (`packages/Angular/src/lib/widget/core/form-runtime.ts`) is already headless (it owns no DOM and no transport), and `@mj-biz-apps/forms-ng` already exports `FormScrollComponent` and `FormQuestionComponent`. However, five things in the current widget layer block clean inline placement inside `<mj-checkout-widget>`:

1. **Page-Owning Chrome in `MjFormComponent` & `FormScrollComponent`:**
   - `MjFormComponent` (`mj-form.component.ts`) assumes it owns the entire viewport: it renders welcome screens, ending screens, its own Cloudflare Turnstile gate, and drives its own `IFormsApiService` GraphQL load/autosave/submit lifecycle.
   - `FormScrollComponent` (`form-scroll.component.html`) wraps questions in a native `<form (submit)="onSubmit($event)">` element and always renders its own `mjf-scroll__progress` bar and `mjf-scroll__actions` (`Back` / `Next` / `Submit` buttons). Inside `<mj-checkout-widget>`, **Orders owns the outer form container, the Turnstile gate, and the final "Pay / Complete Order" button.**
2. **Parent-Driven Validation, DOM Sync, and Error Focus:**
   - `FormScrollComponent.commitVisibleValues()` (which calls `view.syncFromDom()` on each `FormQuestionComponent` to capture browser autofill values before judging, #268) and `StepJudge` (which waits for in-flight uploads, marks questions touched, and focuses the first invalid control, #248) are `private` inside `FormScrollComponent` and only trigger when the user clicks Forms' internal `Next`/`Submit` button.
   - When embedded in checkout, the parent component (`CheckoutWidgetComponent`) needs an imperative handle (`validateAndFocus()`) to trigger DOM sync, upload settlement, touched marking, and invalid-field focus when the buyer clicks Orders' **"Pay"** button.
3. **Multi-Unit (`perUnit`) Repeater Support:**
   - In `bizapps-orders`, when `unitMode === 'perUnit'` and `quantity > 1` (e.g., buying 3 conference registrations on one order line), checkout renders a repeating card per unit plus a **"Copy Primary Info to All"** action.
   - The embedded form component must accept an externally constructed `FormRuntime` instance (`[runtime]="unitRuntime"`) so the host can hold an array of `FormRuntime` instances (one per unit) and clone answers from unit `0` to units `1..N-1`.
4. **Host CSS Token Mapping & Layout Containment:**
   - `<mj-form>` applies `--mjf-*` tokens assuming a full-page card/stage (`min-height`, outer padding, card shadows). An embedded surface needs a compact, container-transparent layout profile and a clean bridge mapping host theme tokens (`--mj-primary-color`, `--mj-border-radius`, `--mj-font-family`, `--mj-text-color`) onto `--mjf-*` variables when the host overrides them.
5. **Server-Side Deferred Submission Seam:**
   - Public form submissions currently go through `FormSubmissionEngine` from `/f/<slug>` using a `Form Respondent` anonymous magic-link JWT.
   - When embedded inside `OrdersCheckoutEdge` (`/checkout`), the buyer is authenticated by the checkout session (`sessionId + clientSessionKey`). `Orders` needs a clean server-side API in `@mj-biz-apps/forms-core-entities-server` to:
     1. Load the `PublishedFormRenderDefinition` for a configured `FormID` / `FormDistribution` during `POST /checkout/initialize`.
     2. Validate and persist the completed `FormResponse` + `FormResponseAnswer` rows (and enqueue the `FormAutomationEvent` outbox drain) from `CheckoutSessionService.CompleteCheckout` once payment has settled.

---

## 3. Workstream A — Forms Side (`bizapps-forms`)
**Assignee:** Soham (`@SDesai-BC`)

### A1. Chromeless Embedded Component: `FormEmbedComponent` (`<mjf-form-embed>`)
**Files:**
- Create: `packages/Angular/src/lib/widget/components/form-embed.component.ts`
- Create: `packages/Angular/src/lib/widget/components/form-embed.component.html`
- Create: `packages/Angular/src/lib/widget/components/form-embed.component.css`
- Create: `packages/Angular/src/lib/widget/components/form-embed.spec.ts`
- Modify: `packages/Angular/src/lib/widget/index.ts` & `packages/Angular/src/public-api.ts` (export `FormEmbedComponent`, `FormEmbedLayoutOptions`, `cloneRuntimeAnswers`)

**Design & Contract:**
- Selector: `mjf-form-embed` (`standalone: true`, `ChangeDetectionStrategy.OnPush`).
- **Inputs:**
  - `runtime = input.required<FormRuntime>()` — caller-owned `FormRuntime` built from `projectionForm(renderDefinition)`.
  - `distributionSlug = input<string>('')` — forwarded to `FormQuestionComponent` for scoped file uploads.
  - `responseId = input<string>('')` — forwarded to file upload questions.
  - `disabled = input<boolean>(false)` — disables all question controls while the parent host is processing payment/submission.
  - `showSectionTitles = input<boolean>(true)` — whether to render page/section headings and descriptions.
  - `showProgress = input<boolean>(false)` — defaults to `false` for inline embedding.
  - `navigationMode = input<'inline-all-sections' | 'stepped-sections'>('inline-all-sections')`:
    - `'inline-all-sections'` (default for checkout): renders all currently visible sections (`steppableSections(...)`) vertically in a single flow with **no** `<form>` wrapper and **no** `Submit` button, evaluating conditional visibility and skipped-question notices (`sectionEntries`) live as the buyer types.
    - `'stepped-sections'`: renders one section at a time with `Back` / `Next` buttons for multi-section forms, but omits the final `Submit` button on the last section so the host's primary CTA owns final submission.
  - `themeOverrides = input<Partial<FormStyleTokens> | null>(null)` — optional token map applied to the host element via `applyStyleTokens`.
- **Outputs:**
  - `valueChange = output<ReadonlyMap<string, AnswerValue>>()` — emits whenever an answer changes.
  - `commitChange = output<FormAnswerInput[]>()` — emits settled `FormAnswerInput[]` when focus leaves a question (`onBlur`), allowing the host to sync draft answers if desired.
- **Public Imperative API (called by host via `viewChild` / `viewChildren`):**
  - `syncFromDom(): void` — iterates rendered `FormQuestionComponent` children and calls `view.syncFromDom()` (#268 autofill capture).
  - `validateAndFocus(): Promise<'valid' | 'invalid' | 'stale'>` — calls `syncFromDom()`, awaits in-flight uploads via `StepJudge.judge(this.runtime(), this.runtime().visibleAnswerableQuestions())`, marks all visible questions touched on failure, scrolls/focuses the first invalid question (`#mjf-q-${first.id}`), and returns the verdict.
  - `settledAnswerInputs(): FormAnswerInput[]` — calls `syncFromDom()` and returns `toAnswerInputs(this.runtime().settledAnswers())` ready for wire transmission.

### A2. Runtime Helper for Multi-Unit Cloning (`cloneRuntimeAnswers`)
**Files:**
- Modify: `packages/Angular/src/lib/widget/core/form-runtime.ts` (or create `core/runtime-clone.ts` + spec)

**Design:**
- Add `copyAnswersFrom(source: FormRuntime, options?: { excludeQuestionIds?: ReadonlySet<string> }): void` on `FormRuntime` (or a pure helper) so hosts like `<mj-checkout-widget>` implementing *"Copy Primary Info to All"* in `perUnit` mode can copy shared answers (e.g., Company, Dietary Preferences) from Unit 0's `FormRuntime` to Units `1..N-1` while excluding unique-per-person fields if configured.

### A3. Server-Side Embedded Projection, Submission & Entity-Binding Service
**Files:**
- Create: `packages/CoreEntitiesServer/src/embedded/FormEmbeddedHostService.ts`
- Create: `packages/CoreEntitiesServer/src/embedded/__tests__/FormEmbeddedHostService.spec.ts`
- Modify: `packages/CoreEntitiesServer/src/binding/binding-executor.ts` & `packages/CoreEntitiesServer/src/binding/mj-binding-gateway.ts` (support host-supplied target records / allowlist registration)
- Modify: `packages/CoreEntitiesServer/src/index.ts`

**Design:**
Provide a clean, strongly-typed server service in `@mj-biz-apps/forms-core-entities-server` for trusted server-side hosts (`bizapps-orders` `CheckoutSessionService`):
1. `LoadEmbeddedFormDefinition(params: { formId?: string; distributionSlug?: string; contextUser: UserInfo }): Promise<PublishedFormRenderDefinition>`
   - Loads the active published `FormVersion` snapshot (and verifies distribution window/status if `distributionSlug` is supplied) and returns the stripped respondent `PublishedFormRenderDefinition` (never leaking hidden automation or LLM judge prompts to the browser).
2. `ValidateEmbeddedFormAnswers(params: { formId?: string; distributionSlug?: string; answers: readonly FormAnswerInput[]; contextUser: UserInfo }): Promise<{ valid: boolean; errors: Record<string, string> }>`
   - Runs server-side `settleVisibility` + `validateAnswers` against the published snapshot so `Orders` can pre-validate answers during `/checkout/draft` or `/checkout/payment-intent` before charging a card.
3. `ExtractBoundFieldValues(params: { formId?: string; distributionSlug?: string; targetEntityName: string; answers: readonly FormAnswerInput[]; contextUser: UserInfo }): Promise<{ bindingId: string | null; fields: ReadonlyMap<string, CanonicalAnswerValue> }>`
   - Uses the form's active `FormEntityBinding` (`FieldMappings` + temporal/date normalization from `binding-executor.ts`) for `targetEntityName` (e.g., `'MJ_BizApps_Orders: Event Order Lines'` or `'MJ_BizApps_Common: People'`) to return the mapped field dictionary so the host (`CheckoutSessionService`) can hydrate its in-flight extension entity (`EventOrderLine`) during `CompleteCheckout`.
4. `RecordEmbeddedFormSubmission(params: { formId?: string; distributionSlug?: string; answers: readonly FormAnswerInput[]; respondentPersonId?: string | null; preboundRecords?: ReadonlyArray<{ targetEntityName: string; targetRecordId: string }>; metadata?: { ipHash?: string; userAgent?: string }; contextUser: UserInfo }): Promise<{ formResponseId: string; respondentPersonId: string | null }>`
   - Runs `FormSubmissionEngine` to persist the completed `FormResponse` and `FormResponseAnswer` rows (storing **all** questions canonically, both bound and unbound), pre-stamping `RespondentPersonID` if `Orders` has already resolved/created the buyer or attendee `Person` (so `Forms: Upsert Respondent Person` reuses that exact `PersonID` per `docs/on-submit-automations.md`), records `FormEntityBindingRecord` ledger entries for any `preboundRecords` already materialized by the host (or updates the target record via `executeBinding`), and enqueues the `FormAutomationEvent` outbox drain.

### A4. MJ-Idiomatic Extensibility: `FormType`, `FormCategory` Integration, & Metadata-Driven `FormQuestionType` with `@RegisterClass` Drivers
Make `bizapps-forms` 100% extensible the MemberJunction way—via metadata tables paired with `DriverClass` and `@RegisterClass` / `MJGlobal.Instance.ClassFactory`—while keeping all schema changes strictly additive per the Publish-Then-No-Breaking-Changes Policy:

1. **`FormCategory` (`ParentID` Tree) + `FormType` (`DriverClass`) Separation:**
   - `MJ_BizApps_Forms: Form Categories` (`__mj_BizAppsForms.FormCategory`) already exists with `ID`, `Name`, `Description`, `ParentID` (self-FK), and `IconClass` for hierarchical folder organization.
   - Add **`MJ_BizApps_Forms: Form Types` (`__mj_BizAppsForms.FormType`)** to drive behavioral archetypes (`General`, `CheckoutIntake`, `EventRegistration`, `ScoredAssessment`, `CredentialApplication`):
     - Columns: `ID`, `Name`, `Code`, `Description`, `IconClass`, `DriverClass` (`nvarchar(255) NULL`), `DefaultCategoryID` (FK to `FormCategory.ID`), `DefaultRenderMode` (`'Scroll' | 'OneQuestion'`), `SupportsScoring` (`bit`), `SupportsEntityBinding` (`bit`), `SupportsStandaloneDistribution` (`bit`), `RequiredTargetEntities` (`nvarchar(max) NULL` JSON), `DefaultSettings` (`nvarchar(max) NULL` JSON), `IsActive`, `DisplayOrder`.
     - Add `FormTypeID uniqueidentifier NULL REFERENCES __mj_BizAppsForms.FormType(ID)` to `__mj_BizAppsForms.Form` (backfilled to the seeded `'General'` `FormType`).
   - Create **`BaseFormTypeDriver`** (resolved via `MJGlobal.Instance.ClassFactory.CreateInstance(BaseFormTypeDriver, formType.DriverClass)`):
     - Hooks: `ValidateForPublish(ctx)`, `ResolvePrefillAnswers(ctx)`, `ValidateSubmission(ctx)`, and `OnAfterSubmit(ctx)`.
     - Built-in drivers: `StandardFormTypeDriver`, `ScoredAssessmentFormTypeDriver`, plus downstream drivers like `OrdersCheckoutFormTypeDriver` in `bizapps-orders`.

2. **Extensible `FormQuestionType` Metadata Entity + Pluggable Question Drivers (`@RegisterClass`):**
   - Refactor the hardcoded 25-entry `QUESTION_TYPE_BEHAVIOR` table in `packages/Entities/src/contracts/question-types.ts` and the 25-case `@switch` in `FormQuestionComponent` into metadata + `ClassFactory` drivers:
   - Add **`MJ_BizApps_Forms: Form Question Types` (`__mj_BizAppsForms.FormQuestionType`)**:
     - Columns: `ID`, `Code`, `Name`, `Description`, `PaletteGroup`, `IconClass`, `IsAnswerable`, `OptionMode` (`'none' | 'values' | 'images' | 'matrix'`), `AnswerColumn` (`'text' | 'numeric' | 'boolean' | 'date' | 'json' | 'file'`), `AnalysisKind` (`'choice' | 'numeric' | 'boolean' | 'text' | 'composite' | 'none'`), `InsightRole`, `IsMultiValued`, `IsOrdered`, `DriverClass` (`BaseFormQuestionTypeDriver`), `ControlDriverClass` (`BaseFormQuestionControl`), `BuilderEditorDriverClass` (`BaseFormQuestionSettingsEditor`), `CompositeFields` (`nvarchar(max) NULL` JSON), `DefaultSettings`, `SettingsSchema`, `IsSystem`, `IsActive`, `Sequence`.
     - Seed all 25 built-in question types with deterministic UUIDs.
     - Add `QuestionTypeID uniqueidentifier NULL REFERENCES __mj_BizAppsForms.FormQuestionType(ID)` to `__mj_BizAppsForms.FormQuestion` (backfilled from `QuestionType`), relax the closed `CK_FormQuestion_QuestionType` CHECK constraint so downstream apps can register new question types, and keep `FormQuestion.QuestionType` synced with `FormQuestionType.Code` in `FormQuestionEntityServer`.
     - Freeze resolved `QuestionTypeBehavior` into published `FormVersion` snapshots so historical versions remain self-describing.
   - Create **`FormQuestionTypeEngine extends BaseSingleton<FormQuestionTypeEngine>`** to cache `FormQuestionType` metadata.
   - Create **`BaseFormQuestionTypeDriver`** (`@RegisterClass(BaseFormQuestionTypeDriver, '<Code>')`) for server/shared validation (`ValidateAnswer`), normalization (`NormalizeForStorage`), composite sub-field extraction (`ExtractSubField`), and export formatting (`FormatForExport`).
   - Create **`BaseFormQuestionControl`** (`@RegisterClass(BaseFormQuestionControl, '<ControlDriverClass>')`) in `@mj-biz-apps/forms-ng` so `<mjf-form-question>` resolves and mounts question controls via `MJGlobal.Instance.ClassFactory` (refactoring the built-in 25 controls into registered classes and allowing any BizApp to plug in custom question controls).

3. **`BaseFormDistributionClaimProvider` via `@RegisterClass`:**
   - Add `BaseFormDistributionClaimProvider` in `@mj-biz-apps/forms-core-entities-server` discovered via `MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseFormDistributionClaimProvider)` (retaining a fallback read of `__mjBizAppsForms.distributionClaimProviders.v1` for backward compatibility).

---

## 4. Workstream B — Orders Consumption Side (`bizapps-orders`)
**Assignee:** Boston (`@bg-BC`)

### B1. Package, App Dependency & ClassFactory Plugin Wiring
- Add `mj-bizapps-forms` to `bizapps-orders/mj-app.json` dependencies.
- Add `@mj-biz-apps/forms-entities`, `@mj-biz-apps/forms-core-entities-server`, and `@mj-biz-apps/forms-ng` to the corresponding `bizapps-orders` packages (`orders-entities`, `orders-core-entities-server`, `orders-server`, `orders-ng`).
- Register `OrdersDistributionClaimProvider` (`@RegisterClass(BaseFormDistributionClaimProvider, 'Orders')`) and `OrdersCheckoutFormTypeDriver` (`@RegisterClass(BaseFormTypeDriver, 'OrdersCheckoutFormTypeDriver')`) so `Orders` plugs into `Forms` via MJ's `ClassFactory`.

### B2. Schema, Configuration & Two-Tier Materialization Linkage
- **Checkout Widget Configuration (`CheckoutWidgetConfiguration`):**
  - Add optional `intakeFormSlug?: string` / `intakeFormId?: string` and `intakeScope?: 'perOrder' | 'perUnit'`.
- **Response Linkage:**
  - Link `FormResponseID` (nullable FK to `__mj_BizAppsForms.FormResponse`) on `OrderHeader` (for `perOrder` intake) and `OrderLine` (for `perUnit` intake).
- **Two-Tier Storage + Materialization (`FormEntityBinding` → `EventOrderLine`):**
  - A single embedded Form acts as the unified UX surface for **both** organic `EventOrderLine` / `Person` fields **and** additional custom event questions.
  - All form answers are always persisted canonically in `FormResponse` + `FormResponseAnswer` (replacing `OrderCheckoutAnswer`).
  - Questions mapped via `FormEntityBinding` to `MJ_BizApps_Orders: Event Order Lines` (e.g., `DietaryPreference`, `AccessibilityNeeds`, `TrackPreference`, `SpecialAccommodations`) and `MJ_BizApps_Common: People` are materialized directly onto the `EventOrderLine` IsA row and attendee `Person` during `CompleteCheckout` (replacing the auto-introspected `extensionFields` UI loop).
- **Keep `choiceGroups` (`OrderLineChoice`) in `bizapps-orders`:**
  - Do **not** migrate `CheckoutWidgetConfiguration.choiceGroups` (`OrderLine.Choices`) into Forms — `ProductEntitlement.ChoiceGroupKey` / `ChoiceOptionValue` and subscription renewal cloning depend directly on `OrderLine.Choices`.

### B3. Checkout Edge & `CheckoutSessionService` Integration
- **`POST /checkout/initialize`:**
  - When the widget configuration specifies `intakeFormSlug` / `intakeFormId`, call `FormEmbeddedHostService.LoadEmbeddedFormDefinition(...)` and return `intakeForm: PublishedFormRenderDefinition` in the initialized session configuration payload.
- **`POST /checkout/payment-intent` & `POST /checkout/complete`:**
  - Accept `formAnswers?: FormAnswerInput[]` (for `perOrder`) and `unitFormAnswers?: FormAnswerInput[][]` (for `perUnit`).
  - Pre-validate via `FormEmbeddedHostService.ValidateEmbeddedFormAnswers(...)` before opening a payment intent or completing the order (refusing with field-level validation errors if invalid).
  - Inside `CompleteCheckout`, **after** `PaymentIntent.Status === 'Succeeded'` (or on the free path):
    1. Call `FormEmbeddedHostService.ExtractBoundFieldValues(...)` for the line's `OrderLineExtensionEntity` (e.g., `MJ_BizApps_Orders: Event Order Lines`) and attendee `Person` so `EventOrderLine` columns are hydrated before `order.Confirm()`.
    2. Call `FormEmbeddedHostService.RecordEmbeddedFormSubmission(...)` for the order / each unit, passing the resolved `BillToPersonID` / attendee `PersonID` and `preboundRecords: [{ targetEntityName: 'MJ_BizApps_Orders: Event Order Lines', targetRecordId: orderLine.ID }]`, and stamp the resulting `FormResponseID` onto `OrderHeader` / `OrderLine`.

### B4. `<mj-checkout-widget>` UI Integration & Cleanup
- In `CheckoutWidgetComponent` (`packages/Angular/src/lib/checkout-widget/checkout-widget.component.ts` & `.html`):
  - When `config.intakeForm` is present, instantiate `FormRuntime(projectionForm(config.intakeForm))` (one instance for `perOrder`, or one instance per unit in `perUnit` mode).
  - Render `<mjf-form-embed [runtime]="..." [themeOverrides]="..." />` inside the Details section of `checkout-widget.component.html`.
  - Wire *"Copy Primary Info to All"* in `perUnit` mode to `unitRuntime.copyAnswersFrom(primaryRuntime)`.
  - In `onSubmit()`, await `embed.validateAndFocus()` across all active `<mjf-form-embed>` instances before proceeding to payment/completion.
- **Deprecation / Retirement:**
  - Retire `OrderCheckoutAnswer` / `checkout-questions.ts` and the bespoke `extensionFields` template switch in `checkout-widget.component.html` once existing seed/world fixtures are migrated to `intakeFormSlug` (while preserving `choiceGroups`).

---

## 5. Verification & Acceptance Criteria

- [ ] **Forms Unit & Wiring Specs (`@SDesai-BC`):**
  - `FormEmbedComponent` renders single-section and multi-section forms without `<form>` tags or competing `Submit` buttons.
  - `validateAndFocus()` syncs DOM autofill values, awaits pending uploads, marks fields touched, and focuses the first invalid control.
  - `copyAnswersFrom()` copies answers cleanly across `FormRuntime` instances and triggers conditional visibility recalculation on the target runtime.
  - `FormEmbeddedHostService` validates answers against published snapshots, extracts mapped `FormEntityBinding` field values for target entities, and records submissions with pre-resolved `RespondentPersonID` + `FormEntityBindingRecord` ledger entries + outbox drain.
  - `FormType` (`BaseFormTypeDriver`), `FormQuestionType` (`BaseFormQuestionTypeDriver` & `BaseFormQuestionControl`), and `BaseFormDistributionClaimProvider` resolve via `MJGlobal.Instance.ClassFactory` (`@RegisterClass`), with all 25 built-in question types seeded in metadata and refactored into registered drivers.
- [ ] **Orders Checkout Integration Specs (`@bg-BC`):**
  - `POST /checkout/initialize` returns the published `intakeForm` render definition.
  - `<mj-checkout-widget>` renders `<mjf-form-embed>` in both single-unit and multi-unit (`perUnit`) modes, blocks checkout submission when form answers are invalid, and submits settled `FormAnswerInput[]`.
  - `POST /checkout/complete` refuses invalid form answers, persists canonical `FormResponse` + `FormResponseAnswer` rows for **all** questions (both bound and unbound) only after payment settlement, materializes bound fields onto `EventOrderLine` + `Person`, and stamps `FormResponseID` on the resulting order/lines.
  - `choiceGroups` (`OrderLine.Choices`) continue to function unchanged for conditional `ProductEntitlement` grants.
  - Abandoned checkouts create **zero** `FormResponse` rows and fire **zero** `FormAutomation` events.
