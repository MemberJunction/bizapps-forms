# MJ Forms Skill

**MJ Forms** (`mj-bizapps-forms`) is installed in this MemberJunction workspace. Use this skill whenever the user wants to draft or inspect forms, surveys, or intake workflows; check distribution links and response volume; summarize respondent submissions and written-response scores; or review form automation and entity-binding outcomes.

## 1. Core Data Access, Authorization & RLS Rules

- **Always read through `RunView` or the bound typed authoring actions under the caller's `ContextUser` — NEVER execute raw SQL.**
- Row-Level Security and entity permissions strictly isolate form data per caller:
  - `Form Respondent` sessions are scoped by `MJ Forms: Respondent Own Response` (`CAST(ID AS NVARCHAR(450)) = '{{ScopeResourceID}}'`), `MJ Forms: Respondent Own Response Answers`, and `MJ Forms: Respondent Own Distribution`, and may never read other respondents' submissions or author forms.
  - Interactive form authoring (`Forms: Generate Form From Brief` and `Forms: Create Form From Template`) checks caller authoring permissions before invoking the model or writing records, and saves using the caller's own permissions.
  - On-submit automation hooks (`Forms: Upsert Respondent Person`, `Forms: Send Confirmation Email`, `Forms: Create Followup Task`, `Forms: Analyze Written Responses`, `Forms: Bind Response To Entity`) run under the `Forms Automation Runner` service role rather than direct user calls.
- Never claim or infer responses, distributions, or forms outside what `RunView` returns for the caller.

## 2. Core Entities & Key Fields

| Entity Name | Purpose & Key Fields |
| --- | --- |
| `MJ_BizApps_Forms: Forms` | Form definitions: `Name`, `Description`, `CategoryID`, `StyleID`, `Status` (`Draft`, `Published`, `Closed`), `OwnerUserID`, `RenderMode` (`OneQuestion`, `Scroll`), `IsTemplate`, `RequiresPublishApproval`, `PublishApproverRoleID`. |
| `MJ_BizApps_Forms: Form Versions` | Immutable published snapshots of a form used to anchor responses. |
| `MJ_BizApps_Forms: Form Pages`, `Form Questions`, `Form Question Options`, `Form Screens` | Form structure: page `DisplayOrder` / `ConditionalRule`, question `QuestionType` (`ShortText`, `LongText`, `SingleChoice`, `MultiChoice`, `Dropdown`, `NPS`, `Rating`, `OpinionScale`, `Matrix`, `Date`, `Email`, `Phone`, `FileUpload`, `YesNo`, etc.), `Prompt`, `IsRequired`, `ScoringConfig`, and Welcome/Ending screens. |
| `MJ_BizApps_Forms: Form Distributions` | Publishing channels & links: `FormID`, `Name`, `Slug`, `ChannelType` (`PublicLink`, `Email`, `Embed`, `QR`), `Status` (`Draft`, `Active`, `Closed`), `OpenAt`, `CloseAt`, `MaxResponses`, `ResponseCount`, `AllowDeviceResume`, `IsActive`. |
| `MJ_BizApps_Forms: Form Responses` | Submitted or in-progress responses: `FormID`, `FormVersionID`, `FormDistributionID`, `Status` (`Partial`, `Complete`, `Disqualified`), `RespondentPersonID`, `StartedAt`, `SubmittedAt`. |
| `MJ_BizApps_Forms: Form Response Answers` | Per-question answers: `ResponseID`, `QuestionID`, `TextValue`, `NumericValue`, `DateValue`, `BooleanValue`, `JSONValue`, `FileID`, `Score`, `ScoreRationale`. |
| `MJ_BizApps_Forms: Form Automations`, `Form Automation Events`, `Form Automation Runs` | Post-submit automation definitions (`TargetType`: `Action`, `Agent`, `EntityBinding`; `Trigger`: `OnComplete`, `OnPartial`, `OnCompleteOrPartial`) and run logs (`Status`: `Pending`, `Running`, `Succeeded`, `Failed`, `Skipped`, `ErrorMessage`). |
| `MJ_BizApps_Forms: Form Entity Bindings` & `Form Entity Binding Records` | Declarative mapping from form answers into target MJ entities (`TargetEntityName`, `Outcome`: `Created`, `Merged`, `Skipped`, `Unchanged`). |
| `MJ_BizApps_Forms: Form Uploads` | Upload provenance ledger for `FileUpload` answers. |
| `MJ_BizApps_Forms: Form Categories` & `Form Styles` | Taxonomy (`Name`, `ParentID`, `IsActive`) and visual themes. |

## 3. Bound Typed Actions Playbook

1. **Draft a new form from a description (`Forms: Generate Form From Brief`):**
   - Pass `Brief` (required natural-language description), optional `OwnerUserID` (defaulting to caller), optional `OnSubmitMode` (`Legacy` or `Configured`), optional `Automations`, and optional `PublishImmediately` (default `false` — confirm with the user before setting `PublishImmediately = true`).
   - Note that the Designer LLM authors questions only and never wires side-effect automations on its own.
2. **Instantiate a starter template (`Forms: Create Form From Template`):**
   - Pass `TemplateKey` (e.g. Contact, RSVP, NPS/feedback, Lead capture, Application), optional `OwnerUserID`, and optional `PublishImmediately` (default `false`).

## 4. Common Chief of Staff Workflows

- **Response & NPS digest:** Query `MJ_BizApps_Forms: Form Responses` (`Status = 'Complete'`, ordered by `SubmittedAt DESC`) and join answers from `MJ_BizApps_Forms: Form Response Answers` to summarize completion volume, numeric/NPS averages, and AI-scored `Score` / `ScoreRationale` highlights.
- **Distribution & intake health:** Query `MJ_BizApps_Forms: Form Distributions` (`Status = 'Active'`) to flag forms approaching `MaxResponses` or `CloseAt`, and check `MJ_BizApps_Forms: Form Automation Runs` where `Status = 'Failed'` to surface broken downstream workflows.
- **Publish-approval queue:** Query `MJ_BizApps_Forms: Forms` where `RequiresPublishApproval = 1` and `Status = 'Draft'` to help owners see forms awaiting review.
