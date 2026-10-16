---
"@mj-biz-apps/forms-entities": minor
"@mj-biz-apps/forms-core-entities-server": minor
"@mj-biz-apps/forms-actions": minor
"@mj-biz-apps/forms-server": minor
"@mj-biz-apps/forms-ng": minor
---

Forms' domain logic moves out of the browser into server engines, exposed as 19 typed Remote
Operations (`Forms.*`), and on-submit automations run from a transactional outbox the save writes in
its own transaction (#303). Runs on the MJ 6.1 LTS line (6.1.5). Ships three migrations and new
metadata, so this is a `minor`. Closes #302, #75 and #103.

### What a host must do

- **MJ's scheduler on**, with a `systemUserEmail` that names an existing user (`scheduledJobs` in the
  host's `mj.config.cjs`; MJ enables it by default). It runs the seeded *Forms — Automation Outbox
  Sweep* every 30 seconds, which retries failed automation attempts and recovers events a stopped
  process left behind. First attempts run in the submitting process right after commit, scheduler or
  not.
- **`ALTER DATABASE … SET READ_COMMITTED_SNAPSHOT ON`.** No migration sets it. It removes a possible
  deadlock between saving a share link and archiving its form (they lock in opposite orders; with it
  off, one of the two is rolled back and must be retried).
- **API keys need the new scopes**: `forms:read` for the response list, detail, summary and link
  claims; `forms:write` for everything that changes a form. A key without them is refused.
- The `Form Respondent` role **loses its Read on Form Versions** (and that grant's row filter,
  `MJ Forms: Respondent Own Form Versions`), removed by `V202610132000` (#302). With it, any holder of
  a public link could read the raw snapshot — answer key, ending redirects, knockout conditions —
  through the generated `mjBizAppsFormsFormVersion` query. The server now reads the published version
  as the system user. Its other grants are unchanged, and its Description now says so.
- Until a host has this release's consolidated `Metadata_Sync`, it has no sweep job: first attempts
  still run, retries wait. Responses are accepted either way.
- **Authoring from a starter template and "Author with AI" keep working for non-Owners on MJ 6.2.**
  MJ 6.2's `RunAction` refuses a non-Owner any action that has no `MJ: Action Authorizations` link and
  does not authorize its caller itself (6.1.5 ignores the marker below, so nothing changes there). `Forms: Create Form From Template` and `Forms: Generate Form
  From Brief` now declare `AuthorizesCaller` (MJ core's convention for client-called actions): each
  already refuses a caller who may not author forms, and that check stays the one authoring
  decision. Nothing to grant. Do not add an Action Authorization for either: any such row replaces
  the marker. The on-submit actions do not declare it; only the automation runner runs them.
- Runbook for dead-lettered and abandoned automation events, and how to re-queue one:
  `docs/local-host.md`, "Operating the automation outbox".

### What changes for respondents

- The form a respondent loads no longer carries scoring, ending screens, score or knockout
  conditions, automations, the quota or the redirect URL (#302). The server decides knockouts and
  which ending to show; a partial save that trips a knockout ends the form with the server's screen.
  Author Preview resolves endings through the same code (#75).
- Answers are checked more strictly, and a bad answer refuses the whole save instead of being
  dropped: an answer for a question not on the form ("That answer does not belong to any question on
  this form."), an answer carrying more than one value column, a value outside a scale, and a
  date-time with no offset ("Include a time zone with the time, such as Z or +02:00.").
- A closed, archived, stale-version or unreadable link answers one sentence, "This form is not
  available."; the reason is in the server log only. `/f/:slug` and uploads refuse a form that is not
  Published, and uploads are refused on a host with no system user. Upload failures use fixed
  messages (503 / 404). The per-session rate bucket and the quota pre-check judge the answers as
  sent; what is stored is only what passed provenance.
- The widget saves when a field is committed (focus leaves it) as well as on its usual debounce, and
  holds the autosave while an answer a rule depends on cannot be stored yet. Measured on a
  three-question form: two partial saves and one final submit. `<mj-form>` with no `api-url` shows
  "This form is not available." instead of a demo form.

### What changes for authors and operators

- **Publish** builds the snapshot on the server, in one transaction, with the strict rule parsers: a
  rule that does not parse, a binding automation whose binding row is gone, or unreadable binding
  settings now **refuse** publish, naming the column. Inactive automations publish without their
  unreadable rule or binding. Templates cannot be published. Two publishes at once: one wins, the
  other gets "Another publish of this form is in progress; reload and try again." Each automation's
  binding settings are frozen into the snapshot, so a form with binding steps published before this
  release shows "Update" in the builder until it is republished.
- **Archive** closes every active share link in the same transaction; **Restore** returns the form to
  Published (or Draft when it never published) and leaves the links closed for a deliberate reopen.
- **Clone, save as template, create from template** each run in one transaction and leave nothing
  behind on failure; template names are checked for uniqueness on the server. The builder's
  structural edits (add, delete, reorder, move) save as one `MJ.SaveEntityGraph` transaction, and each
  structural save also stamps the Form row (UpdatedAt and a Record Change).
- `Forms: Generate Form From Brief` and `Forms: Create Form From Template` gain an optional
  `PublishImmediately` parameter, and no longer create a Draft version first, so their first
  published version is v1. A starter form the Action creates is owned by the caller. An unknown
  template key reads "Unknown template key '…'. Known templates: …". A Designer model that keeps
  emitting side effects costs up to 3 LLM calls before it is refused.
- **Automations** run from the automation outbox, at least once and idempotently per event: a re-run
  never repeats a configured step that already succeeded for that event. The exception is a form that
  runs the four **legacy** on-submit hooks: they write no run rows, so a drain that dies mid-chain and
  is reclaimed fires them again. A failed attempt is retried with exponential backoff (2 s, capped at
  300 s) for at most 5 attempts; a final submit then dead-letters, a partial save is abandoned.
  `FORMS_HOOKS_BLOCKING`, the in-process hook path and the recovery sweep are gone. An anonymous
  respondent is never treated as
  verified: a binding whose identity rule MATCHES an existing record records the match on the
  binding ledger (`Skipped`, with the matched id) and writes nothing to it — no fields, no files; a
  create policy still creates.
- **Responses**: the dashboard, list, detail and export read through `Forms.GetResponseSummary`,
  `ListResponses` and `GetResponseDetail`. The summary is computed on the server and returns
  aggregates only; a caller with a row-level filter on responses is refused it (FORBIDDEN). The
  dashboard's "Sample data" mock mode is removed. An export reads at most 50,000 responses and says
  so when it stops short, and stops with "Responses changed while exporting — try again." if the form
  is republished or answered mid-export; the list says "The list changed — refresh to see it." in the
  same case. List search covers the pages already loaded.
- Share-link slugs no longer end in a hyphen, and a taken slug gets a 5-character suffix.
- `FormDistribution.ResponseCount` is **server-owned**: only a submission's atomic slot `UPDATE`
  advances it. Every save of a link carries the stored count (read under the save's row lock), a
  client change to it is ignored and logged, and a new link starts at 0 — so a builder tab opened
  before responses arrived can no longer roll the count back and reopen slots `MaxResponses` closed.
- A builder edit whose save throws (rather than being refused) is shown in the builder's error banner
  and no longer blocks later saves of the same row.
- **A new form is created when the author asks for it.** A never-saved Form record (New form, or a
  "New Forms Record" tab Explorer restores on its own) opens on a start step with a name box and
  **Create form**; nothing is written until then. The builder used to save an "Untitled form" row as
  soon as it loaded one, so a restored tab left a stray Draft behind.
- The builder offers **Add content above** on the selected first question of a section, the one
  insert position no "after this question" bar reached. A question can be dragged into an empty
  section: the hidden add bar no longer shifts the layout CDK measured when the drag started.
- The dashboard's Refresh keeps the Responses view open, and opening the dashboard reads the summary
  once (MJ's host refreshes the instance while its own init is still loading).
- "What this submission did" and the Automate tab's recent activity show a step's summary as text,
  without the stored JSON envelope or record ids.
- `MJ_BizApps_Forms: Form Responses` now has a record name, the form's name (metadata, shipped in
  this release's `Metadata_Sync`). Explorer's record-name lookup failed for every response before. The
  three foreign keys to it keep `IncludeRelatedEntityNameFieldInBaseView` off, so no view changes.
- `FormAutomationRun.AttemptCount`'s description still mentions the removed recovery sweep; it is
  corrected by a later migration.
- A repeat final submit on an already-sealed response is answered from the stored row — its stored
  answers, or the knockout screen it was sealed on — never from the repeat's own answers, so a
  session cannot probe which ending (or gated redirect) an answer set earns (#302).
- Publishing a form with a question whose `PageID` is empty places it on the first page instead of
  failing with "Cannot read properties of null".

### Migrations

- `V202610131349` creates `FormAutomationEvent`, the automation outbox (one row per run a save owes,
  with its claim state, lease and attempt count), and adds nullable `FormAutomationRun.FormAutomationEventID`
  (FK), the event whose run ran the step. Rows written before it are `NULL` and belong to no event.
- `V202610131416` files five fields (two on FormDistribution, two on FormResponse, one on
  FormAutomationRun) in their category panels on hosts built from migrations (metadata only).
- `V202610132000` deletes the `Form Respondent` role's Form Versions grant (matched by role and
  entity name, every duplicate) and its row filter, unless another permission row still names the
  filter (#302). Idempotent; it throws if the grant survives.

### Breaking API changes, by package

- **`forms-entities`**: removed the retired mutation's `FormSubmissionInput` / `FormSubmissionResult`
  (use the generated `FormsSaveResponseInput` / `FormsSaveResponseOutput`). Gains `generated/remote_operations.ts` (one `Forms*Operation` class and its
  I/O types per operation) and, in `contracts/`, `toRespondentDefinition` and the respondent
  projection, `validateAnswers`, `settleVisibility`, the answer-shape helpers, `rulesMayRead`,
  `RuleBearingDefinition` (`endScreens` now required), `isZonelessDateTime` /
  `ZONELESS_DATE_TIME_MESSAGE`, the Designer blueprint schema and side-effect-key helpers, and the
  builder modules that moved out of `forms-ng` (snapshot builder, rules inventory, condition sources,
  jump reach, option labels, asset refs, `isOpenToResponses`, `slugify`, `remapConditionalRule`,
  `remapFieldMappings`, `RemapResult`, `unreadableDraftMessage`). The tolerant
  `parseConditionalRule` / `parseValidationRule` / `parseFormSettings` are removed in favour of the
  zod parsers. `FormStructureGraph`'s default commit refuses on a server-side provider; server
  callers pass an explicit commit.
- **`forms-core-entities-server`**: now holds every engine (`FormPublishingEngine`,
  `FormAuthoringEngine`, `FormDistributionEngine`, `FormAutomationEngine`, `FormSubmissionEngine`,
  `FormReportingEngine`), the entity server subclasses, the operation server classes, the
  automation outbox (`OUTBOX_RESPONSE_SUBMITTED`, `drainAutomationOutbox`, `FormsAutomationDrainDriver`),
  and the helpers that moved from `forms-actions` and
  `forms-server` (`loadFormResponseContext`, the binding executor and ledger, `STARTER_TEMPLATES` /
  `getStarterTemplate` / `StarterTemplate`, `resolvePublishedDefinition`). New exports include
  `refuseFormAuthoring`, `withActionDatabaseProvider`, `FORMS_ENTITY`, `readFormPublication` /
  `FormPublication`, `SUMMARY_NOT_AVAILABLE_MESSAGE` / `ROW_RESTRICTED_SUMMARY_MESSAGE`. Signatures changed:
  `resolvePublishedDefinition` takes a fourth
  argument, the system reader, which now reads the form's `Status` **and** its published version.
  `DefinitionLoadFailure` gains `form-not-published` and `form-unreadable`.
  `FormAuthoringError` gains `fault`. New MJ peers: `actions`, `actions-base`, `ai-agents`,
  `ai-core-plus`, `generic-database-provider`, `scheduling-engine` and `scheduling-base-types`. Listed under
  `server` in `mj-app.json`.
- **`forms-actions`**: thin wrappers over the engines. Removed: `buildFormFromBlueprint`,
  `FormPersistError`, the blueprint types, `STARTER_TEMPLATES` / `getStarterTemplate` /
  `StarterTemplate` (now in `forms-core-entities-server`), `parseFormBlueprint` (now
  `parseDesignerBlueprint`, with `DesignerSideEffectError`), the shared action helpers, and the
  `FormVersionID` output. `runAuthoring` has a new signature. New: `readOnSubmitConfig`,
  `withOnSubmitConfig`.
- **`forms-server`**: transport only. Removed: the `PublishedForm` query and `SubmitFormResponse`
  mutation (use `Forms.GetRespondentForm` / `Forms.SaveResponse`), the `FormDistributionClaims` query
  (use `Forms.GetDistributionClaims`), `PublicFormResolver`, `DistributionClaimsResolver`, the
  isolated provider and dispatcher, and the recovery sweep. The `/f/:slug`, redeem, resume, upload,
  asset, download and widget-bundle routes keep their URLs and wire shapes. No longer declares
  `type-graphql` as a peer: no hand-written resolver is left, and the generated ones take their
  decorators through `@memberjunction/server`.
- **`forms-ng`**: removed `PublishService` / `PublishResult`, `FormCloneService`,
  `FormTemplatesService` / `SavedTemplateRow` (the row type now lives in an unexported module),
  `ResponsesDataService`, and these exports:
  - dashboard: the browser aggregation modules `reporting-aggregations`, `question-insight-roles`,
    `respondent-profile`, `open-text-insights`, `temporal-buckets` and `statistics` (the summary is
    `Forms.GetResponseSummary`; the view types are `report-view`);
  - widget: `validateQuestion`, `hasValue`, `FieldValidationResult` (use `validateAnswers` from
    `forms-entities`);
  - shared: `renderAnswer`, `respondentLabel`, `extractChoiceValues`, `CHOICE_TYPES`,
    `NUMERIC_TYPES`, `TEXT_TYPES` (now in `forms-entities`);
  - builder: `jumpReach` / `reachNote` and `JumpReach`, `ReachItem`, `ReachPage`, `ReachSource`;
    `collectRuleEntries`, `ruleBadgesFor`, `endingReachFor` and `EndingReach`, `RuleBadge`,
    `RuleEntry`, `RuleInventoryForm`, `RuleInventoryItem`, `RuleInventoryPage`, `RuleItemKind`;
    `buildPublishedDefinition`, `isOpenToResponses`, `slugify`; the template `clone-remap` module
    (all now in `forms-entities`). `DistributionService.create` returns a result object. Widget: `FormRuntime` takes a
  `WidgetForm`; `IFormsApiService` is reshaped around the two respondent operations;
  `FormsOfflineApiService` replaces the mock in the shipped entry; `AutosaveFn` may return
  `NOTHING_TO_SAVE`; `AutosaveController` takes a fifth hooks parameter; `buildDraftInputs` returns
  `DraftInputs`. Responses and dashboard: `FormsReportingService.loadReport` returns a `ReportLoad`;
  `FormsReportingExportService.exportResponses` takes `(form, format)` and returns an `ExportOutcome`;
  `ResponseAutomationRunView` is renamed `ResponseAutomationAttempt`, whose `automationEventId`
  names the outbox event that ran the step.
