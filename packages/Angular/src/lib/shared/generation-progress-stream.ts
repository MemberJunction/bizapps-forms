import { LogError, LogStatus } from '@memberjunction/core';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import {
  foldProgress,
  parseGenerationProgress,
  type GenerationProgress,
} from '@mj-biz-apps/forms-entities';

/**
 * Watch one session's build progress.
 *
 * ── WHY THIS IS SHARED RATHER THAN WRITTEN TWICE. ────────────────────────────────────────────
 * Two surfaces start a generation — the forms list's own generate path and the authoring chat —
 * and both hand the server the same `SessionID`, so both want the same stream. The second copy is
 * where the divergence starts: one of them stops folding, or forgets to unsubscribe, and the bug
 * only shows up on the surface nobody was looking at.
 *
 * ── A MISSING STREAM IS NOT A FAILURE. ───────────────────────────────────────────────────────
 * Every path here degrades to silence. The websocket can be stripped by a proxy, connect after the
 * outline has already gone out, or drop halfway; in all three cases the awaited action still
 * returns the finished form. What is lost is the animation, which is why nothing here throws.
 */
export interface ProgressSubscription {
  unsubscribe: () => void;
}

/**
 * Subscribe, folding each event into `onProgress`.
 *
 * Returns `undefined` when no stream could be opened — the caller carries on without one. Call
 * `unsubscribe()` on EVERY path, including failure: a subscription left open outlives the panel
 * that started it and keeps a websocket handler pointed at state nobody reads.
 */
export function watchGenerationProgress(
  sessionId: string,
  current: () => GenerationProgress | null,
  onProgress: (progress: GenerationProgress) => void,
): ProgressSubscription | undefined {
  /**
   * The form this watcher has decided its run is about, latched from the first event it sees.
   *
   * `sessionId` is per BROWSER SESSION, not per run: it is read once at provider config time and
   * every surface shares it. So a build started on the forms list and a restyle asked for in
   * another form's chat subscribe to the same Subject, and without this the second surface
   * rendered the first one's stages — "Making a picture… 83%" under a question about colours.
   * `foldProgress` compares nothing, by design; the caller is the only one who knows which run is
   * its own, and the first event to arrive after subscribing is it.
   */
  let ownFormId: string | undefined;
  try {
    return GraphQLDataProvider.Instance.PushStatusUpdates(sessionId).subscribe({
      next: (message: string) => {
        const event = parseGenerationProgress(message);
        if (!event) {
          // Not ours. The channel is shared with every other resolver, so this is the normal case
          // for most messages and deliberately silent.
          return;
        }
        ownFormId ??= event.formId;
        if (event.formId !== ownFormId) {
          // Another surface's build, on the shared channel. Not ours to render.
          return;
        }
        onProgress(foldProgress(current() ?? undefined, event));
      },
      error: (error: unknown) => {
        // Never rethrown into the build: the action is still running and will still return.
        LogError(
          `[Forms] Progress stream for session ${sessionId} failed; the form is still being ` +
            `generated and will appear when it is done. ${asText(error)}`,
        );
      },
    });
  } catch (error) {
    LogStatus(
      `[Forms] Could not open a progress stream (${asText(error)}); generating without live progress.`,
    );
    return undefined;
  }
}

function asText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
