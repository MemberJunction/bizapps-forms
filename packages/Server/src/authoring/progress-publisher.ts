/**
 * The concrete progress publisher: form-build events onto MJ's `statusUpdates` subscription.
 *
 * WHY IT LIVES HERE AND NOT IN forms-actions. `packages/Actions` has no dependency on
 * `@memberjunction/server` and must not grow one — it is loaded in contexts that have no server at
 * all. So the Actions package declares the seam and this package fills it, the same arrangement as
 * the magic-link minter next door.
 *
 * WHY IT GOES THROUGH `publishStatusUpdate` RATHER THAN `pubSub.publish`. Delivery on MJ 6.x
 * requires the push's `ownerUserId` to equal the subscribing connection's server-authenticated
 * user, and the filter FAILS CLOSED (MJ PR #3244). MJ's helper takes identity as a required
 * parameter, so routing through it means a publish that would silently deliver nothing cannot be
 * written here — the compiler stops it. Calling `pubSub.publish` directly is what this file exists
 * to avoid.
 */
import { LogError, LogStatus } from '@memberjunction/core';
import { PubSubManager, publishStatusUpdate } from '@memberjunction/server';
// The seam comes from forms-actions (which owns publishing) and the event SHAPE from
// forms-entities (which owns the contract both ends share). Two imports rather than one
// re-export, per the repo's no-cross-package-re-export rule.
import { setFormsProgressPublisher, type FormsProgressPublisher } from '@mj-biz-apps/forms-actions';
import type { GenerateFormProgressEvent } from '@mj-biz-apps/forms-entities';

/** Publishes a form build's progress to the author's subscribed browser tab. */
export class StatusUpdateProgressPublisher implements FormsProgressPublisher {
  publish(sessionId: string, ownerUserId: string, event: GenerateFormProgressEvent): void {
    const pubSub = PubSubManager.Instance.PubSubEngine;
    if (!pubSub) {
      // Before `buildSchemaSync` has run there is no engine. Not an error: it means the server is
      // still starting, no client can be subscribed yet, and the build's outcome does not depend
      // on this channel. Logged rather than thrown so a race at boot never costs anybody a form.
      LogStatus(
        `[Forms authoring] No PubSub engine yet; dropping ${event.stage} progress for form ${event.formId}.`,
      );
      return;
    }
    publishStatusUpdate(pubSub, { sessionId, ownerUserId, message: JSON.stringify(event) });
  }
}

/**
 * Install the publisher.
 *
 * Called at MODULE LOAD as well as from the startup export, matching the magic-link minter's note
 * one directory over: MJAPI wires this package by importing `RESOLVER_PATHS`, which evaluates the
 * module but does not necessarily call `LoadBizAppsFormsServer()`. A registration stranded in that
 * function never runs, and the symptom — a build that works perfectly but publishes nothing — reads
 * exactly like a websocket problem. Idempotent: re-registering replaces.
 */
export function installFormsProgressPublisher(): void {
  try {
    setFormsProgressPublisher(new StatusUpdateProgressPublisher());
  } catch (error) {
    // Never let a wiring failure stop the server from starting. Generation still works; it just
    // will not stream, which the client is built to survive.
    LogError(
      `[Forms authoring] Could not install the progress publisher; generated forms will build ` +
        `without live progress. ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
