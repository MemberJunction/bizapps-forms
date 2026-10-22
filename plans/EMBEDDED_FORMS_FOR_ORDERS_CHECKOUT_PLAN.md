# Embedded Forms Surface & Orders Checkout Consumption Plan

> **Timing:** Post-AIDP Go-Live (do not start before AIDP go-live is complete).  
> **Owners:**
> - **Forms side (`bizapps-forms`):** Soham (`@SDesai-BC`) — embeddable chromeless widget surface (`<mjf-form-embed>`), parent-driven validation/focus controller, theme bridge, and server-side embedded projection/submission API.
> - **Orders consumption side (`bizapps-orders`):** Boston (`@bg-BC`) — ingesting `Forms` inside `<mj-checkout-widget>` and `CheckoutSessionService`, supporting `perLine` and `perUnit` (`FormRuntime` per attendee/unit), registering `Orders` as a Forms distribution claim provider, and retiring bespoke checkout question renderers.
> - **Reviewer / Architecture Sign-Off:** Robert (`@rkihm-BC`)

---

## 1. Context & Problem Statement

Today, `bizapps-orders` maintains three separate, hand-rolled mini-form mechanisms inside its checkout widget (`packages/Angular/src/lib/checkout-widget/checkout-widget.component.ts` & `.html`):
1. `extensionFields` (`ExtensionFieldDef` — a 6-type loop for `text | textarea | number | date | boolean | select` used for per-unit attendee fields).
2. `checkout-questions.ts` (`CheckoutQuestion` + `OrderCheckoutAnswer` table — a 2-type loop supporting only `text` and `select`).
3. `checkout-choices.ts` (`CheckoutChoiceGroup` + `OrderLineChoice`).

Meanwhile, `bizapps-forms` already provides **25 question types**, conditional branching/visibility (`settleVisibility`), rich field validation (`validateAnswers`), file uploads (`FormUploadStore`), and post-submit automations (`UpsertRespondentPerson`, `BindResponseToEntity`, `AnalyzeWrittenResponses`, `CreateFollowupTask`) backed by a headless, signal-driven `FormRuntime` (`packages/Angular/src/lib/widget/core/form-runtime.ts`).

### Architectural Direction
Rather than maintaining a second form engine inside `bizapps-orders` or adding order/payment awareness into `bizapps-forms`, **`bizapps-orders` will become a consumer of `bizapps-forms`**:

```
bizapps-common ──► bizapps-tasks ──► bizapps-forms ──► bizapps-orders
```

- **`bizapps-forms` stays 100% consumer-blind:** It has zero imports or schema references to `bizapps-orders`. Instead, it exposes a **chromeless, inline-placeable Angular component (`<mjf-form-embed>`)** and a **server-side embedded projection & submission seam** that any host app (`Orders`, `Caliber`, `Credentialing`, `Awards`, `Abstracts`) can mount inside its own wizard or checkout container.
- **`bizapps-orders` owns the checkout shell and payment gate:** `Orders` loads the published form definition during `/checkout/initialize`, mounts `<mjf-form-embed>` inline inside `<mj-checkout-widget>`, validates the form(s) before opening/confirming the payment intent, and persists the `FormResponse` row(s) server-side inside `CompleteCheckout` **only after payment settlement succeeds** (preventing abandoned carts from creating junk `FormResponse` rows or firing premature on-submit automations).

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

### A3. Server-Side Embedded Projection & Submission Service
**Files:**
- Create: `packages/CoreEntitiesServer/src/embedded/FormEmbeddedHostService.ts`
- Create: `packages/CoreEntitiesServer/src/embedded/__tests__/FormEmbeddedHostService.spec.ts`
- Modify: `packages/CoreEntitiesServer/src/index.ts`

**Design:**
Provide a clean, strongly-typed server service in `@mj-biz-apps/forms-core-entities-server` for trusted server-side hosts (`bizapps-orders` `CheckoutSessionService`):
1. `LoadEmbeddedFormDefinition(params: { formId?: string; distributionSlug?: string; contextUser: UserInfo }): Promise<PublishedFormRenderDefinition>`
   - Loads the active published `FormVersion` snapshot (and verifies distribution window/status if `distributionSlug` is supplied) and returns the stripped respondent `PublishedFormRenderDefinition` (never leaking hidden automation or LLM judge prompts to the browser).
2. `ValidateEmbeddedFormAnswers(params: { formId?: string; distributionSlug?: string; answers: readonly FormAnswerInput[]; contextUser: UserInfo }): Promise<{ valid: boolean; errors: Record<string, string> }>`
   - Runs server-side `settleVisibility` + `validateAnswers` against the published snapshot so `Orders` can pre-validate answers during `/checkout/draft` or `/checkout/payment-intent` before charging a card.
3. `RecordEmbeddedFormSubmission(params: { formId?: string; distributionSlug?: string; answers: readonly FormAnswerInput[]; respondentPersonId?: string | null; metadata?: { ipHash?: string; userAgent?: string }; contextUser: UserInfo }): Promise<{ formResponseId: string; respondentPersonId: string | null }>`
   - Runs `FormSubmissionEngine` to persist the completed `FormResponse` and `FormResponseAnswer` rows, pre-stamping `RespondentPersonID` if `Orders` has already resolved/created the buyer or attendee `Person` (so `Forms: Upsert Respondent Person` reuses that exact `PersonID` per `docs/on-submit-automations.md`), and enqueues the `FormAutomationEvent` outbox drain.

---

## 4. Workstream B — Orders Consumption Side (`bizapps-orders`)
**Assignee:** Boston (`@bg-BC`)

### B1. Package & App Dependency Wiring
- Add `mj-bizapps-forms` to `bizapps-orders/mj-app.json` dependencies.
- Add `@mj-biz-apps/forms-entities`, `@mj-biz-apps/forms-core-entities-server`, and `@mj-biz-apps/forms-ng` to the corresponding `bizapps-orders` packages (`orders-entities`, `orders-core-entities-server`, `orders-server`, `orders-ng`).
- Register `Orders` as a claim provider in `__mjBizAppsForms.distributionClaimProviders.v1` at server startup (`packages/Server/src/`) so any `FormDistribution` attached to a `CheckoutWidget` displays `"used by Orders"` in the Forms Builder's Distribute tab (`docs/distribution-claims.md`).

### B2. Schema & Configuration Linkage
- **Checkout Widget Configuration (`CheckoutWidgetConfiguration`):**
  - Add optional `intakeFormSlug?: string` / `intakeFormId?: string` and `intakeScope?: 'perOrder' | 'perUnit'`.
- **Response Linkage:**
  - Link `FormResponseID` (nullable FK to `__mj_BizAppsForms.FormResponse`) on `OrderHeader` (for `perOrder` intake) and `OrderLine` (for `perUnit` intake).
- **Entity Binding for `EventOrderLine`:**
  - Where a product uses `EventOrderLine` (or another `OrderLine` IsA extension), use `Forms`' native `FormEntityBinding` (or map from the validated `FormResponse`) instead of maintaining manual `extensionFields` JSON schemas.

### B3. Checkout Edge & `CheckoutSessionService` Integration
- **`POST /checkout/initialize`:**
  - When the widget configuration specifies `intakeFormSlug` / `intakeFormId`, call `FormEmbeddedHostService.LoadEmbeddedFormDefinition(...)` and return `intakeForm: PublishedFormRenderDefinition` in the initialized session configuration payload.
- **`POST /checkout/payment-intent` & `POST /checkout/complete`:**
  - Accept `formAnswers?: FormAnswerInput[]` (for `perOrder`) and `unitFormAnswers?: FormAnswerInput[][]` (for `perUnit`).
  - Pre-validate via `FormEmbeddedHostService.ValidateEmbeddedFormAnswers(...)` before opening a payment intent or completing the order (refusing with field-level validation errors if invalid).
  - Inside `CompleteCheckout`, **after** `PaymentIntent.Status === 'Succeeded'` (or on the free path), call `FormEmbeddedHostService.RecordEmbeddedFormSubmission(...)` for the order / each unit, passing the resolved `BillToPersonID` / attendee `PersonID`, and stamp the resulting `FormResponseID` onto `OrderHeader` / `OrderLine`.

### B4. `<mj-checkout-widget>` UI Integration & Cleanup
- In `CheckoutWidgetComponent` (`packages/Angular/src/lib/checkout-widget/checkout-widget.component.ts` & `.html`):
  - When `config.intakeForm` is present, instantiate `FormRuntime(projectionForm(config.intakeForm))` (one instance for `perOrder`, or one instance per unit in `perUnit` mode).
  - Render `<mjf-form-embed [runtime]="..." [themeOverrides]="..." />` inside the Details section of `checkout-widget.component.html`.
  - Wire *"Copy Primary Info to All"* in `perUnit` mode to `unitRuntime.copyAnswersFrom(primaryRuntime)`.
  - In `onSubmit()`, await `embed.validateAndFocus()` across all active `<mjf-form-embed>` instances before proceeding to payment/completion.
- **Deprecation / Retirement:**
  - Retire `OrderCheckoutAnswer` / `checkout-questions.ts` and the bespoke `extensionFields` template switch in `checkout-widget.component.html` once existing seed/world fixtures are migrated to `intakeFormSlug`.

---

## 5. Verification & Acceptance Criteria

- [ ] **Forms Unit & Wiring Specs (`@SDesai-BC`):**
  - `FormEmbedComponent` renders single-section and multi-section forms without `<form>` tags or competing `Submit` buttons.
  - `validateAndFocus()` syncs DOM autofill values, awaits pending uploads, marks fields touched, and focuses the first invalid control.
  - `copyAnswersFrom()` copies answers cleanly across `FormRuntime` instances and triggers conditional visibility recalculation on the target runtime.
  - `FormEmbeddedHostService` validates answers against published snapshots and records submissions with pre-resolved `RespondentPersonID` + outbox drain.
- [ ] **Orders Checkout Integration Specs (`@bg-BC`):**
  - `POST /checkout/initialize` returns the published `intakeForm` render definition.
  - `<mj-checkout-widget>` renders `<mjf-form-embed>` in both single-unit and multi-unit (`perUnit`) modes, blocks checkout submission when form answers are invalid, and submits settled `FormAnswerInput[]`.
  - `POST /checkout/complete` refuses invalid form answers, persists `FormResponse` rows only after payment settlement, and stamps `FormResponseID` on the resulting order/lines.
  - Abandoned checkouts create **zero** `FormResponse` rows and fire **zero** `FormAutomation` events.
