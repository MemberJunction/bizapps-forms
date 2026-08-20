/**
 * The wire shape of a streamed form build's progress, and the filter that recognises one.
 *
 * IN THE CONTRACT PACKAGE because both ends need it and neither may fork it: `forms-actions`
 * publishes these onto MJ's `statusUpdates` channel, `forms-ng` subscribes and reads them. The
 * alternative — forms-ng depending on forms-actions — would drag the whole Actions package and its
 * `@memberjunction/actions` peers into a browser bundle whose entire point is being small.
 *
 * ── THE CHANNEL IS COSMETIC. This is the load-bearing property, not a caveat. ────────────────
 * The awaited action result plus one final reload is the source of truth for what was built. A
 * dropped websocket, a missed event, a subscription that connected late, a proxy that strips
 * upgrades — none of it may change the outcome. Worst case the author sees a plain spinner and
 * then the finished form. Everything here is shaped so that is the only failure mode: an event
 * carries no state the client cannot re-derive from the database, so ignoring one costs a frame of
 * animation and nothing else.
 */

/**
 * Fixed discriminators the client filters on.
 *
 * Two of them, because `statusUpdates` is a SHARED channel: every resolver on the server publishes
 * onto the same topic for the same session, so a subscriber filtering on one field would act on
 * another feature's messages. This pair is the convention MJ's own clients follow.
 */
export const FORMS_PROGRESS_RESOLVER = 'FormsGenerate';
export const FORMS_PROGRESS_TYPE = 'GenerateFormProgress';

/** Which part of the build an event reports. */
export type GenerateFormStage = 'outline' | 'page' | 'image' | 'theme' | 'complete';

/**
 * Ids a step touched, so a client can reload narrowly instead of reloading everything.
 *
 * Advisory: a client that ignores this and reloads the whole tree is CORRECT, just chattier. That
 * is deliberate — anything a client would break by ignoring does not belong on a cosmetic channel.
 */
export interface GenerateFormChangedIds {
  pageId?: string;
  questionId?: string;
  optionId?: string;
  screenId?: string;
  styleId?: string;
}

/** One progress message. Serialized as JSON into the push's `message` field. */
export interface GenerateFormProgressEvent {
  resolver: typeof FORMS_PROGRESS_RESOLVER;
  type: typeof FORMS_PROGRESS_TYPE;
  /** The form being built. Present from the outline event onward — that is when the row exists. */
  formId: string;
  stage: GenerateFormStage;
  /** Completed units of work, 1-based. */
  step: number;
  /** Total units: 1 outline + N pages (+ images and theme once those stages exist). */
  total: number;
  /** Short, human, present-tense: "Filled in Travel", "Painting the theme". Shown verbatim. */
  label: string;
  changed?: GenerateFormChangedIds;
  /**
   * Terminal only. What the run could not do, NAMED rather than counted.
   *
   * Entries read like `page:2`. Named because a silent cap or a quietly skipped stage reads to an
   * author as "the AI decided not to", which is a different and much worse message than "this part
   * failed".
   */
  degraded?: string[];
}

/**
 * Whether a parsed push message is one of ours.
 *
 * Takes `unknown` because it is applied to `JSON.parse` output — the one place in this pipeline
 * where the input genuinely has no type yet. Every field the client reads is checked here, so a
 * malformed message is rejected at the boundary rather than producing `NaN%` in a progress bar.
 */
export function isGenerateFormProgressEvent(value: unknown): value is GenerateFormProgressEvent {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<GenerateFormProgressEvent>;
  return (
    candidate.resolver === FORMS_PROGRESS_RESOLVER &&
    candidate.type === FORMS_PROGRESS_TYPE &&
    typeof candidate.formId === 'string' &&
    typeof candidate.stage === 'string' &&
    Number.isFinite(candidate.step) &&
    Number.isFinite(candidate.total) &&
    (candidate.total as number) > 0 &&
    typeof candidate.label === 'string'
  );
}

/**
 * Parse one raw push message into an event, or `undefined` if it is not one of ours.
 *
 * Non-JSON is not an error condition here: the channel carries other resolvers' plain-string
 * status messages, so `JSON.parse` failing is the NORMAL way a foreign message is rejected. Both
 * ends share this function so the filter cannot drift.
 */
export function parseGenerationProgress(message: string): GenerateFormProgressEvent | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(message);
  } catch {
    return undefined;
  }
  return isGenerateFormProgressEvent(parsed) ? parsed : undefined;
}

/**
 * What the builder shows while a form is being generated.
 *
 * Derived from the events rather than stored alongside them, so there is one place that decides
 * what "80% done" means and it is unit-testable without a component.
 */
export interface GenerationProgress {
  formId: string;
  /** 0-100, clamped. */
  percent: number;
  label: string;
  stage: GenerateFormStage;
  /** True once the build has reported `complete`. */
  finished: boolean;
  degraded: readonly string[];
}

/**
 * Fold one event into the displayed progress.
 *
 * OUT-OF-ORDER EVENTS ARE EXPECTED, not an error. Page details run concurrently, so page 3 can
 * finish before page 2, and a websocket makes no ordering promise anyway. The percentage therefore
 * only ever moves FORWARD — a bar that jumps backwards reads as a bug to the person watching it,
 * and the underlying step counter is a count of completed work rather than a position, so the
 * higher number is always the truer one.
 *
 * `complete` is the exception and overrides everything: it is terminal, it carries the degraded
 * list, and it is the only event that may pin the bar at 100.
 */
export function foldProgress(
  current: GenerationProgress | undefined,
  event: GenerateFormProgressEvent,
): GenerationProgress {
  const percent = Math.max(0, Math.min(100, Math.round((event.step / event.total) * 100)));
  if (event.stage === 'complete') {
    return {
      formId: event.formId,
      percent: 100,
      label: event.label,
      stage: 'complete',
      finished: true,
      degraded: event.degraded ?? [],
    };
  }
  if (current?.finished) {
    // A straggler arriving after completion cannot un-finish the build.
    return current;
  }
  if (current && percent < current.percent) {
    // Keep the further-along percentage, but still take the newer label: it names work that
    // genuinely just happened, and a stale label under a correct bar is the more confusing pair.
    return { ...current, label: event.label, stage: event.stage };
  }
  return {
    formId: event.formId,
    percent,
    label: event.label,
    stage: event.stage,
    finished: false,
    degraded: current?.degraded ?? [],
  };
}
