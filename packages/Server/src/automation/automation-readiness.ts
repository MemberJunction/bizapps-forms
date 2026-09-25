/**
 * Boot-time readiness of the on-submit automation principal: does it hold the entity grants the
 * automations Forms ships actually need?
 *
 * WHY THIS EXISTS (#239). A missing `Forms Automation Runner` grant has shipped five times — three
 * under #60, AI Prompt Runs, and the Task / Activity grants of #239 — and every time the ONLY
 * symptom was a best-effort, per-submit log line: the response saves, the hook fails quietly, and
 * nobody connects "No TaskType available" on a Tuesday to a permission an install never applied.
 * `host-readiness.ts` solved the same shape for the respondent path by asking at boot; this does
 * the same for the automation path, so a missing grant is named at every start, where an operator
 * can act on it.
 *
 * Pure: the caller supplies the permission lookup (core's own `EntityInfo.GetUserPermisions`, the
 * computation MJ's permission checks use), so the verdict cannot disagree with the check that
 * would refuse the write, and this stays testable without a database.
 *
 * {@link AUTOMATION_RUNNER_GRANTS} restates, in TypeScript, the runner records in
 * `metadata/entity-permissions/.entity-permissions.json`. That duplication is deliberate — the
 * report has to know what to ask for at runtime, and the metadata is not shipped with the package —
 * and it is pinned: `automation-readiness.spec.ts` fails if the two differ in either direction.
 */

/** One entity grant the automation principal needs. Delete is never a need, so it is not modelled. */
export interface RunnerGrant {
  entityName: string;
  read: boolean;
  create: boolean;
  update: boolean;
  /** Which shipped action or engine needs it — printed in the boot report. */
  reason: string;
}

/** The principal's effective permissions on one entity — the subset of core's `EntityUserPermissionInfo` read here. */
export interface EffectivePermissions {
  CanRead: boolean;
  CanCreate: boolean;
  CanUpdate: boolean;
}

/**
 * Effective permissions of the principal on `entityName`, or `undefined` when the entity is not in
 * this host's metadata.
 */
export type PermissionLookup = (entityName: string) => EffectivePermissions | undefined;

/**
 * Every grant `Forms Automation Runner` ships with — the floor the built-in on-submit hooks and the
 * MJ engines they drive need. Must equal the runner records in `metadata/` (pinned by the spec).
 */
export const AUTOMATION_RUNNER_GRANTS: readonly RunnerGrant[] = [
  // Forms-owned: the automation runtime itself.
  {
    entityName: 'MJ_BizApps_Forms: Forms',
    read: true, create: false, update: false,
    reason: 'the automation runtime loads the form to dispatch against its published snapshot',
  },
  {
    entityName: 'MJ_BizApps_Forms: Form Questions',
    read: true, create: false, update: false,
    reason: "the response context resolves each answer's question type and prompt",
  },
  {
    entityName: 'MJ_BizApps_Forms: Form Responses',
    read: true, create: false, update: true,
    reason: 'every on-submit action reads the response; Upsert Respondent Person stamps RespondentPersonID',
  },
  {
    entityName: 'MJ_BizApps_Forms: Form Response Answers',
    read: true, create: false, update: true,
    reason: 'the response context reads answers; Analyze Written Responses writes its scores back',
  },
  {
    entityName: 'MJ_BizApps_Forms: Form Automations',
    read: true, create: false, update: false,
    reason: 'the dispatcher reads the configured automations',
  },
  {
    entityName: 'MJ_BizApps_Forms: Form Automation Runs',
    read: true, create: true, update: true,
    reason: 'the automation run ledger (claim, then record the outcome)',
  },
  {
    entityName: 'MJ_BizApps_Forms: Form Entity Bindings',
    read: true, create: false, update: false,
    reason: 'entity binding reads its configuration',
  },
  {
    entityName: 'MJ_BizApps_Forms: Form Entity Binding Records',
    read: true, create: true, update: true,
    reason: 'the entity binding ledger',
  },
  {
    entityName: 'MJ_BizApps_Forms: Form Uploads',
    read: true, create: false, update: false,
    reason: "entity binding attaches the response's uploads to the bound record",
  },
  // Core MJ engines every action run goes through.
  {
    entityName: 'MJ: Action Execution Logs',
    read: true, create: true, update: true,
    reason: "MJ's action engine logs every execution (FormAutomationRun.ActionExecutionLogID points here)",
  },
  {
    entityName: 'MJ: AI Prompt Runs',
    read: true, create: true, update: true,
    reason: "MJ's prompt engine records each AI call (Analyze Written Responses)",
  },
  {
    entityName: 'MJ: File Entity Record Links',
    read: true, create: true, update: false,
    reason: 'entity binding attaches uploaded files to the bound record',
  },
  {
    entityName: 'MJ: Actions',
    read: true, create: false, update: false,
    reason: "MJ resolves bizapps-common's People AfterCreate action Common.LogActivity by name (Upsert Respondent Person)",
  },
  // Sibling apps: the built-in hooks' targets.
  {
    entityName: 'MJ_BizApps_Common: People',
    read: true, create: true, update: true,
    reason: 'Upsert Respondent Person matches or creates the respondent; entity binding merges into People',
  },
  {
    entityName: 'MJ_BizApps_Common: Activity Types',
    read: true, create: false, update: false,
    reason: 'Common.LogActivity (fired by creating a Person) resolves its activity type',
  },
  {
    entityName: 'MJ_BizApps_Common: Activities',
    read: true, create: true, update: false,
    reason: 'Common.LogActivity writes the activity, deduping by a read first',
  },
  {
    entityName: 'MJ_BizApps_Common: Activity Links',
    read: false, create: true, update: false,
    reason: 'Common.LogActivity links the activity to the Person',
  },
  {
    entityName: 'MJ_BizApps_Tasks: Task Types',
    read: true, create: false, update: false,
    reason: 'Create Followup Task resolves the required task type',
  },
  {
    entityName: 'MJ_BizApps_Tasks: Tasks',
    read: false, create: true, update: false,
    reason: 'Create Followup Task writes the task',
  },
  {
    entityName: 'MJ_BizApps_Tasks: Task Links',
    read: false, create: true, update: false,
    reason: 'Create Followup Task links the task to the response',
  },
];

/**
 * Every reason the automation principal is not ready — empty when it is. One reason per
 * under-granted entity, naming the entity, each missing verb, the principal and why it is needed.
 *
 * An entity absent from this host's metadata (`lookup` returns `undefined`) is skipped: a grant on
 * an entity the host does not have cannot be needed, and the action that would use it already
 * fails loudly on the missing entity. That is also what makes the report pick the grant up later —
 * the day a sibling app is installed or upgraded, the entity appears and an unapplied grant is named.
 *
 * Takes a principal NAME, not a nullable principal: when the principal cannot be resolved,
 * `resolveAutomationPrincipal` has already logged that automations are disabled, and the caller
 * skips this check rather than reporting the same fact twice.
 */
export function assessAutomationReadiness(
  principalName: string,
  lookup: PermissionLookup,
  grants: readonly RunnerGrant[] = AUTOMATION_RUNNER_GRANTS,
): string[] {
  const reasons: string[] = [];
  for (const grant of grants) {
    const held = lookup(grant.entityName);
    if (held === undefined) continue;
    const missing = [
      grant.read && !held.CanRead ? 'Read' : undefined,
      grant.create && !held.CanCreate ? 'Create' : undefined,
      grant.update && !held.CanUpdate ? 'Update' : undefined,
    ].filter((verb): verb is string => verb !== undefined);
    if (missing.length === 0) continue;
    reasons.push(
      `automation principal '${principalName}' lacks ${missing.join(', ')} on '${grant.entityName}' ` +
        `(needed because ${grant.reason}). Until it is granted (to the 'Forms Automation Runner' role, which ` +
        `Forms' migrations grant), that automation fails on every submission and says so only in a ` +
        `per-submit log line.`,
    );
  }
  return reasons;
}
