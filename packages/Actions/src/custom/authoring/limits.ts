/**
 * Every cap the AI-authoring pipeline enforces, in one place.
 *
 * Collected here rather than left beside the code that enforces them because the whole set is
 * one operational decision: someone tuning how hard a generation run may work should read one
 * file, not five. Each constant documents what happens when it is REACHED — a cap whose
 * limit-hit behaviour is unstated is a loop nobody can reason about.
 *
 * Nothing here imports from the pipeline, so this file is a leaf: the Designer imports its
 * attempt cap FROM here and re-exports it, rather than the two files importing each other.
 */

/**
 * LLM attempts per Designer call before it gives up.
 *
 * Reaching it throws, and the caller maps that to a `DESIGN_FAILED` action result. Re-exported
 * by `llm-form-designer.ts` so its long-standing import path keeps working.
 */
export const MAX_DESIGNER_ATTEMPTS = 3;

/**
 * Save attempts for a single row, INCLUDING the deterministic repair between them.
 *
 * Reaching it throws `FormPersistError` carrying the provider's own failure detail — the same
 * outcome as an unrepairable failure on the first attempt, deliberately: a row that will not
 * save after three deterministic repairs is not a transient problem.
 */
export const MAX_PERSIST_ATTEMPTS = 3;

/**
 * Page-detail model calls in flight at once during a staged build.
 *
 * A cap rather than "all of them": a ten-page form opening ten simultaneous calls is how a
 * provider rate-limits an author into a form where most pages degraded to their outline stubs.
 * Reaching it does not fail anything — later pages simply wait for a slot.
 */
export const PAGE_DETAIL_CONCURRENCY = 3;

/**
 * How long one stage's model call may run before it is cancelled.
 *
 * Enforced through the prompt runner's own `cancellationToken`, so reaching it actually STOPS the
 * provider call rather than just resolving the caller — a `Promise.race` would leave the request
 * running, streaming and billing behind a pipeline that had already moved on.
 *
 * Reaching it degrades that stage: a timed-out page keeps its outline questions. A timed-out
 * OUTLINE fails the run with `DESIGN_FAILED`, because there is nothing yet to degrade to.
 */
export const STAGE_TIMEOUT_MS = 120_000;

/**
 * Generated images per run.
 *
 * A cap on COST, not on taste: a brief that yields twenty picture-choice options would otherwise
 * run twenty image generations, which is slow and expensive enough to be a surprise on somebody
 * else's bill. Six covers a picture-choice question and a hero, which is what images are for here.
 *
 * Reaching it does not fail anything — the overflow is NAMED in the run's degraded list, because a
 * silent cap tells an author "the AI decided six was enough", which is not what happened.
 */
export const MAX_GENERATED_IMAGES = 6;

/**
 * The bounded string columns, and how much each will hold.
 *
 * These are clamped ON WRITE rather than repaired after a failed save. The builder knows every
 * bounded column statically, so "String or binary data would be truncated" is a failure mode it
 * can make impossible instead of one it has to recognise from a provider's message — the
 * difference between a rule and a guess. A brief asking for a 700-character option label is not
 * exotic; it is Tuesday.
 *
 * The `NVARCHAR(MAX)` columns — Prompt, HelpText, Description, Body, every JSON blob — are
 * deliberately absent. There is nothing to clamp them against, and inventing a limit here would
 * silently truncate content the database was happy to store.
 */
export const COLUMN_LIMITS = {
  /** `Form.Name NVARCHAR(255)`. */
  formName: 255,
  /** `FormPage.Title NVARCHAR(255)`. */
  pageTitle: 255,
  /** `FormQuestionOption.Label` / `.Value`, both `NVARCHAR(500)`. */
  optionText: 500,
  /** `FormQuestionOption.ImageURL NVARCHAR(1000)`. */
  optionImageUrl: 1000,
  /** `FormScreen.Title NVARCHAR(500)`. */
  screenTitle: 500,
  /** `FormScreen.ButtonLabel NVARCHAR(100)` — the tightest bound in the schema. */
  screenButtonLabel: 100,
  /** `FormScreen.MediaURL` / `.RedirectURL`, both `NVARCHAR(1000)`. */
  screenUrl: 1000,
  /** `FormStyle.Name NVARCHAR(255)` — also the column carrying `UQ_FormStyle_Name`. */
  styleName: 255,
} as const;
