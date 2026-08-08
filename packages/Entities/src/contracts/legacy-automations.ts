/**
 * The four on-submit actions that ran for every form before automations were configurable.
 *
 * Shared because two places must agree on them exactly: the server still fires this list for any
 * form that configures nothing, and the builder seeds an equivalent automation for each one the
 * first time a form configures anything. If those two lists drift, adding a single binding to a
 * form silently changes what else happens on submit — which is precisely the failure this
 * definition exists to prevent.
 *
 * WHY THE BUILDER SEEDS THEM AT ALL. Dispatch is all-or-nothing: a form whose snapshot carries any
 * automations runs those and nothing else. Without seeding, an author who adds one binding would
 * lose their confirmation email, their follow-up task, their respondent-Person upsert and their
 * answer scoring, with no warning and no error — a regression triggered by using the feature.
 * Seeding makes the cutover explicit and, more importantly, VISIBLE: the four appear in the On
 * Submit tab as ordinary rows the author can reorder or disable.
 */

/** One legacy hook, as an automation would express it. */
export interface LegacyAutomationDefinition {
  /** The MJ Action name. Resolved to an ActionID when the automation row is written. */
  actionName: string;
  /** Run order, matching the order the legacy list fired them in. */
  displayOrder: number;
}

/**
 * The list, in the order the legacy runner fired it.
 *
 * Order is preserved deliberately even though these four do not depend on each other today:
 * `Upsert Respondent Person` stamps `FormResponse.RespondentPersonID`, and anything later that
 * reads it — a follow-up task assigned to the respondent, say — would see a different value if the
 * order changed. Reproducing the old order is the cheapest way to be sure nothing quietly differs.
 */
export const LEGACY_ON_SUBMIT_AUTOMATIONS: readonly LegacyAutomationDefinition[] = [
  { actionName: 'Forms: Upsert Respondent Person', displayOrder: 1 },
  { actionName: 'Forms: Send Confirmation Email', displayOrder: 2 },
  { actionName: 'Forms: Create Followup Task', displayOrder: 3 },
  { actionName: 'Forms: Analyze Written Responses', displayOrder: 4 },
] as const;

/** Just the names, in order — what the legacy runner iterates. */
export const LEGACY_ON_SUBMIT_ACTION_NAMES: readonly string[] = LEGACY_ON_SUBMIT_AUTOMATIONS.map(
  (a) => a.actionName,
);
