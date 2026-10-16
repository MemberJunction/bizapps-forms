/**
 * The scheduled job type that sweeps the automation outbox (#303): `metadata/scheduled-job-types/`
 * names this class as its `DriverClass`, and `metadata/scheduled-jobs/` runs it every 30 seconds.
 *
 * It is the outbox's durable safety net, not its first responder: the submitting process drains its
 * own events right after commit. A sweep runs what that missed — retries whose backoff has passed,
 * and events a stopped process left Running until their lease expired. A host whose scheduler is
 * off (`scheduledJobs.enabled: false`) still runs first attempts; only those two wait.
 *
 * `Success` is false only when the drain itself throws (the outbox could not be read or written).
 * A step that failed is the event's business, recorded on its row and its run rows, not the sweep's.
 */
import { ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import type { MJScheduledJobEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseScheduledJob, type ScheduledJobExecutionContext } from '@memberjunction/scheduling-engine';
import type { NotificationContent, ScheduledJobResult } from '@memberjunction/scheduling-base-types';
import { drainAutomationOutbox, type DrainReport } from './drain.js';

/** The `DriverClass` the shipped Scheduled Job Type names. */
export const FORMS_AUTOMATION_DRAIN_DRIVER = 'FormsAutomationDrainDriver';

@RegisterClass(BaseScheduledJob, FORMS_AUTOMATION_DRAIN_DRIVER)
export class FormsAutomationDrainDriver extends BaseScheduledJob {
  /** A tight-cron poller by design: each sweep does bounded work (`MAX_CLAIM_ROUNDS`). */
  public override get IsHighFrequencyByDesign(): boolean {
    return true;
  }

  public async Execute(context: ScheduledJobExecutionContext): Promise<ScheduledJobResult> {
    try {
      const report: DrainReport = await drainAutomationOutbox(
        { reason: 'scheduled sweep', heartbeat: async () => context.heartbeat?.() },
        context.ContextUser,
      );
      return { Success: true, Details: { ...report } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logError(`The automation outbox sweep failed: ${message}`, err);
      return { Success: false, ErrorMessage: message };
    }
  }

  /** The sweep takes no configuration: empty or `{}` only, so a typo cannot look like a setting. */
  public ValidateConfiguration(schedule: MJScheduledJobEntity): ValidationResult {
    const result = new ValidationResult();
    const raw = schedule.Configuration?.trim();
    if (raw && raw !== '{}') {
      result.Errors.push(
        new ValidationErrorInfo('Configuration', 'The Forms automation outbox sweep takes no configuration; leave it empty.', raw, ValidationErrorType.Failure),
      );
    }
    result.Success = result.Errors.length === 0;
    return result;
  }

  public FormatNotification(context: ScheduledJobExecutionContext, result: ScheduledJobResult): NotificationContent {
    if (!result.Success) {
      return {
        Subject: `Forms automation sweep failed: ${context.Schedule.Name}`,
        Body: `The Forms automation outbox sweep "${context.Schedule.Name}" failed.\n\nError: ${result.ErrorMessage ?? 'unknown'}`,
        Priority: 'High',
      };
    }
    return {
      Subject: `Forms automation sweep: ${String(result.Details?.['claimed'] ?? 0)} event(s) run`,
      Body: `The Forms automation outbox sweep "${context.Schedule.Name}" completed.`,
      Priority: 'Low',
      Metadata: result.Details,
    };
  }
}

/** Anti-tree-shake anchor: the server bootstrap calls it so `@RegisterClass` above is kept. */
export function LoadFormsAutomationDrainDriver(): void {
  // intentionally empty
}
