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
import { WorkQueueEngine } from '@memberjunction/work-queue-engine';
import { RESPONSE_SUBMITTED_TOPIC, RUN_AUTOMATIONS_SUBSCRIPTION } from './response-submitted.js';

/**
 * Configure the work-queue engine as `contextUser` on `provider`, and check the Forms topic and
 * subscription are on this host. True when the submit path can publish and a host can consume;
 * false — having logged what to do about it — otherwise. Never throws.
 */
export async function configureFormsWorkQueue(contextUser: UserInfo, provider: IMetadataProvider): Promise<boolean> {
  try {
    await WorkQueueEngine.Instance.Config(false, contextUser, provider);
  } catch (err) {
    LogError(
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
    LogError(
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
    await configureFormsWorkQueue(contextUser, provider);
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
