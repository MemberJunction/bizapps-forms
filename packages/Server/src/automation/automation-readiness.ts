/**
 * Boot-time readiness of the on-submit automation principal: does it hold the entity grants the
 * automations Forms ships actually need?
 *
 * WHY THIS EXISTS (#239). A missing `Forms Automation Runner` grant has shipped six times — three
 * under #60, AI Prompt Runs, the Task / Activity grants of #239, and #269 (the indirect writes:
 * task status, geocoding) — and every time the ONLY symptom was a best-effort, per-submit log line:
 * the response saves, the hook fails quietly, and nobody connects "No TaskType available" on a
 * Tuesday to a permission an install never applied.
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
 *
 * {@link describeDurableDispatch} answers a related but separate question (#269): not "does the
 * principal hold its floor of grants", but "what happens to a durable entity action fired by one of
 * its writes". Forms deliberately withholds the core task-graph grants (`MJ: Task Types` /
 * `MJ: Tasks` / `MJ: Task Dependencies`) that would let the principal submit one, so this is a
 * boot-time WARNING, not a readiness failure — running those actions in-process is the correct,
 * intended behaviour for this principal, not a gap in its grants.
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
  {
    entityName: 'MJ: Record Geo Codes',
    read: true, create: true, update: true,
    reason:
      "Common.LogActivity (fired when Upsert Respondent Person creates a Person) saves an Activity, whose writable Location " +
      "field makes MJ's geocode sync find, create, then re-save that Activity's RecordGeoCode row as this principal",
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
  {
    entityName: 'MJ_BizApps_Tasks: Task Type Status',
    read: true, create: false, update: false,
    reason:
      "bizapps-tasks' task server resolves the new followup task's default status (Create Followup Task); a failed read " +
      'saves the task with no status and says so only in a log line',
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

const CORE_TASK_TYPES = 'MJ: Task Types';
const CORE_TASKS = 'MJ: Tasks';
const CORE_TASK_DEPENDENCIES = 'MJ: Task Dependencies';

/**
 * Core's task-graph entities: the three a task graph (MJ's durable queue) CAN write — a
 * `Task Type`, its `Tasks`, and their `Task Dependencies`. Deliberately the CORE-schema entities
 * (`MJ: …`), not `MJ_BizApps_Tasks: Task Types` / `MJ_BizApps_Tasks: Tasks`, which are a different,
 * sibling-app pair the runner IS granted (see `AUTOMATION_RUNNER_GRANTS` above) and which do not
 * enqueue anything durable.
 *
 * All three are named in the "remove Create on …" advice, because a host that hand-added #269's
 * requested grants added all three. They are NOT all needed to submit an entity action's durable
 * dispatch; see {@link describeDurableDispatch} for the real floor.
 */
export const TASK_GRAPH_ENTITIES: readonly string[] = [CORE_TASK_TYPES, CORE_TASKS, CORE_TASK_DEPENDENCIES];

/** `['a', 'b', 'c']` as `a, b and c`. The advice is built from the list so the two cannot drift. */
function joinAsProse(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * The one boot line describing how durable entity actions behave for this principal
 * (MemberJunction/bizapps-forms#269). Always returns a message; which one depends on whether the
 * principal can submit task graphs.
 *
 * `canSubmit` is the floor of what an entity action's durable dispatch actually writes on MJ 6.1.4,
 * which is LESS than all three task-graph entities:
 * - `DurableEntityActionTaskSubmitter.Submit` (`MJServer/src/services/DurableEntityActionTaskSubmitter.ts:41-47`)
 *   submits a ONE-node graph with `dependsOn: []`, so `TaskGraphService.persistDependencies`
 *   (`TaskGraph/src/TaskGraphService.ts:1581-1594`) writes no `MJ: Task Dependencies` row;
 * - `TaskGraphService.ensureTaskType` (`TaskGraph/src/TaskGraphService.ts:1346-1360`) FINDS the
 *   existing `AI Workflow` task type, and creates one only when none exists yet.
 * So Create on `MJ: Tasks` plus Read OR Create on `MJ: Task Types` is enough. Requiring Create on
 * all three would say "cannot" to a host that granted exactly that floor, whose queued tasks then
 * run as the system user — a false all-clear on the one case this warning exists to catch. An
 * entity absent from this host's metadata (pre-6.1 core has no `MJ: Task Types`) means it cannot
 * submit either: there is nothing to read or write a row in.
 *
 * WHY THIS IS A WARNING, NOT A READINESS FAILURE. `assessAutomationReadiness` above reports a gap
 * against the floor Forms' own hooks need; this reports the CONSEQUENCE of a decision Forms made on
 * purpose (see the file header and #269's decision log): withholding the task-graph grants so that
 * queued tasks — which MJ's dispatcher runs as the SYSTEM user
 * (`UserCache.GetSystemUser()`, `MJServer/src/index.ts`) — can never be minted by an
 * anonymous-submission-driven principal. Running in-process is therefore the correct, intended
 * behaviour, not a gap to close; the "can" branch below exists because a host may have hand-added
 * the grants anyway, and that host needs to be told what it bought.
 *
 * WHY THE "CANNOT" LINE LISTS CORE'S LOG LINES. A live smoke showed that each submit creating a
 * Person logs four lines, and naming only one as expected sent operators chasing the other three.
 * Where a durable submitter is registered, core attempts the submit, is refused, logs
 * `[TaskGraphService] Submit failed`, and falls back inline. WHICH refusal depends on the grants, so
 * the line names the family rather than one member: with no grants it is a refused read on
 * `MJ: Task Types` (twice); with Read there but no `AI Workflow` row it is a refused Create on
 * `MJ: Task Types`; with the row present it is a refused Create on `MJ: Tasks` (all measured or
 * traced on MJ 6.1.4, `TaskGraphService.ensureTaskType`). Where none is
 * (`MJ_DISABLE_TASK_GRAPH_DISPATCHER=1`, or a core without one), MJ takes its deferred-local path:
 * the action runs in-process after the save commits, and none of those lines appear.
 */
export function describeDurableDispatch(principalName: string, lookup: PermissionLookup): string {
  const taskTypes = lookup(CORE_TASK_TYPES);
  const canSubmit =
    lookup(CORE_TASKS)?.CanCreate === true && (taskTypes?.CanRead === true || taskTypes?.CanCreate === true);
  if (canSubmit) {
    return (
      `automation principal '${principalName}' can submit MJ task graphs, and MJ's dispatcher executes ` +
      `queued tasks as the system user. Forms does not grant this: remove Create on ` +
      `${joinAsProse(TASK_GRAPH_ENTITIES)} from the roles '${principalName}' holds ` +
      `(MemberJunction/bizapps-forms#269). On MJ 6.1.4 durable dispatch also drops every action ` +
      `parameter (MemberJunction/MJ#4794), so Common.LogActivity fails instead of logging the activity.`
    );
  }
  return (
    `automation principal '${principalName}' cannot submit MJ task graphs, so durable entity actions ` +
    `fired by its writes run in-process instead of on MJ's task queue — inside the submission, or after ` +
    `its save commits when this host has no durable submitter — for example bizapps-common's ` +
    `Common.LogActivity when Upsert Respondent Person creates a Person. This is deliberate (queued ` +
    `tasks execute as the system user). Where a durable submitter is registered, core logs on each such ` +
    `submit a refused read or create on ${CORE_TASK_TYPES} or ${CORE_TASKS}, a "[TaskGraphService] Submit failed" line and "asked ` +
    `for durable dispatch but ran inline instead"; all of these are expected. In-process runs share ` +
    `this process's database provider; see MemberJunction/bizapps-common#195.`
  );
}
