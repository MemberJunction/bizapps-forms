/**
 * AI authoring action: **Forms: Generate Form From Brief** (FORMS_BUILD_PLAN §7).
 *
 * From a natural-language brief — e.g. "a 5-question event RSVP with dietary
 * restrictions and a +1 count" — this drafts a complete Form / FormPage /
 * FormQuestion / FormQuestionOption set (plus a Draft FormVersion) via entity Save().
 *
 * It reuses the deterministic Designer→Builder split proven by MJ's Form Builder
 * agent: the LLM (Designer) emits a structured JSON {@link FormBlueprint}; deterministic
 * code (Builder) validates it against the §5.3 taxonomy and persists it. The model is
 * chosen by MemberJunction from the AI Prompt's metadata — there is no model or vendor
 * name in code (see {@link AIPromptFormDesignerModel}).
 *
 * TWO ROUTES, AND THEY DO NOT PRODUCE THE SAME FORM. With a `SessionID` the build runs in STAGES
 * and publishes progress, so the author sees a real form within seconds and watches it fill in.
 * Without one it is a single prompt — cheaper and fewer calls, but the image and theme stages live
 * inside the staged pipeline only, so that form carries the house palette and no pictures however
 * hard the blueprint asked for them. This header used to claim "identical output shape"; it is
 * not, the omissions are now reported in `Degraded`, and `shouldStage` carries the full note.
 *
 * Input params:
 *   - `Brief` (string, required) — the natural-language description, or the author's own list of
 *      questions when `InputMode` is `'questions'`.
 *   - `InputMode` (`'brief' | 'questions'`, optional, default `'brief'`) — see
 *      {@link FormDesignerInputMode}. An unrecognised value falls back to `'brief'` rather than
 *      failing the run: the wrong mode produces a usable form, a rejected run produces nothing.
 *   - `SessionID` (string, optional) — the caller's push-channel session. Supplying it switches
 *      the build to the staged, progress-publishing route. Absent = a silent single-shot build.
 *   - `OwnerUserID` (string, optional) — stamped on the created Form.
 * Output params:
 *   - `FormID`, `FormVersionID`, `StyleID` (created ids)
 *   - `PageCount`, `QuestionCount`, `OptionCount`, `ScreenCount`
 *   - `Blueprint` (the validated blueprint object, for inspection/preview)
 *   - `Degraded` (string[]) — parts a staged build could not complete, named. Empty is the norm.
 *
 * Result codes: `SUCCESS`, `PARTIAL` (a reviewable half-built draft — `FormID` is still set),
 * `MISSING_PARAMETERS`, `DESIGN_FAILED`, `PERSIST_FAILED`, `FAILED`.
 *
 * Both routes are unit-testable offline through their model seams ({@link setFormDesignerModel},
 * {@link setStagedAuthoringModel}) — no network, no API key, no websocket. See
 * `llm-form-designer.spec.ts` and `staged-authoring.spec.ts`.
 */
import { BaseAction } from '@memberjunction/actions';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import type { UserInfo } from '@memberjunction/core';
import { getStringParam, setOutputParam } from '../shared/action-params';
import { buildFormFromBlueprint, FormPersistError } from './form-blueprint-builder';
import {
  AIPromptFormDesignerModel,
  designFormFromBrief,
  type FormDesignerInputMode,
  type FormDesignerModel,
} from './llm-form-designer';
import { AIPromptStagedAuthoringModel } from './staged-authoring-model';
import { CoreActionImageGenerationModel } from './generate-image-model';
import type { ImageGenerationModel } from './image-stage';
import {
  runStagedAuthoring,
  shouldStage,
  type StagedAuthoringModel,
  type StagedAuthoringResult,
} from './staged-authoring';
import type { ProgressChannel } from './progress-events';
import type { FormBlueprint } from './form-blueprint';
import { errorText } from '../shared/error-text';

let activeDesignerModel: FormDesignerModel = new AIPromptFormDesignerModel();
let activeStagedModel: StagedAuthoringModel = new AIPromptStagedAuthoringModel();
let activeImageModel: ImageGenerationModel = new CoreActionImageGenerationModel();

/** Override the single-shot Designer model (e.g. a deterministic stub in tests). */
export function setFormDesignerModel(model: FormDesignerModel): void {
  activeDesignerModel = model;
}

/** Override the staged pipeline's model (e.g. a deterministic stub in tests). */
export function setStagedAuthoringModel(model: StagedAuthoringModel): void {
  activeStagedModel = model;
}


@RegisterClass(BaseAction, 'Forms: Generate Form From Brief')
export class GenerateFormFromBriefAction extends BaseAction {
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const brief = getStringParam(params, 'Brief');
    if (!brief) {
      return fail('Brief parameter is required', 'MISSING_PARAMETERS');
    }
    return runAuthoring(brief, getStringParam(params, 'OwnerUserID'), params, params.ContextUser, {
      inputMode: readInputMode(params),
      channel: readChannel(params),
    });
  }
}

/**
 * The progress channel for this run, or `undefined` when there is nobody to publish to.
 *
 * BOTH identities or neither. `sessionId` routes the push to the right browser tab; `ownerUserId`
 * is what MJ's subscription filter checks against the subscribing connection's authenticated user,
 * and it FAILS CLOSED on 6.x. A channel carrying only the session would publish events that are
 * silently discarded — which looks exactly like a network problem and is not one. A context user
 * with no id is not a channel.
 */
function readChannel(params: RunActionParams): ProgressChannel | undefined {
  const sessionId = getStringParam(params, 'SessionID');
  const ownerUserId = params.ContextUser?.ID;
  return sessionId && ownerUserId ? { sessionId, ownerUserId } : undefined;
}

/**
 * Read `InputMode`, defaulting anything unrecognised to `'brief'`.
 *
 * Lenient on purpose. This param decides how the Designer TREATS the text, not whether the text is
 * usable — so a caller who sends `"Questions"` or a typo gets a designed form rather than a
 * `MISSING_PARAMETERS` refusal over a hint.
 */
function readInputMode(params: RunActionParams): FormDesignerInputMode {
  return getStringParam(params, 'InputMode')?.toLowerCase() === 'questions' ? 'questions' : 'brief';
}

/**
 * The authoring pipeline, both routes. Also usable directly from tests.
 *
 * Route selection is the only branch: everything after it — output params, result codes, the
 * partial-draft story — is shared, so the two routes cannot drift in what a caller sees.
 */
export async function runAuthoring(
  brief: string,
  ownerUserId: string | undefined,
  params: RunActionParams,
  contextUser: UserInfo,
  options: { inputMode?: FormDesignerInputMode; channel?: ProgressChannel } = {},
): Promise<ActionResultSimple> {
  const inputMode = options.inputMode ?? 'brief';
  try {
    const outcome = shouldStage(options.channel)
      ? await runStagedAuthoring(brief, activeStagedModel, contextUser, {
          inputMode,
          ownerUserId,
          channel: options.channel,
          imageModel: activeImageModel,
        })
      : await runSingleShot(brief, contextUser, ownerUserId, inputMode);
    return report(outcome, params);
  } catch (error) {
    return failureFor(error, params);
  }
}

/** One prompt, one persist. What an API caller gets, and what every form got before staging. */
async function runSingleShot(
  brief: string,
  contextUser: UserInfo,
  ownerUserId: string | undefined,
  inputMode: FormDesignerInputMode,
): Promise<StagedAuthoringResult> {
  const blueprint = await designFormFromBrief(brief, activeDesignerModel, contextUser, inputMode);
  const built = await buildFormFromBlueprint(blueprint, contextUser, ownerUserId);
  // Shaped as a staged result so `report` has one thing to write out.
  //
  // WHAT THIS ROUTE DOES NOT DO, said out loud. The image and theme stages live inside
  // `runStagedAuthoring`; `buildFormFromBlueprint` calls neither. So a single-shot form carries
  // the house palette and no pictures however hard the blueprint asked for them — the model still
  // returns `theme.brandAdjectives` and per-option `imagePrompt`, and both are dropped on the
  // floor. That is a deliberate cost trade (image generation is billed per picture and a batch
  // caller did not ask to be billed), NOT an oversight, but a caller cannot tell those apart from
  // a result that reports nothing degraded. Naming them here is what makes the trade visible.
  const skipped: string[] = [];
  if (blueprint.theme) {
    skipped.push('the requested colours — the form carries the house palette');
  }
  if (countImagePrompts(blueprint) > 0) {
    skipped.push('the requested pictures — generate them from a channel-backed call');
  }
  return { blueprint, built, degraded: skipped };
}

/**
 * How many pictures the blueprint asked for, across screens and picture-choice options.
 *
 * Counted rather than tested for truthiness so the reported line is honest about a blueprint that
 * asked for nothing: a form with no `imagePrompt` anywhere is not degraded by a route that skips
 * image generation.
 */
function countImagePrompts(blueprint: FormBlueprint): number {
  let n = 0;
  if (blueprint.screens?.welcome?.imagePrompt) n++;
  for (const ending of blueprint.screens?.endings ?? []) {
    if (ending.imagePrompt) n++;
  }
  for (const page of blueprint.pages ?? []) {
    for (const question of page.questions ?? []) {
      for (const option of question.options ?? []) {
        if (typeof option === 'object' && option.imagePrompt) n++;
      }
    }
  }
  return n;
}

/** Write the output params and the success message. Identical for both routes. */
function report(outcome: StagedAuthoringResult, params: RunActionParams): ActionResultSimple {
  const { blueprint, built, degraded } = outcome;
  setOutputParam(params, 'FormID', built.formId);
  setOutputParam(params, 'FormVersionID', built.formVersionId);
  setOutputParam(params, 'PageCount', built.pageCount);
  setOutputParam(params, 'QuestionCount', built.questionCount);
  setOutputParam(params, 'OptionCount', built.optionCount);
  setOutputParam(params, 'ScreenCount', built.screenCount);
  setOutputParam(params, 'StyleID', built.styleId);
  setOutputParam(params, 'Blueprint', blueprint);
  setOutputParam(params, 'Degraded', degraded);

  const summary = `Generated draft form "${blueprint.name}" (${built.questionCount} questions across ${built.pageCount} page(s)).`;
  return {
    Success: true,
    ResultCode: 'SUCCESS',
    // Degradations are named in the message as well as the output param, because a caller reading
    // only the message is the common case and "some parts were left plain" is not a detail.
    Message: degraded.length === 0 ? summary : `${summary} Left plain: ${degraded.join(', ')}.`,
  };
}

/**
 * Map a thrown error to a result.
 *
 * A `FormPersistError` is the only one that can arrive with a form already in the database, so it
 * is the only one that can report `PARTIAL`. Everything else failed before anything was written:
 * a design failure is `DESIGN_FAILED` on either route, matching what callers already handle.
 */
function failureFor(error: unknown, params: RunActionParams): ActionResultSimple {
  if (error instanceof FormPersistError) {
    return persistFailure(error, params);
  }
  return fail(`AI form design failed: ${errorText(error)}`, 'DESIGN_FAILED');
}

/**
 * A persist failure, distinguishing the half-built case.
 *
 * A build that got as far as creating the Form row leaves a DRAFT behind — invisible to
 * respondents, editable by its author, and better than nothing. Reporting `PARTIAL` with its id on
 * the output param is what lets a caller offer it, instead of an author being told "generation
 * failed" while a form they cannot find sits in the database. Still `Success: false`, because a
 * half-built form is not a success and a caller that opens it must do so deliberately.
 */
function persistFailure(error: FormPersistError, params: RunActionParams): ActionResultSimple {
  if (error.formId) {
    setOutputParam(params, 'FormID', error.formId);
    return fail(
      'The form was only partly generated and has been left as a draft you can review and finish: ' +
        errorText(error),
      'PARTIAL',
    );
  }
  return fail(`Failed to persist generated form: ${errorText(error)}`, 'PERSIST_FAILED');
}


function fail(message: string, resultCode: string): ActionResultSimple {
  return { Success: false, Message: message, ResultCode: resultCode };
}
