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
 */
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
] as const;

/** Force-load all Forms action subclasses so their @RegisterClass decorators fire. */
export function LoadFormsActions(): number {
  return FORMS_ACTION_CLASSES.length;
}
