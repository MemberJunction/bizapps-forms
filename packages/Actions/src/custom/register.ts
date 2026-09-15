/**
 * Barrel for the hand-written (non-generated) Forms actions.
 *
 * Importing this module forces every `@RegisterClass`-decorated action subclass to be
 * evaluated, so they register with MJGlobal's class factory and become resolvable by
 * name (e.g. via `ClassFactory.CreateInstance(BaseAction, 'Forms: …')`). Without a
 * reference, a bundler could tree-shake the action files away and the names would not
 * resolve. Call {@link LoadFormsActions} once at server startup.
 *
 * Registered action names (the seam-S3 contract + the authoring/template surface):
 *   - 'Forms: Upsert Respondent Person'
 *   - 'Forms: Send Confirmation Email'
 *   - 'Forms: Create Followup Task'
 *   - 'Forms: Analyze Written Responses'
 *   - 'Forms: Generate Form From Brief'
 *   - 'Forms: Create Form From Template'
 *   - 'Forms: Bind Response To Entity'
 *
 * It also registers the SIBLING APPS' entity classes the on-submit actions write through — see
 * {@link LoadSiblingEntities}.
 */
import { LoadGeneratedEntities as LoadCommonEntities } from '@mj-biz-apps/common-entities';
import { LoadGeneratedEntities as LoadTasksEntities } from '@mj-biz-apps/tasks-entities';
import { BindResponseToEntityAction } from './binding/bind-response-to-entity.action';
import { UpsertRespondentPersonAction } from './on-submit/upsert-respondent-person.action';
import { SendConfirmationEmailAction } from './on-submit/send-confirmation-email.action';
import { CreateFollowupTaskAction } from './on-submit/create-followup-task.action';
import { AnalyzeWrittenResponsesAction } from './on-submit/analyze-written-responses.action';
import { GenerateFormFromBriefAction } from './authoring/generate-form.action';
import { CreateFormFromTemplateAction } from './templates/create-form-from-template.action';

// Re-export the action classes + the seams/helpers consumers may want.
export {
  UpsertRespondentPersonAction,
  SendConfirmationEmailAction,
  CreateFollowupTaskAction,
  AnalyzeWrittenResponsesAction,
  GenerateFormFromBriefAction,
  CreateFormFromTemplateAction,
};
export {
  setResponseAnalyzerModel,
} from './on-submit/analyze-written-responses.action';
export {
  AIPromptResponseAnalyzerModel,
  RESPONSE_ANALYZER_PROMPT_NAME,
  type ResponseAnalyzerModel,
  type AnalyzerInputAnswer,
  type AnalyzedAnswer,
} from './on-submit/response-analyzer-model';
export * from './shared/action-params';
export * from './shared/form-response-context';
export * from './authoring/form-blueprint';
export * from './authoring/form-blueprint-builder';
export * from './authoring/llm-form-designer';
export {
  GenerateFormFromBriefAction as GenerateFormAction,
  setFormDesignerModel,
  runAuthoring,
} from './authoring/generate-form.action';
export {
  setConfirmationEmailSender,
  LoggingConfirmationEmailSender,
  type ConfirmationEmailSender,
  type ConfirmationEmail,
  type ConfirmationEmailResult,
} from './on-submit/send-confirmation-email.action';
export {
  CommunicationEngineConfirmationEmailSender,
  installCommunicationEngineConfirmationSender,
  DEFAULT_MESSAGE_TYPE,
  type ConfirmationEmailConfig,
  type ConfirmationEmailEngine,
} from './on-submit/confirmation-email-sender';
export * from './templates/starter-templates';

/**
 * The set of action classes this package contributes. Referencing them here (and
 * returning the count) guarantees the decorators run even under aggressive
 * tree-shaking.
 */
const FORMS_ACTION_CLASSES = [
  UpsertRespondentPersonAction,
  SendConfirmationEmailAction,
  CreateFollowupTaskAction,
  AnalyzeWrittenResponsesAction,
  GenerateFormFromBriefAction,
  CreateFormFromTemplateAction,
  BindResponseToEntityAction,
] as const;

/**
 * Register the sibling apps' generated entity classes, at MODULE LOAD.
 *
 * `Forms: Upsert Respondent Person` writes `MJ_BizApps_Common: People`; `Forms: Create Followup
 * Task` writes three `MJ_BizApps_Tasks:` entities. Forms deliberately does not generate any of
 * them (`excludeSchemas` in mj.config.cjs), so the actions can only name their classes through
 * `import type` — and a type import is erased at compile time. Nothing in the shipped package
 * ever loaded the packages that own them, which made them a PHANTOM RUNTIME DEPENDENCY: correct
 * only on a host that happened to load them for its own reasons.
 *
 * The failure is silent, which is why it survived. `GetEntityObject` does not throw for an
 * unregistered entity — MJ's ClassFactory falls back to a plain `BaseEntity` (providerBase's
 * `CreateInstance(BaseEntity, entityName, …)`), which has `Get`/`Set` but none of the generated
 * typed accessors. `person.FirstName = 'Ada'` then defines a JS own-property the entity never
 * reads, and the record saves as all-nulls. Issue #60: the upsert action reported
 * `First Name cannot be null` for responses whose First name answer was sitting in the row, while
 * the entity-binding action — which writes the SAME entity through `record.Set(field, value)` —
 * wrote those same answers correctly seconds later in the same submit.
 *
 * At module scope, NOT inside {@link LoadFormsActions}: nothing in production calls that function
 * (its only caller is this package's own spec). Registration has to happen on import, exactly as
 * the action classes' own decorators do.
 *
 * These packages stay `peerDependencies` rather than `dependencies` — the host owns the single
 * copy, and promoting them risks a second one, which the ClassFactory resolves by taking the LAST
 * registration for a key and warns about at startup.
 *
 * Both `LoadGeneratedEntities` functions have empty bodies and return `void`: the registration is
 * the `export *` side effect of importing the module at all, and the call is the anti-tree-shake
 * anchor that keeps a bundler from dropping the import. `register.spec.ts` asserts the outcome
 * rather than the calls, because the calls are not what does the work.
 */
LoadCommonEntities();
LoadTasksEntities();

/** Force-load all Forms action subclasses so their @RegisterClass decorators fire. */
export function LoadFormsActions(): number {
  return FORMS_ACTION_CLASSES.length;
}
