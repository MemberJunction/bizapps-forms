/**
 * The canonical shape of a PUBLISHED form.
 *
 * This is what `FormVersion.DefinitionSnapshot` (JSON) stores at publish time, and
 * what the S1 `PublishedForm` read endpoint returns to the respondent widget. It is
 * deliberately DECOUPLED from the generated entity row types: a snapshot is
 * immutable data captured at publish, not a live row, so it must not drift if the
 * underlying entity columns later change. The builder (WP-D) produces it; the widget
 * (WP-C) and server (WP-B) consume it.
 */
import type { ConditionalRule, ValidationRule } from './conditional-rule';
import type { JSONValue } from './json-value';

/**
 * Phase-1 table-stakes question types (FORMS_BUILD_PLAN §5.3). This union is the
 * exhaustive Phase-1 set — Phase-2 types (Matrix, Ranking, Address, Signature,
 * Payment, Calculated) are intentionally NOT included.
 */
export type FormQuestionType =
  | 'ShortText'
  | 'LongText'
  | 'Email'
  | 'Phone'
  | 'Number'
  | 'SingleChoice'
  | 'MultiChoice'
  | 'Dropdown'
  | 'Rating'
  | 'NPS'
  | 'YesNo'
  | 'Date'
  | 'Time'
  | 'FileUpload'
  | 'Statement';

/** Render mode for the whole form (FORMS_BUILD_PLAN §2 principle 2). */
export type FormRenderMode = 'Scroll' | 'OneQuestion';

/**
 * Resolved styling for a published form, lifted from the linked `FormStyle`.
 * `cssVariables` is the map of `--mj-*` / `--mjf-*` token overrides the widget
 * applies; there are no hardcoded colors anywhere downstream.
 */
export interface FormStyleTokens {
  cssVariables: Record<string, string>;
  customCSS?: string;
  logoURL?: string;
}

/**
 * Form-level behavioral settings, mirroring `Form.Settings` (JSON). Governs
 * anonymous access, captcha gating, response quota, the open/close window, and the
 * post-submit experience.
 */
export interface FormSettings {
  anonymousAllowed: boolean;
  captchaRequired: boolean;
  /** Max total responses across the form, if capped. */
  quota?: number;
  /** ISO-8601 timestamp before which the form is not yet open. */
  opensAt?: string;
  /** ISO-8601 timestamp after which the form no longer accepts responses. */
  closesAt?: string;
  /** Message shown after a successful submit (when no redirect). */
  confirmationMessage?: string;
  /** URL to redirect to after a successful submit (takes precedence over message). */
  redirectUrl?: string;
}

/** A selectable option for choice-style questions (Single/Multi/Dropdown). */
export interface PublishedFormQuestionOption {
  id: string;
  label: string;
  value: string;
  displayOrder: number;
  isDefault?: boolean;
}

/**
 * A single published question. `settings` carries genuinely-open per-type
 * configuration (e.g. rating scale max, NPS labels) as structured JSON — never
 * `any`.
 */
export interface PublishedFormQuestion {
  id: string;
  type: FormQuestionType;
  prompt: string;
  helpText?: string;
  isRequired: boolean;
  displayOrder: number;
  /** Show/hide logic (S2). Absent => always visible. */
  conditionalRule?: ConditionalRule;
  /** Declarative validation (S2). `required` lives on `isRequired`, not here. */
  validationRule?: ValidationRule;
  /** Per-question-type open settings (scale bounds, placeholders, etc.). */
  settings?: Record<string, JSONValue>;
  /** Options for choice-style questions; empty for non-choice types. */
  options: PublishedFormQuestionOption[];
}

/** A page (section) of a published form, holding ordered questions. */
export interface PublishedFormPage {
  id: string;
  title?: string;
  description?: string;
  displayOrder: number;
  /** Page-level show/hide logic (S2). Absent => always visible. */
  conditionalRule?: ConditionalRule;
  questions: PublishedFormQuestion[];
}

/** What an automation runs when it fires. */
export type FormAutomationTargetType = 'Action' | 'Agent' | 'EntityBinding';

/** Which save fires an automation. `OnComplete` is the default — partial saves fire nothing. */
export type FormAutomationTrigger = 'OnComplete' | 'OnPartial' | 'OnCompleteOrPartial';

/** `Sync` is awaited before the respondent's confirmation; `Async` is dispatched and not awaited. */
export type FormAutomationExecutionMode = 'Sync' | 'Async';

/**
 * One configured on-submit automation, as captured at publish time.
 *
 * Automations execute from the SNAPSHOT, never from the live `FormAutomation` rows: a response
 * is pinned to the form version it was answered against, so it must also run that version's
 * automation config. The authoring table is where an author edits; this is what actually ran,
 * which is the thing an audit needs to be able to reconstruct.
 *
 * `id` is the `FormAutomation.ID` this was cloned from, kept stable across publishes so run
 * records and ledger rows stay attributable to a configuration a human can still find.
 */
export interface PublishedFormAutomation {
  id: string;
  name: string;
  targetType: FormAutomationTargetType;
  /** Set when `targetType` is `Action`. */
  actionId?: string;
  /** Set when `targetType` is `Agent`. */
  agentId?: string;
  /** Set when `targetType` is `EntityBinding`. */
  bindingId?: string;
  trigger: FormAutomationTrigger;
  executionMode: FormAutomationExecutionMode;
  displayOrder: number;
  /** Fire only when the response's answers match. Absent => always fires. */
  conditionalRule?: ConditionalRule;
  /** When false, a failure halts later `Sync` automations for this response. */
  continueOnError: boolean;
  isActive: boolean;
}

/**
 * The full published form definition — the snapshot stored in
 * `FormVersion.DefinitionSnapshot` and returned by the S1 `PublishedForm` query.
 */
export interface PublishedFormDefinition {
  formId: string;
  formVersionId: string;
  name: string;
  description?: string;
  renderMode: FormRenderMode;
  settings: FormSettings;
  styleTokens: FormStyleTokens;
  pages: PublishedFormPage[];
  /**
   * On-submit automations, in authoring order. Always present (empty for a form that configures
   * none, and for every snapshot published before automations existed) so no consumer has to
   * distinguish "no automations" from "an older snapshot".
   */
  automations: PublishedFormAutomation[];
}
