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
import type { SocialLink } from './social-links';
import type { JSONValue } from './json-value';
import type { FormQuestionType, MatrixAxis } from './question-types';


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

/**
 * A selectable option for any option-carrying question — see `QuestionOptionMode`.
 *
 * The two optional fields below are per-`optionMode` and mutually exclusive in practice:
 * `imageURL` is read only by `PictureChoice`, `matrixAxis` only by `Matrix`. They live on the
 * one option shape rather than in three parallel shapes because everything else about an
 * option (label, value, order, default) is identical across all four modes, and three
 * near-copies would have to be kept in step by hand.
 */
export interface PublishedFormQuestionOption {
  id: string;
  label: string;
  value: string;
  displayOrder: number;
  isDefault?: boolean;
  /** `PictureChoice` only: the image shown above the label. */
  imageURL?: string;
  /** `Matrix` only: which axis this option is part of. Absent is treated as `Row`. */
  matrixAxis?: MatrixAxis;
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
  /**
   * When true, ADVANCING PAST this page banks a `Partial` response immediately rather than
   * waiting for the autosave debounce.
   *
   * The autosave controller already writes partials on a timer, so this does not add a
   * capability — it makes the timing AUTHORABLE. An author who puts the contact details on
   * page 1 of a ten-page form wants that page banked the moment it is left, because a
   * respondent who abandons on page 6 is a lead either way. Absent/false keeps the timer-only
   * behaviour every existing form has.
   */
  isPartialSubmitPoint?: boolean;
  questions: PublishedFormQuestion[];
}

/** What an automation runs when it fires. */
export type FormAutomationTargetType = 'Action' | 'Agent' | 'EntityBinding';

/** Which save fires an automation. `OnComplete` is the default — partial saves fire nothing. */
export type FormAutomationTrigger = 'OnComplete' | 'OnPartial' | 'OnCompleteOrPartial';

/**
 * How an automation is sequenced against the OTHER automations on the same response.
 *
 * `Sync` runs in order, one at a time, each awaited before the next starts — so a later step can
 * rely on what an earlier one produced, and `continueOnError: false` can meaningfully halt the
 * rest. `Async` is dispatched without being awaited and is ordered against nothing.
 *
 * NOT a promise about the respondent's confirmation. The whole automation chain — Sync steps
 * included — is dispatched detached from the submit request, because awaiting it made every
 * respondent wait for someone else's integration (measured on a real form: 8070ms of an 8348ms
 * submit). Confirmation is built from the published definition and never from an automation's
 * result, so nothing the respondent is shown depends on the chain having finished. This line
 * previously claimed Sync was "awaited before the respondent's confirmation"; that stopped being
 * true when the dispatch was detached, and a contract nobody honours is worse than a narrower one
 * that everybody does.
 *
 * The gap this leaves is real and deliberate: there is no per-automation way to say "hold the
 * confirmation until this finishes", only the process-wide `FORMS_HOOKS_BLOCKING` switch. Adding
 * one is a product decision, not a doc fix — every automation the builder creates defaults to
 * `Sync`, so making Sync block would put existing forms' respondents back behind the full chain.
 */
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
 * A screen that BRACKETS the intake rather than living inside it.
 *
 * WHY THIS IS NOT A QUESTION TYPE. `Statement` — display-only content that sits between two
 * questions — is a question, and correctly so: it is on a page, in the display order, subject
 * to the page's conditional rule. A welcome or ending screen is none of those things. It is
 * never answered, produces no `FormResponseAnswer`, appears in no aggregation and no export
 * column, cannot be referenced by a conditional rule, and has no page. Modelling it as a
 * question would push a "…but not this one" branch into every consumer that walks the
 * question list — the same tax `Statement` levies today, on a type that shares far less with
 * a question than `Statement` does.
 *
 * In the widget this falls out as PHASES of the shell — `welcome` before intake, `ending`
 * after submit — so the intake components never see a screen at all.
 */
export type FormScreenType = 'Welcome' | 'Ending';

/** A published welcome or ending screen. */
export interface PublishedFormScreen {
  id: string;
  screenType: FormScreenType;
  title: string;
  /** Body copy shown under the title. Plain text; the widget does not render HTML. */
  body?: string;
  /** Label for the screen's single button ("Start", "Done"). Widget supplies a default. */
  buttonLabel?: string;
  /** Optional image shown above the title. */
  mediaURL?: string;
  /**
   * `Ending` only: where to send the respondent instead of showing the screen.
   *
   * Takes precedence over this screen's own copy, and over `FormSettings.redirectUrl`, which
   * remains the form-wide fallback for forms with no ending screens at all.
   */
  redirectURL?: string;
  /** `Ending` only: social links rendered as icons under the message. Absent means none. */
  socialLinks?: SocialLink[];
  displayOrder: number;
  /**
   * `Ending` only: show this ending when the response matches. Absent => matches nothing on
   * its own; use {@link isDefault} for the catch-all.
   */
  conditionalRule?: ConditionalRule;
  /** `Ending` only: the fallback shown when no conditional ending matched. */
  isDefault?: boolean;
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
  /**
   * The screen shown BEFORE intake begins, if the author configured one.
   *
   * Optional rather than always-present, unlike `automations`: absent means "start on the
   * first question", which is what every form published before screens existed does and what
   * most short forms should keep doing. An empty-object placeholder would force the widget to
   * distinguish a blank welcome screen from no welcome screen.
   */
  welcomeScreen?: PublishedFormScreen;
  /**
   * Ending screens in authoring order. Always present (empty for a form that configures none)
   * so a consumer never has to tell "no endings" from "an older snapshot" — the resolution
   * order in {@link resolveEndingScreen} treats both identically anyway.
   */
  endScreens: PublishedFormScreen[];
}
