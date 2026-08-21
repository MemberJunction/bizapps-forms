/**
 * The seam a streaming form build's progress travels through.
 *
 * The EVENT SHAPE itself lives in `@mj-biz-apps/forms-entities`
 * (`contracts/generation-progress.ts`), because the browser needs it too and forms-ng cannot
 * depend on this package without dragging `@memberjunction/actions` into a widget bundle. What
 * lives here is the publishing side: the seam, its no-op default, and the guarantee that a
 * publisher failure never reaches the build.
 *
 * ── THE CHANNEL IS COSMETIC. This is the load-bearing property, not a caveat. ────────────────
 * The awaited action result plus one final reload is the source of truth for what was built. A
 * dropped websocket, a missed event, a subscription that connected late, a proxy that strips
 * upgrades — none of it may change the outcome. Worst case the author sees a plain spinner and
 * then the finished form. Everything below is designed so that failure mode is the only one:
 * events carry no state the client cannot re-derive, and publishing never throws into the build.
 *
 * ── WHY THE PAYLOAD IS THIN. ─────────────────────────────────────────────────────────────────
 * An earlier design had each event carry entity-shaped fragments for the client to graft into its
 * local tree. That was rejected: the fragments would have to mirror the entity columns exactly, so
 * every new column becomes a field silently missing from the preview, and the client would be
 * reconstructing a state the database already holds — which is why that design ALSO needed a final
 * reconciling reload. Since the server persists each stage as it completes, the database is
 * already correct at every instant; an event only has to say WHAT CHANGED and WHERE WE ARE, and
 * the client reloads. One targeted reload per thing that actually changed is not polling, and it
 * cannot drift from the schema because there is nothing to keep in step.
 *
 * ── WHY `ownerUserId` IS A REQUIRED PARAMETER. ───────────────────────────────────────────────
 * MJ's `statusUpdates` subscription filters on it and FAILS CLOSED (MJ PR #3244): delivery
 * requires the push's `ownerUserId` to equal the subscribing connection's server-authenticated
 * user. On a 5.51.0 host the field is ignored; on 6.x — which this workspace resolves — omitting
 * it delivers nothing, silently. That asymmetry is the worst possible failure mode, so the type
 * makes the field required and the publisher cannot forget it.
 */
import {
  FORMS_PROGRESS_RESOLVER,
  FORMS_PROGRESS_TYPE,
  type GenerateFormProgressEvent,
} from '@mj-biz-apps/forms-entities';

/**
 * Where a progress event goes.
 *
 * An interface with a no-op default rather than a direct `PubSubManager` call, because
 * `packages/Actions` has no dependency on `@memberjunction/server` and must not grow one — the
 * same seam precedent as `setFormDesignerModel`. `packages/Server` registers the real publisher at
 * load. Unregistered (tests, CLI, any host that never called the server bootstrap) means events go
 * nowhere, which by the cosmetic-channel rule is a supported configuration and not a degradation.
 */
export interface FormsProgressPublisher {
  /**
   * Deliver one event to one session on behalf of one authenticated user.
   *
   * MUST NOT throw. A publisher that throws would take down a build over a websocket, which
   * inverts the entire point of this channel; {@link publishProgress} enforces it anyway, but an
   * implementation should not be relying on that.
   */
  publish(sessionId: string, ownerUserId: string, event: GenerateFormProgressEvent): void;
}

/** The no-op default. Named rather than an inline lambda so a stack trace says what happened. */
const NO_PUBLISHER: FormsProgressPublisher = {
  publish(): void {
    // Nothing is listening. See the file header: this is a supported configuration.
  },
};

let activePublisher: FormsProgressPublisher = NO_PUBLISHER;

/** Install the real publisher. Called by `packages/Server` at load; idempotent. */
export function setFormsProgressPublisher(publisher: FormsProgressPublisher): void {
  activePublisher = publisher;
}

/** Restore the no-op publisher. For tests that installed a stub. */
export function resetFormsProgressPublisher(): void {
  activePublisher = NO_PUBLISHER;
}

/**
 * A build's progress channel, or the absence of one.
 *
 * Bundles the two identities an event needs so the pipeline passes ONE thing around instead of
 * threading `sessionId` and `ownerUserId` through every stage — which is how one of them ends up
 * omitted at a single call site and delivery silently stops on a 6.x host.
 */
export interface ProgressChannel {
  sessionId: string;
  ownerUserId: string;
}

/**
 * Publish one event, swallowing nothing and breaking nothing.
 *
 * "Swallowing nothing" and "never throwing" are compatible here only because of what this is: the
 * error is logged with its full context by the caller's logger, and the failure is genuinely not
 * actionable to the build — there is no version of "the websocket is down" that should discard a
 * form. Every other catch in this pipeline re-throws or degrades explicitly.
 */
export function publishProgress(
  channel: ProgressChannel | undefined,
  event: GenerateFormProgressEvent,
  onError: (message: string) => void,
): void {
  if (!channel) {
    return;
  }
  try {
    activePublisher.publish(channel.sessionId, channel.ownerUserId, event);
  } catch (error) {
    onError(
      `[Forms authoring] Could not publish ${event.stage} progress for form ${event.formId}: ` +
        `${error instanceof Error ? error.message : String(error)}. The build continues; the ` +
        'author will see the finished form without the live progress.',
    );
  }
}

/** Build a well-formed event. The two discriminators are set here so no caller can mistype them. */
export function progressEvent(
  fields: Omit<GenerateFormProgressEvent, 'resolver' | 'type'>,
): GenerateFormProgressEvent {
  return { resolver: FORMS_PROGRESS_RESOLVER, type: FORMS_PROGRESS_TYPE, ...fields };
}
