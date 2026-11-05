/**
 * What the widget holds about a form — and, in the same value, who decides where a response ends.
 *
 * There are two kinds, and the difference is not cosmetic:
 *
 *  - `projection`: the LIVE form. `Forms.GetRespondentForm` serves the respondent projection
 *    (`toRespondentDefinition`, #302): no scoring, no ending screens, no score or knockout conditions,
 *    no automations. The widget cannot judge a knockout or pick an ending from it, so it never tries;
 *    `Forms.SaveResponse` says whether the form ended and with which screen.
 *  - `full`: the author's draft in the builder's Preview. Nothing is sent anywhere, so the widget
 *    resolves the ending locally through the same contracts function the server uses
 *    (`resolveResponseOutcome`, DW13 / #75).
 *
 * The `kind` is the discriminant the rest of the widget switches on, and it is deliberately the SAME
 * discriminant contracts' `rulesMayRead` takes (`RuleHolder`), so a runtime hands it this value
 * unchanged. It used to be inferred from a missing `endScreens` key, which one `?? []` written to
 * satisfy a type would have undone without a test noticing (#303 Task 10c, re-review N4-5).
 */
import type {
  FormRenderMode,
  FormStyleTokens,
  PublishedFormDefinition,
  PublishedFormPage,
  PublishedFormScreen,
  RespondentFormDefinition,
} from '@mj-biz-apps/forms-entities/contracts';

/**
 * Everything a surface of the widget renders, whichever kind of form it came from.
 *
 * The respondent projection's shape, widened only where a full definition's richer types must also
 * fit (`PublishedFormPage` carries `scoring`, the projection's pages are a subset of it).
 */
export interface WidgetRenderDefinition {
  readonly formId: string;
  readonly formVersionId: string;
  readonly name: string;
  readonly description?: string;
  readonly renderMode: FormRenderMode;
  /** Whether a Turnstile challenge must be solved before a final submit. */
  readonly captchaRequired: boolean;
  /** The form-wide confirmation copy, for a submit that lands on no ending screen. */
  readonly confirmationMessage?: string;
  readonly styleTokens: FormStyleTokens;
  readonly welcomeScreen?: PublishedFormScreen;
  readonly pages: readonly PublishedFormPage[];
}

/** The live form: the respondent projection. The server ends it. */
export interface ProjectionWidgetForm {
  readonly kind: 'projection';
  readonly render: WidgetRenderDefinition;
}

/** The author's draft, in Preview: every rule is here, and nothing is sent anywhere. */
export interface FullWidgetForm {
  readonly kind: 'full';
  readonly render: WidgetRenderDefinition;
  /** The full definition the render was derived from — endings, scoring, settings and all. */
  readonly definition: PublishedFormDefinition;
}

export type WidgetForm = ProjectionWidgetForm | FullWidgetForm;

/** The live form, from the projection `Forms.GetRespondentForm` served (already parsed and checked). */
export function projectionForm(projection: RespondentFormDefinition): ProjectionWidgetForm {
  return { kind: 'projection', render: projection };
}

/** The Preview form, from the author's full draft definition. */
export function fullForm(definition: PublishedFormDefinition): FullWidgetForm {
  const render: WidgetRenderDefinition = {
    formId: definition.formId,
    formVersionId: definition.formVersionId,
    name: definition.name,
    description: definition.description,
    renderMode: definition.renderMode,
    captchaRequired: definition.settings.captchaRequired === true,
    confirmationMessage: definition.settings.confirmationMessage,
    styleTokens: definition.styleTokens,
    welcomeScreen: definition.welcomeScreen,
    pages: definition.pages,
  };
  return { kind: 'full', render, definition };
}
