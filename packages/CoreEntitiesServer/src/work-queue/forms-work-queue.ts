/**
 * Configuring MJ's work-queue engine for Forms (spec #303 §5).
 *
 * The submit path publishes `forms.response-submitted` through `WorkQueueEngine.Instance.PublishAs`,
 * which needs `WorkQueueEngine.Instance.Config(...)` to have run. MJServer configures it only when
 * the host itself runs work-queue subscriptions (`workQueue.enabled`), and a host that only accepts
 * submissions must still publish them — so Forms configures it too. It cannot do so from
 * `LoadBizAppsFormsServer()`: the host calls that while loading packages, before it has a database
 * connection or a user. {@link FormsWorkQueueStartup} runs once the provider is up, and the submit
 * path calls {@link configureFormsWorkQueue} itself before publishing (the engine's load is
 * idempotent, and a concurrent caller waits for the load in flight).
 *
 * A host where it cannot work logs why and keeps booting: everything else in Forms works, and the
 * operator needs the reason. Publishing will then refuse, which the submit path reports.
 */
import {
  LogError,
  LogStatus,
  RegisterForStartup,
  type DatabaseProviderBase,
  type IMetadataProvider,
  type IStartupSink,
  type UserInfo,
} from '@memberjunction/core';
import { BaseSingleton } from '@memberjunction/global';
import { WorkQueueEngine, WorkQueueHost } from '@memberjunction/work-queue-engine';
import { RESPONSE_SUBMITTED_TOPIC, RUN_AUTOMATIONS_SUBSCRIPTION } from './response-submitted.js';

/**
 * Configure the work-queue engine as `contextUser` (on `provider` when given), and check the Forms
 * topic and subscription are on this host. True when the submit path can publish and a host can
 * consume; false — having logged what to do about it — otherwise. Never throws.
 *
 * `provider` is OPTIONAL, and the submit path deliberately passes none. `WorkQueueEngine.Config`
 * REBINDS the engine to whatever provider it is handed (unlike `BaseEngine`'s first-wins binding),
 * and the engine keeps that provider to mint independent executors from later — so handing it one
 * request's provider would leave a process-wide singleton holding a per-request instance. The
 * startup sink passes the server's own provider; the submit path only needs the load to have
 * happened, and publishes through its transaction's provider explicitly (`PublishAs`'s `Provider`).
 */
export async function configureFormsWorkQueue(contextUser: UserInfo, provider?: IMetadataProvider): Promise<boolean> {
  try {
    await WorkQueueEngine.Instance.Config(false, contextUser, provider);
  } catch (err) {
    logNotReady(
      `[Forms] The work queue could not be configured, so submissions cannot queue their automations: ` +
        `${err instanceof Error ? err.message : String(err)}. Forms needs MJ 6.2's work-queue tables (run the core migration).`,
    );
    return false;
  }
  const missing = [
    WorkQueueEngine.Instance.GetTopicByName(RESPONSE_SUBMITTED_TOPIC) ? null : `topic "${RESPONSE_SUBMITTED_TOPIC}"`,
    WorkQueueEngine.Instance.GetSubscriptionByName(RUN_AUTOMATIONS_SUBSCRIPTION) ? null : `subscription "${RUN_AUTOMATIONS_SUBSCRIPTION}"`,
  ].filter((what): what is string => what !== null);
  if (missing.length > 0) {
    logNotReady(
      `[Forms] The work-queue ${missing.join(' and ')} ${missing.length === 1 ? 'is' : 'are'} not on this host, so on-submit ` +
        "automations cannot be queued or run. Push Forms' metadata (metadata/work-queue-topics, metadata/work-queue-subscriptions).",
    );
    return false;
  }
  LogStatus(
    `[Forms] Work queue ready: submissions publish to "${RESPONSE_SUBMITTED_TOPIC}". Automations run where a host enables ` +
      `workQueue with subscription "${RUN_AUTOMATIONS_SUBSCRIPTION}" (mj.config.cjs); until one does, they wait in the queue.`,
  );
  return true;
}

/**
 * The least time between two logs of the SAME not-ready reason, in milliseconds.
 *
 * A host that is not ready is asked again on every respondent page view (`GetRespondentForm` refuses
 * a form that owes automations while the queue cannot take them), so an unthrottled error was one
 * line per view on a misconfigured host — the reason buried under itself (final review M7). Once a
 * minute still reaches the operator promptly after a deploy, and the startup sink said it at boot.
 */
export const NOT_READY_LOG_INTERVAL_MS = 60_000;

/** When each not-ready reason was last logged, keyed by its exact text. Process-local, like the check itself. */
const notReadyLoggedAt = new Map<string, number>();

/**
 * How many distinct reasons the throttle remembers. A driver error can embed per-call detail, so the
 * key set is not provably small; past the cap the map is cleared, which costs one repeated line each.
 */
const MAX_REMEMBERED_REASONS = 50;

/** Log `message` unless the same message was logged less than {@link NOT_READY_LOG_INTERVAL_MS} ago. */
function logNotReady(message: string): void {
  const now = Date.now();
  const last = notReadyLoggedAt.get(message);
  if (last !== undefined && now - last < NOT_READY_LOG_INTERVAL_MS) {
    return;
  }
  if (notReadyLoggedAt.size >= MAX_REMEMBERED_REASONS) {
    notReadyLoggedAt.clear();
  }
  notReadyLoggedAt.set(message, now);
  LogError(message);
}

/** Forget every throttled reason, so one spec's log cannot hide the next spec's. */
export function resetNotReadyLogForTests(): void {
  notReadyLoggedAt.clear();
}

/** How many times {@link watchRunAutomationsHost} looks for this process's work-queue host before saying none started. */
export const RUN_AUTOMATIONS_HOST_POLLS = 60;

/** How long between looks — so the watch gives a slow-starting host about a minute. */
const RUN_AUTOMATIONS_HOST_POLL_MS = 1_000;

/** The slice of MJ's `WorkQueueHost` the watch reads. */
export interface WorkQueueHostProbe {
  readonly IsStarted: boolean;
  GetHealth(): { Subscriptions: { Name: string; State: string; Reason: string | null }[] };
}

/** What the watch concluded about this host and the `forms.run-automations` subscription. */
export type RunAutomationsHostVerdict = 'running' | 'not-running' | 'not-enabled';

/** The `mj.config.cjs` this host needs to run Forms' automations — said in every error below. */
const HOW_TO_RUN = `workQueue.enabled: true, workQueue.systemUserEmail and workQueue.subscriptions: [{ name: '${RUN_AUTOMATIONS_SUBSCRIPTION}', concurrency: 2 }] in mj.config.cjs`;

/**
 * Say LOUDLY — one error, naming what to configure — when this host publishes submissions but runs no
 * `forms.run-automations` consumer (controller ruling, #303 Task 8 fix round 1). Nothing else on such
 * a host notices: submits commit, and their automations wait in the queue for a host that never comes.
 *
 * MJ starts its work-queue host AFTER the startup sinks run, so this looks for it up to
 * {@link RUN_AUTOMATIONS_HOST_POLLS} times. Read-only (the sink logs anything it throws). Another instance of the API may
 * be the one running the subscription — the error says "on this host" for that reason.
 */
export async function watchRunAutomationsHost(
  options: { probe?: () => WorkQueueHostProbe | null; wait?: (ms: number) => Promise<void> } = {},
): Promise<RunAutomationsHostVerdict> {
  const probe = options.probe ?? (() => WorkQueueHost.Active);
  const wait = options.wait ?? pause;
  let lastStarted: WorkQueueHostProbe | null = null;
  for (let attempt = 1; attempt <= RUN_AUTOMATIONS_HOST_POLLS; attempt++) {
    const host = probe();
    // Judged only once the host has LOADED its subscription states. MJ's `WorkQueueHost.Start()` marks
    // the host started (and Active) before its first reconcile plans them, so a started host with no
    // states yet is "not loaded", never "not configured" (re-review N1).
    if (host?.IsStarted) {
      if (host.GetHealth().Subscriptions.length > 0) {
        return judgeHost(host);
      }
      lastStarted = host;
    }
    if (attempt < RUN_AUTOMATIONS_HOST_POLLS) {
      await wait(RUN_AUTOMATIONS_HOST_POLL_MS);
    }
  }
  if (lastStarted) {
    // Started, and still no subscription planned after the whole cap: it runs nothing.
    return judgeHost(lastStarted);
  }
  LogError(
    `[Forms] On-submit automations will not run on this host: no work-queue host started here (workQueue is not enabled). ` +
      `Set ${HOW_TO_RUN}. Until some host runs '${RUN_AUTOMATIONS_SUBSCRIPTION}', submissions' automations wait in the queue.`,
  );
  return 'not-enabled';
}

/** The verdict on a started host, logged: one status line when it runs Forms' subscription, one error when not. */
function judgeHost(host: WorkQueueHostProbe): RunAutomationsHostVerdict {
  const subscription = host.GetHealth().Subscriptions.find((s) => s.Name === RUN_AUTOMATIONS_SUBSCRIPTION);
  if (subscription?.State === 'Running') {
    LogStatus(`[Forms] This host runs '${RUN_AUTOMATIONS_SUBSCRIPTION}': submitted responses' automations run here.`);
    return 'running';
  }
  const why = subscription
    ? `its subscription '${RUN_AUTOMATIONS_SUBSCRIPTION}' is ${subscription.State}${subscription.Reason ? ` (${subscription.Reason})` : ''}`
    : `workQueue.subscriptions does not include '${RUN_AUTOMATIONS_SUBSCRIPTION}'`;
  LogError(
    `[Forms] On-submit automations will not run on this host: the work-queue host is running but ${why}. ` +
      `Set ${HOW_TO_RUN}. Until some host runs it, submissions' automations wait in the queue.`,
  );
  return 'not-running';
}

/** An unref'd pause, so a host shutting down is never held open by the watch. */
function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms).unref());
}

/**
 * The startup sink: MJ's `StartupManager` calls it with the server's system user and provider once
 * the database is connected. Deferred, so a slow work-queue load never delays the host's readiness.
 */
@RegisterForStartup({ deferred: true, severity: 'error', description: 'MJ Forms: configure the work queue its submissions publish to' })
export class FormsWorkQueueStartup extends BaseSingleton<FormsWorkQueueStartup> implements IStartupSink {
  public static get Instance(): FormsWorkQueueStartup {
    return super.getInstance<FormsWorkQueueStartup>();
  }

  public async HandleStartup(contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
    if (!contextUser || !isDatabaseProvider(provider)) {
      LogStatus('[Forms] Work queue not configured: startup handed no database provider (not a server host).');
      return;
    }
    if (await configureFormsWorkQueue(contextUser, provider)) {
      // Not awaited: the watch waits for MJ's work-queue host, which starts after the sinks do.
      void watchRunAutomationsHost().catch((err: unknown) =>
        LogError(`[Forms] Could not check whether this host runs '${RUN_AUTOMATIONS_SUBSCRIPTION}': ${err instanceof Error ? err.message : String(err)}`),
      );
    }
  }
}

/** Structural, as `requireDatabaseProvider` is: a workspace can hold two copies of the class. */
function isDatabaseProvider(provider: IMetadataProvider | undefined): provider is IMetadataProvider {
  return typeof (provider as Partial<DatabaseProviderBase> | undefined)?.ExecuteSQL === 'function';
}

/** Anti-tree-shake anchor: `LoadBizAppsFormsServer()` calls it so `@RegisterForStartup` above is kept. */
export function LoadFormsWorkQueue(): void {
  // intentionally empty
}
