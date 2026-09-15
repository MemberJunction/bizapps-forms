/**
 * The four on-submit actions that ran for every form before automations were configurable.
 *
 * Shared because two places must agree on them exactly: the server still fires this list for any
 * form that configures nothing, and the builder seeds an equivalent automation for each one the
 * first time a form configures anything. If those two lists drift, adding a single binding to a
 * form silently changes what else happens on submit — which is precisely the failure this
 * definition exists to prevent.
 *
 * HOW A FORM DECLINES THEM. Dispatch is no longer inferred from whether this list is empty: a form
 * whose settings say `onSubmitMode: 'Configured'` runs its own automations, INCLUDING when it has
 * none. See {@link resolveOnSubmitDispatch} and `docs/on-submit-automations.md` — which also
 * documents `Forms: Upsert Respondent Person` as the owner of respondent identity, so a consuming
 * app reads `FormResponse.RespondentPersonID` instead of deriving a second Person of its own.
 *
 * WHY THE BUILDER SEEDS THEM AT ALL. Dispatch is all-or-nothing: a form whose snapshot carries any
 * automations runs those and nothing else. Without seeding, an author who adds one binding would
 * lose their confirmation email, their follow-up task, their respondent-Person upsert and their
 * answer scoring, with no warning and no error — a regression triggered by using the feature.
 * Seeding makes the cutover explicit and, more importantly, VISIBLE: the four appear in the On
 * Submit tab as ordinary rows the author can reorder or disable.
 */

/**
 * The names, in the order the legacy runner fired them — the single source of truth.
 *
 * `as const` is load-bearing, not decoration: it is what makes {@link LegacyOnSubmitActionName} a
 * union of these four literals rather than `string`, so a typo in any consumer is a compile error.
 * Widening this to `readonly string[]` costs nothing visible and silently turns every downstream
 * name check back into a runtime surprise.
 *
 * Order is preserved deliberately even though these four do not depend on each other today:
 * `Upsert Respondent Person` stamps `FormResponse.RespondentPersonID`, and anything later that
 * reads it — a follow-up task assigned to the respondent, say — would see a different value if the
 * order changed. Reproducing the old order is the cheapest way to be sure nothing quietly differs.
 */
export const LEGACY_ON_SUBMIT_ACTION_NAMES = [
  'Forms: Upsert Respondent Person',
  'Forms: Send Confirmation Email',
  'Forms: Create Followup Task',
  'Forms: Analyze Written Responses',
] as const;

/** The four legacy hook names, as a type. */
export type LegacyOnSubmitActionName = (typeof LEGACY_ON_SUBMIT_ACTION_NAMES)[number];

/** One legacy hook, as an automation would express it. */
export interface LegacyAutomationDefinition {
  /** The MJ Action name. Resolved to an ActionID when the automation row is written. */
  actionName: LegacyOnSubmitActionName;
  /** Run order, matching the order the legacy list fired them in. */
  displayOrder: number;
}

/**
 * The same list as automation definitions.
 *
 * Derived from the names by position rather than restated, so the run order cannot drift from the
 * firing order — there is no second place to edit and therefore no second place to get wrong.
 */
export const LEGACY_ON_SUBMIT_AUTOMATIONS: readonly LegacyAutomationDefinition[] =
  LEGACY_ON_SUBMIT_ACTION_NAMES.map((actionName, index) => ({ actionName, displayOrder: index + 1 }));
