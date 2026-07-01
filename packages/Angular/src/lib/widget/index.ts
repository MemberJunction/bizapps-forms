/**
 * Public surface of the respondent widget (WP-C). Exposes the `<mj-form>` root
 * component, the custom-element registration, the S1 API seam (interface + token +
 * real/mock implementations + config), and the headless runtime — so host apps can
 * embed the element OR mount the component directly with their own provider wiring.
 */
export { MjFormComponent } from './mj-form.component';
export { registerMjFormElement, MJ_FORM_TAG } from './register-element';

// S1 API seam
export { FORMS_API_SERVICE, type IFormsApiService } from './api/forms-api.interface';
export {
  FORMS_API_CONFIG,
  type FormsApiConfig,
  deriveUploadUrl,
  normalizeApiConfig,
} from './api/forms-api.config';
export { FormsGraphQLApiService } from './api/forms-api.graphql.service';
export { FormsMockApiService } from './api/forms-api.mock.service';
export {
  FormUploadService,
  buildUploadFormData,
  parseUploadResponse,
  type UploadedFile,
  type UploadProgress,
} from './api/form-upload.service';

// Render-mode + question components (for direct embedding / testing)
export { FormScrollComponent } from './components/form-scroll.component';
export { FormOneQuestionComponent } from './components/form-one-question.component';
export { TurnstileChallengeComponent } from './components/turnstile-challenge.component';
export { FormQuestionComponent } from './components/questions/form-question.component';
export { FormProgressComponent } from './components/form-progress.component';

// Headless runtime + helpers
export { FormRuntime } from './core/form-runtime';
export {
  AutosaveController,
  type AutosaveFn,
  type AutosaveStatus,
  type TimerApi,
} from './core/autosave-controller';
export { clampCursor } from './core/one-question-stepper';
export { applyStyleTokens } from './core/theming';
export { validateQuestion, hasValue, type FieldValidationResult } from './core/validation';
export { toAnswerInputs, type AnswerMap } from './core/answer-value';
export {
  captchaRequired,
  canRenderChallenge,
  canSubmit,
  isConfigGap,
  isSiteKeyConfigured,
  isTurnstileError,
} from './core/turnstile-gate';
export {
  ensureTurnstileScript,
  getTurnstile,
  DEFAULT_TURNSTILE_SCRIPT_URL,
  type TurnstileApi,
  type TurnstileRenderOptions,
} from './core/turnstile-loader';
