/**
 * Staged form generation — the pipeline behind a build the author watches happen.
 *
 * ── WHY STAGES AT ALL ────────────────────────────────────────────────────────────────────────
 * One prompt that returns a whole form is cheaper and simpler, and it is still what an API caller
 * gets. What it cannot do is show anybody anything for thirty seconds. Splitting the work into a
 * fast OUTLINE (which pages, which questions, roughly) followed by per-page DETAIL means the form
 * exists as real rows within a couple of seconds and fills in while the author looks at it.
 *
 * The trade is honest and worth stating: 1 + N model calls instead of 1, so a staged build costs
 * more and its TOTAL time is no better. It buys time-to-first-paint, which only matters when
 * somebody is watching. That is exactly the split the caller expresses by supplying a session to
 * publish progress to — see {@link shouldStage}.
 *
 * ── FAILURE IS PER-STAGE, AND ONLY ONE STAGE IS FATAL ────────────────────────────────────────
 * The outline is the form; without it there is nothing to persist and the action fails. Every
 * stage after it refines something that already exists, so a failure there degrades that piece and
 * the build continues. A page whose detail call fails keeps its outline stubs — real questions with
 * a type and a prompt, just plainer. What must never happen is a failure that is neither surfaced
 * nor recovered: every degradation is NAMED in the completion event, because a silently skipped
 * page reads to an author as a judgement the AI made rather than something that went wrong.
 */
import { LogError, LogStatus } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import {
  applyPageDetail,
  buildFormFromBlueprint,
  type BuiltFormResult,
} from './form-blueprint-builder';
import {
  declaredKeys,
  parseFormBlueprint,
  parsePageDetail,
  type BlueprintPage,
  type FormBlueprint,
} from './form-blueprint';
import type { FormDesignerInputMode } from './llm-form-designer';
import { MAX_DESIGNER_ATTEMPTS, PAGE_DETAIL_CONCURRENCY } from './limits';
import {
  progressEvent,
  publishProgress,
  type ProgressChannel,
} from './progress-events';

/**
 * How a stage's model call is made.
 *
 * The same seam shape as the single-shot Designer's `FormDesignerModel`, and for the same reason:
 * the whole pipeline has to be drivable offline from a stub, or none of the sequencing,
 * concurrency or degradation behaviour below is testable without an API key.
 *
 * BOTH methods return RAW TEXT. Validation and the retry-with-the-error loop live here rather than
 * in the model, so the two stages retry identically and a stub can drive either failure path by
 * simply returning something invalid.
 */
export interface StagedAuthoringModel {
  /** The whole form, sparsely: pages, question stubs, screens, theme brief. */
  outline(input: OutlineInput, contextUser: UserInfo): Promise<string>;
  /** One page's questions in full, given the brief, the outline for coherence, and its stubs. */
  pageDetail(input: PageDetailInput, contextUser: UserInfo): Promise<string>;
}

/** What the outline stage is given. */
export interface OutlineInput {
  brief: string;
  inputMode: FormDesignerInputMode;
  /** Prior invalid output and its validation error, on a retry. */
  previousAttempt?: string;
  validationError?: string;
}

/** What one detail stage is given. */
export interface PageDetailInput {
  brief: string;
  inputMode: FormDesignerInputMode;
  /**
   * The whole outline, so the page is detailed IN CONTEXT.
   *
   * Without it each page is written by a model that cannot see the others, and the result reads
   * like it: the same question asked twice on different pages, or a rule referencing a key this
   * page does not contain. Passing the outline is what makes the parallel calls coherent.
   */
  outline: FormBlueprint;
  /** 0-based index of the page being detailed, within `outline.pages`. */
  pageIndex: number;
  /** Prior invalid output and its validation error, on a retry. */
  previousAttempt?: string;
  validationError?: string;
}

/** What a staged run produced. */
export interface StagedAuthoringResult {
  blueprint: FormBlueprint;
  built: BuiltFormResult;
  /**
   * Everything that did not work, named. Empty on a clean run.
   *
   * Entries read like `page:2`. Returned as well as published because the progress channel is
   * cosmetic — an author whose websocket never connected still deserves to be told.
   */
  degraded: string[];
}

/** Everything a staged run needs that is not the brief. */
export interface StagedAuthoringOptions {
  inputMode: FormDesignerInputMode;
  ownerUserId?: string;
  /** Absent means no progress is published — a silent build, which is a supported configuration. */
  channel?: ProgressChannel;
}

/**
 * Whether a request should be built in stages.
 *
 * Derived from the presence of a progress channel, because that is the one signal that says
 * somebody is WATCHING — and watching is the only thing staging buys (see the file header). An API
 * or batch caller supplies no channel, wants the cheaper single call, and gets an identical form.
 *
 * A named function rather than an inline `if` because this conflates two ideas — "where do I send
 * progress" and "how do I generate" — and that is a decision, not an accident. If a caller ever
 * needs to separate them, this is the one place to add the explicit switch.
 */
export function shouldStage(channel: ProgressChannel | undefined): boolean {
  return channel !== undefined;
}

/**
 * Run the staged pipeline: outline, persist, then detail every page.
 *
 * Throws only when the OUTLINE fails — the caller maps that to `DESIGN_FAILED`, exactly as the
 * single-shot path does. A persist failure propagates as `FormPersistError` with its form id, so a
 * half-built draft is still reportable.
 */
export async function runStagedAuthoring(
  brief: string,
  model: StagedAuthoringModel,
  contextUser: UserInfo,
  options: StagedAuthoringOptions,
): Promise<StagedAuthoringResult> {
  const outline = await requestOutline(brief, model, contextUser, options.inputMode);
  const built = await buildFormFromBlueprint(outline, contextUser, options.ownerUserId);

  const total = outlineTotal(outline);
  publish(options.channel, {
    formId: built.formId,
    stage: 'outline',
    step: 1,
    total,
    label: `Sketching ${outline.name}`,
  });

  const degraded = await detailEveryPage(brief, model, contextUser, options, outline, built, total);

  publish(options.channel, {
    formId: built.formId,
    stage: 'complete',
    step: total,
    total,
    label: degraded.length === 0 ? 'Ready' : 'Ready, with some parts left plain',
    degraded,
  });

  return { blueprint: outline, built, degraded };
}

/**
 * Ask for the outline, retrying with the validation error the way the single-shot Designer does.
 *
 * Throwing after the cap is correct here and only here: the outline IS the form, so there is
 * nothing to degrade to. Every later stage refines rows that already exist and degrades instead.
 */
async function requestOutline(
  brief: string,
  model: StagedAuthoringModel,
  contextUser: UserInfo,
  inputMode: FormDesignerInputMode,
): Promise<FormBlueprint> {
  let lastError: unknown;
  let input: OutlineInput = { brief, inputMode };

  for (let attempt = 1; attempt <= MAX_DESIGNER_ATTEMPTS; attempt++) {
    const raw = await model.outline(input, contextUser);
    try {
      return parseFormBlueprint(raw);
    } catch (error) {
      lastError = error;
      input = { ...input, previousAttempt: raw, validationError: asText(error) };
    }
  }
  throw new Error(
    `Outline was invalid after ${MAX_DESIGNER_ATTEMPTS} attempts: ${asText(lastError)}`,
  );
}

/**
 * Units of work an author will watch tick by: the outline, then one per page.
 *
 * Images and theme are NOT counted here even though they are stages of the wider design. They are
 * Phase-C work and, more importantly, their count is not knowable until the outline exists — a
 * total that grows mid-build turns a determinate progress bar back into a guess. When those stages
 * land, the total is recomputed here from the outline's image prompts, once, before step 1 is
 * published.
 */
function outlineTotal(outline: FormBlueprint): number {
  return 1 + outline.pages.length;
}

/**
 * Detail every page, a few at a time, publishing as each lands.
 *
 * Bounded concurrency rather than `Promise.all` over every page: a ten-page form would otherwise
 * open ten simultaneous model calls, which is how a provider rate-limits an author into a form
 * where most pages degraded. {@link PAGE_DETAIL_CONCURRENCY} is the cap; pages beyond it wait.
 *
 * Ordering of the PUBLISHED events is therefore not guaranteed to be page order — page 3 can
 * finish before page 2. That is fine and deliberate: each event names the page it changed, and the
 * step counter is a count of completed work, not a position.
 */
async function detailEveryPage(
  brief: string,
  model: StagedAuthoringModel,
  contextUser: UserInfo,
  options: StagedAuthoringOptions,
  outline: FormBlueprint,
  built: BuiltFormResult,
  total: number,
): Promise<string[]> {
  const keys = declaredKeys(outline);
  const degraded: string[] = [];
  let completed = 1; // the outline

  const pageIndexes = outline.pages.map((_, index) => index);
  await inBatches(pageIndexes, PAGE_DETAIL_CONCURRENCY, async (pageIndex) => {
    const pageId = built.pageIds[pageIndex];
    const failure = await detailOnePage({
      brief,
      model,
      contextUser,
      options,
      outline,
      built,
      pageIndex,
      pageId,
      keys,
    });
    if (failure) {
      degraded.push(failure);
    }
    completed++;
    publish(options.channel, {
      formId: built.formId,
      stage: 'page',
      step: completed,
      total,
      label: pageLabel(outline.pages[pageIndex], pageIndex, failure !== undefined),
      changed: { pageId },
    });
  });

  return degraded;
}

/** One page: prompt, validate, persist. Returns a degradation marker, or undefined on success. */
async function detailOnePage(ctx: {
  brief: string;
  model: StagedAuthoringModel;
  contextUser: UserInfo;
  options: StagedAuthoringOptions;
  outline: FormBlueprint;
  built: BuiltFormResult;
  pageIndex: number;
  pageId: string;
  keys: ReadonlySet<string>;
}): Promise<string | undefined> {
  const marker = `page:${ctx.pageIndex + 1}`;
  let detail: BlueprintPage;
  try {
    detail = await requestPageDetail(ctx);
  } catch (error) {
    // Degraded, not swallowed: the page keeps its outline stubs (real questions, just plainer),
    // the reason is logged in full, and the marker reaches the author in the completion event.
    LogError(
      `[Forms authoring] Could not detail page ${ctx.pageIndex + 1} of form ${ctx.built.formId}; ` +
        `keeping its outline questions. ${asText(error)}`,
    );
    return marker;
  }

  try {
    const applied = await applyPageDetail(
      ctx.built.formId,
      ctx.pageId,
      detail,
      ctx.built.questionIdByKey,
      ctx.contextUser,
    );
    LogStatus(
      `[Forms authoring] Page ${ctx.pageIndex + 1}: ${applied.questionsUpdated} question(s) ` +
        `detailed, ${applied.questionsAdded} added, ${applied.optionsAdded} option(s).`,
    );
    return undefined;
  } catch (error) {
    // A persist failure here is NOT fatal for the same reason a prompt failure is not: the page
    // already exists with usable questions. Fatal would mean discarding a form over one page.
    LogError(
      `[Forms authoring] Could not persist page ${ctx.pageIndex + 1} of form ${ctx.built.formId}; ` +
        `keeping its outline questions. ${asText(error)}`,
    );
    return marker;
  }
}

/**
 * Ask for one page's detail, retrying with the validation error the way the Designer does.
 *
 * The retry is per-stage and uses the same cap, so a page that keeps producing invalid JSON costs
 * three calls and then degrades — it does not consume the whole run's budget or fail the form.
 */
async function requestPageDetail(ctx: {
  brief: string;
  model: StagedAuthoringModel;
  contextUser: UserInfo;
  options: StagedAuthoringOptions;
  outline: FormBlueprint;
  pageIndex: number;
  keys: ReadonlySet<string>;
}): Promise<BlueprintPage> {
  let lastError: unknown;
  let input: PageDetailInput = {
    brief: ctx.brief,
    inputMode: ctx.options.inputMode,
    outline: ctx.outline,
    pageIndex: ctx.pageIndex,
  };

  for (let attempt = 1; attempt <= MAX_DESIGNER_ATTEMPTS; attempt++) {
    const raw = await ctx.model.pageDetail(input, ctx.contextUser);
    try {
      return parsePageDetail(raw, ctx.keys);
    } catch (error) {
      lastError = error;
      input = { ...input, previousAttempt: raw, validationError: asText(error) };
    }
  }
  throw new Error(
    `Page ${ctx.pageIndex + 1} detail was invalid after ${MAX_DESIGNER_ATTEMPTS} attempts: ${asText(lastError)}`,
  );
}

/** Present-tense progress copy an author reads while they wait. */
function pageLabel(page: BlueprintPage, index: number, failed: boolean): string {
  const name = page.title?.trim() || `page ${index + 1}`;
  return failed ? `Kept ${name} simple` : `Filled in ${name}`;
}

/**
 * Run `work` over `items` with at most `size` in flight.
 *
 * A fixed pool rather than chunked waves: waves idle the whole pool waiting for the slowest item
 * in each chunk, and page-detail calls vary a lot in length. `work` is expected to handle its own
 * failures (each call above returns a marker rather than rejecting), so a rejection here is a
 * programming error and is allowed to propagate rather than being quietly absorbed.
 */
async function inBatches<T>(
  items: readonly T[],
  size: number,
  work: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      await work(items[next++]);
    }
  });
  await Promise.all(workers);
}

/** Publish one event, with the logger this module already uses for everything else. */
function publish(
  channel: ProgressChannel | undefined,
  fields: Parameters<typeof progressEvent>[0],
): void {
  publishProgress(channel, progressEvent(fields), LogError);
}

function asText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
