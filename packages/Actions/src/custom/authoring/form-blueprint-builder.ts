/**
 * Deterministic Builder — persists a validated {@link FormBlueprint} into the live
 * `Form / FormVersion / FormPage / FormQuestion / FormQuestionOption / FormScreen / FormStyle`
 * rows. This is the code-agent half of the Designer→Builder split; it does NO LLM work and NO
 * guessing. Everything it writes comes straight from the blueprint the Designer already validated.
 *
 * All entity I/O goes through `Metadata.GetEntityObject` with the context user, and every save
 * goes through {@link saveRow}, which checks the result (CLAUDE.md MJ patterns).
 *
 * WRITE ORDER IS LOAD-BEARING, because rules reference rows by id and an id only exists once its
 * row is saved. The order below is not arbitrary tidiness — it is what makes every reference
 * resolvable at the moment it is written:
 *
 *   FormStyle → Form → FormVersion → for each page in order: the page, then its questions, then
 *   their options → screens (last)
 *
 * The style comes FIRST so the form can carry its `StyleID` on the form's single insert rather
 * than being saved once and updated again. That is only safe because the style is best-effort —
 * see {@link createStyle} — so a style that cannot be written costs the form nothing.
 *
 * A question's rule may only name earlier questions, so those are already persisted when it is
 * written. A page's rule may only name questions on earlier pages, likewise. An ending screen's
 * rule may name ANY question, which is exactly why screens come after every page.
 */
import { LogError, Metadata, RunView } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import {
  mjBizAppsFormsFormEntity,
  mjBizAppsFormsFormVersionEntity,
  mjBizAppsFormsFormPageEntity,
  mjBizAppsFormsFormQuestionEntity,
  mjBizAppsFormsFormQuestionOptionEntity,
  mjBizAppsFormsFormScreenEntity,
  mjBizAppsFormsFormStyleEntity,
  defaultThemeJSON,
  isGuid,
} from '@mj-biz-apps/forms-entities';
import {
  CHOICE_QUESTION_TYPES,
  type BlueprintEndingScreen,
  type BlueprintPage,
  type BlueprintQuestion,
  type BlueprintWelcomeScreen,
  type FormBlueprint,
} from './form-blueprint';
import { conditionalRuleJSON, type QuestionIdByKey } from './blueprint-rules';
import { COLUMN_LIMITS, MAX_PERSIST_ATTEMPTS } from './limits';
import { clampText, FormPersistError, isDuplicateKeyFailure, saveRow } from './persist';
import { errorText } from '../shared/error-text';

/**
 * Re-exported so every existing importer keeps working after the class moved to `persist.ts`.
 * Within-package only — the repo's no-re-exports rule is about crossing package boundaries.
 */
export { FormPersistError } from './persist';

const ENTITY = {
  Form: 'MJ_BizApps_Forms: Forms',
  FormVersion: 'MJ_BizApps_Forms: Form Versions',
  FormPage: 'MJ_BizApps_Forms: Form Pages',
  FormQuestion: 'MJ_BizApps_Forms: Form Questions',
  FormQuestionOption: 'MJ_BizApps_Forms: Form Question Options',
  FormScreen: 'MJ_BizApps_Forms: Form Screens',
  FormStyle: 'MJ_BizApps_Forms: Form Styles',
} as const;

/**
 * Ids an image can be attached to, with the prompt that asked for it.
 *
 * The prompt travels with the id because `imagePrompt` is authoring intent and is deliberately
 * never persisted — after the build there is nowhere else to read it from.
 */
export interface ImageTargets {
  welcomeScreen?: { screenId: string; imagePrompt?: string };
  endingScreens: Array<{ screenId: string; title: string; imagePrompt?: string }>;
  options: Array<{ optionId: string; label: string; imagePrompt?: string }>;
}

/** What the builder created — surfaced back to the calling action's output params. */
export interface BuiltFormResult {
  formId: string;
  formVersionId: string;
  pageCount: number;
  questionCount: number;
  optionCount: number;
  screenCount: number;
  /**
   * The created `FormPage` ids, in blueprint page order.
   *
   * Returned because the staged pipeline's second stage addresses pages by id, and the alternative
   * — re-querying them and matching on DisplayOrder — reconstructs something the Builder already
   * knew and could get wrong if two pages ever shared an order.
   */
  pageIds: string[];
  /**
   * Blueprint key to the `FormQuestion.ID` it became, for every keyed question.
   *
   * The detail stage writes conditional rules that reference keys the OUTLINE declared, so it
   * needs this map. Handing it back is what keeps key-to-id resolution in one place instead of
   * the detail stage rebuilding it from the database.
   */
  questionIdByKey: Map<string, string>;
  /**
   * What the image stage will need to address, paired with the prompts that asked for it.
   *
   * Returned rather than re-read from the database because `imagePrompt` is authoring intent and
   * is deliberately never persisted — only the blueprint knows it, and only the Builder knows
   * which row each prompt ended up attached to. Options are empty on a staged build: its outline
   * carries no options, and they arrive from {@link applyPageDetail} instead.
   */
  imageTargets: ImageTargets;
  /**
   * The per-form style row this draft was given, or `undefined` when one could not be created.
   *
   * Optional because the style is scaffolding for the theme stage rather than part of the
   * blueprint: a form with no style row renders on the widget's defaults and grows one the moment
   * an author opens the Design tab, which is exactly what every form did before this existed.
   */
  styleId?: string;
}

/**
 * Persist a blueprint as a brand-new Draft form. Returns the created ids/counts.
 *
 * Throws {@link FormPersistError} on a save that could not be repaired. When the Form row already
 * existed by then the error carries its `formId`, so the caller can report a reviewable partial
 * draft rather than an id-less failure over an orphan row — a Draft form is invisible to
 * respondents, so leaving it in place costs nothing and losing its id costs the author everything.
 */
export async function buildFormFromBlueprint(
  blueprint: FormBlueprint,
  contextUser: UserInfo,
  ownerUserId?: string,
): Promise<BuiltFormResult> {
  const md = new Metadata();
  const style = await createStyle(md, blueprint.name, contextUser);
  const form = await createForm(md, blueprint, style?.ID, contextUser, ownerUserId);

  // Every save from here on names the form, so a failure can report a draft the author can open.
  const formId = form.ID;
  const version = await createDraftVersion(md, formId, contextUser);

  const idByKey = new Map<string, string>();
  const pageIds: string[] = [];
  const imageTargets: ImageTargets = { endingScreens: [], options: [] };
  let questionCount = 0;
  let optionCount = 0;
  for (let pageIndex = 0; pageIndex < blueprint.pages.length; pageIndex++) {
    const blueprintPage = blueprint.pages[pageIndex];
    const page = await createPage(md, formId, blueprintPage, pageIndex, idByKey, contextUser);
    pageIds.push(page.ID);
    const counts = await createQuestionsForPage(md, formId, page.ID, blueprintPage, idByKey, contextUser);
    questionCount += counts.questions;
    optionCount += counts.options;
    imageTargets.options.push(...counts.optionImages);
  }

  const screenCount = await createScreens(md, formId, blueprint, idByKey, imageTargets, contextUser);

  return {
    formId,
    formVersionId: version.ID,
    pageCount: blueprint.pages.length,
    questionCount,
    optionCount,
    screenCount,
    pageIds,
    questionIdByKey: idByKey,
    imageTargets,
    styleId: style?.ID,
  };
}

async function createForm(
  md: Metadata,
  blueprint: FormBlueprint,
  styleId: string | undefined,
  contextUser: UserInfo,
  ownerUserId?: string,
): Promise<mjBizAppsFormsFormEntity> {
  const form = await md.GetEntityObject<mjBizAppsFormsFormEntity>(ENTITY.Form, contextUser);
  form.NewRecord();
  form.Name = clampText(blueprint.name, COLUMN_LIMITS.formName, 'The generated form name');
  if (styleId) {
    form.StyleID = styleId;
  }
  if (blueprint.description) {
    form.Description = blueprint.description;
  }
  form.Status = 'Draft';
  form.RenderMode = blueprint.renderMode ?? 'Scroll';
  if (ownerUserId) {
    form.OwnerUserID = ownerUserId;
  }
  form.Settings = buildFormSettingsJSON(blueprint);
  await saveRow(form, 'Form');
  return form;
}

/** Build the `Form.Settings` JSON (matches the contract's `FormSettings` shape). */
function buildFormSettingsJSON(blueprint: FormBlueprint): string {
  const settings: Record<string, string | boolean> = {
    anonymousAllowed: true,
    captchaRequired: false,
  };
  if (blueprint.confirmationMessage) {
    settings.confirmationMessage = blueprint.confirmationMessage;
  }
  return JSON.stringify(settings);
}

async function createDraftVersion(
  md: Metadata,
  formId: string,
  contextUser: UserInfo,
): Promise<mjBizAppsFormsFormVersionEntity> {
  const version = await md.GetEntityObject<mjBizAppsFormsFormVersionEntity>(ENTITY.FormVersion, contextUser);
  version.NewRecord();
  version.FormID = formId;
  version.VersionNumber = 1;
  version.Status = 'Draft';
  await saveRow(version, 'FormVersion', { formId });
  return version;
}

async function createPage(
  md: Metadata,
  formId: string,
  page: BlueprintPage,
  index: number,
  idByKey: QuestionIdByKey,
  contextUser: UserInfo,
): Promise<mjBizAppsFormsFormPageEntity> {
  const pageEntity = await md.GetEntityObject<mjBizAppsFormsFormPageEntity>(ENTITY.FormPage, contextUser);
  pageEntity.NewRecord();
  pageEntity.FormID = formId;
  if (page.title) {
    pageEntity.Title = clampText(page.title, COLUMN_LIMITS.pageTitle, `Page ${index + 1}'s title`);
  }
  if (page.description) {
    pageEntity.Description = page.description;
  }
  pageEntity.DisplayOrder = index;
  pageEntity.ConditionalRule = conditionalRuleJSON(page.conditionalRule, idByKey, `Page ${index + 1}`);
  await saveRow(pageEntity, 'FormPage', { formId });
  return pageEntity;
}

async function createQuestionsForPage(
  md: Metadata,
  formId: string,
  pageId: string,
  page: BlueprintPage,
  idByKey: Map<string, string>,
  contextUser: UserInfo,
): Promise<{ questions: number; options: number; optionImages: ImageTargets['options'] }> {
  let optionCount = 0;
  const optionImages: ImageTargets['options'] = [];
  for (let i = 0; i < page.questions.length; i++) {
    const question = await createQuestion(md, formId, pageId, page.questions[i], i, idByKey, contextUser);
    if (page.questions[i].key) {
      idByKey.set(page.questions[i].key as string, question.ID);
    }
    const created = await createOptions(md, formId, question.ID, page.questions[i], contextUser);
    optionCount += created.count;
    optionImages.push(...created.imageTargets);
  }
  return { questions: page.questions.length, options: optionCount, optionImages };
}

async function createQuestion(
  md: Metadata,
  formId: string,
  pageId: string,
  question: BlueprintQuestion,
  index: number,
  idByKey: QuestionIdByKey,
  contextUser: UserInfo,
): Promise<mjBizAppsFormsFormQuestionEntity> {
  const q = await md.GetEntityObject<mjBizAppsFormsFormQuestionEntity>(ENTITY.FormQuestion, contextUser);
  q.NewRecord();
  q.FormID = formId;
  q.PageID = pageId;
  q.QuestionType = question.type;
  q.Prompt = question.prompt;
  if (question.helpText) {
    q.HelpText = question.helpText;
  }
  q.IsRequired = question.isRequired ?? false;
  q.DisplayOrder = index;
  if (question.settings && Object.keys(question.settings).length > 0) {
    q.Settings = JSON.stringify(question.settings);
  }
  if (question.validationRule && Object.keys(question.validationRule).length > 0) {
    q.ValidationRule = JSON.stringify(question.validationRule);
  }
  q.ConditionalRule = conditionalRuleJSON(question.conditionalRule, idByKey, `Question "${question.prompt}"`);
  await saveRow(q, 'FormQuestion', { formId });
  return q;
}

/**
 * Create options for choice-style questions only. Non-choice questions never get options even if
 * the Designer mistakenly supplied them (defensive — the blueprint is validated for shape, but
 * type/option coherence is enforced here).
 */
async function createOptions(
  md: Metadata,
  formId: string,
  questionId: string,
  question: BlueprintQuestion,
  contextUser: UserInfo,
): Promise<{ count: number; imageTargets: ImageTargets['options'] }> {
  if (!CHOICE_QUESTION_TYPES.has(question.type) || !question.options?.length) {
    return { count: 0, imageTargets: [] };
  }
  let count = 0;
  const imageTargets: ImageTargets['options'] = [];
  for (let i = 0; i < question.options.length; i++) {
    const opt = question.options[i];
    const optEntity = await md.GetEntityObject<mjBizAppsFormsFormQuestionOptionEntity>(
      ENTITY.FormQuestionOption,
      contextUser,
    );
    optEntity.NewRecord();
    optEntity.QuestionID = questionId;
    // The label is NOT interpolated into the clamp notice: the only labels that reach it are the
    // over-long ones, so quoting the value writes the 900 characters into the log it is
    // complaining about. Position identifies it well enough to find.
    const where = `Option ${i + 1} of "${question.prompt}"`;
    optEntity.Label = clampText(opt.label, COLUMN_LIMITS.optionText, `${where} label`);
    optEntity.Value = clampText(opt.value ?? opt.label, COLUMN_LIMITS.optionText, `${where} value`);
    optEntity.DisplayOrder = i;
    optEntity.IsDefault = opt.isDefault ?? false;
    if (opt.imageURL) {
      optEntity.ImageURL = clampText(opt.imageURL, COLUMN_LIMITS.optionImageUrl, 'An option image URL');
    }
    if (opt.matrixAxis) {
      optEntity.MatrixAxis = opt.matrixAxis;
    }
    await saveRow(optEntity, 'FormQuestionOption', { formId });
    count++;
    if (opt.imagePrompt) {
      imageTargets.push({ optionId: optEntity.ID, label: opt.label, imagePrompt: opt.imagePrompt });
    }
  }
  return { count, imageTargets };
}

// --- Screens ---------------------------------------------------------------------

/**
 * Create the form's Welcome and Ending screens.
 *
 * Runs after every page so an ending's rule can reference any question — see the file header.
 * Returns how many screens were written.
 */
async function createScreens(
  md: Metadata,
  formId: string,
  blueprint: FormBlueprint,
  idByKey: QuestionIdByKey,
  imageTargets: ImageTargets,
  contextUser: UserInfo,
): Promise<number> {
  const screens = blueprint.screens;
  if (!screens) {
    return 0;
  }
  let count = 0;
  if (screens.welcome) {
    const screen = await createWelcomeScreen(md, formId, screens.welcome, contextUser);
    imageTargets.welcomeScreen = { screenId: screen.ID, imagePrompt: screens.welcome.imagePrompt };
    count++;
  }
  const endings = withExactlyOneDefault(screens.endings ?? []);
  for (let i = 0; i < endings.length; i++) {
    const screen = await createEndingScreen(md, formId, endings[i], i, idByKey, contextUser);
    imageTargets.endingScreens.push({
      screenId: screen.ID,
      title: endings[i].title,
      imagePrompt: endings[i].imagePrompt,
    });
    count++;
  }
  return count;
}

/**
 * Guarantee exactly one ending is the default — never zero, never two.
 *
 * Both wrong answers produce a form that submits and then shows nothing, which reads to a
 * respondent as a failed submission. With no default, `resolveEndingScreen` falls through to the
 * first UNCONDITIONAL ending, and a set where every ending is conditional has none — so a
 * respondent matching no rule sees the bare confirmation string. With two, resolution silently
 * takes whichever sorts first, so the author's second choice never appears and nothing says why.
 *
 * Forcing the first when the Designer marked none is deliberate rather than a coin toss: the
 * Designer writes endings in the order it wants them tried, so the first is the one it would have
 * picked. Pure — returns a new list and mutates nothing the caller holds.
 */
function withExactlyOneDefault(endings: readonly BlueprintEndingScreen[]): BlueprintEndingScreen[] {
  if (endings.length === 0) {
    return [];
  }
  const firstDefault = endings.findIndex((e) => e.isDefault);
  const chosen = firstDefault === -1 ? 0 : firstDefault;
  return endings.map((ending, index) => ({ ...ending, isDefault: index === chosen }));
}

async function createWelcomeScreen(
  md: Metadata,
  formId: string,
  welcome: BlueprintWelcomeScreen,
  contextUser: UserInfo,
): Promise<mjBizAppsFormsFormScreenEntity> {
  const screen = await newScreen(md, formId, 'Welcome', contextUser);
  screen.Title = clampText(welcome.title, COLUMN_LIMITS.screenTitle, "The welcome screen's title");
  applyScreenCopy(screen, welcome);
  screen.DisplayOrder = 0;
  // A Welcome is never chosen between and never the fallback for anything: `IsDefault` is an
  // Ending-only flag, so leaving it false keeps the row saying what it means.
  screen.IsDefault = false;
  await saveRow(screen, 'FormScreen (Welcome)', { formId });
  return screen;
}

async function createEndingScreen(
  md: Metadata,
  formId: string,
  ending: BlueprintEndingScreen,
  index: number,
  idByKey: QuestionIdByKey,
  contextUser: UserInfo,
): Promise<mjBizAppsFormsFormScreenEntity> {
  const screen = await newScreen(md, formId, 'Ending', contextUser);
  screen.Title = clampText(ending.title, COLUMN_LIMITS.screenTitle, `Ending ${index + 1}'s title`);
  applyScreenCopy(screen, ending);
  screen.DisplayOrder = index;
  screen.IsDefault = ending.isDefault === true;
  if (ending.redirectURL) {
    screen.RedirectURL = clampText(ending.redirectURL, COLUMN_LIMITS.screenUrl, `Ending ${index + 1}'s redirect URL`);
  }
  screen.ConditionalRule = conditionalRuleJSON(ending.conditionalRule, idByKey, `Ending ${index + 1}`);
  await saveRow(screen, 'FormScreen (Ending)', { formId });
  return screen;
}

async function newScreen(
  md: Metadata,
  formId: string,
  screenType: mjBizAppsFormsFormScreenEntity['ScreenType'],
  contextUser: UserInfo,
): Promise<mjBizAppsFormsFormScreenEntity> {
  const screen = await md.GetEntityObject<mjBizAppsFormsFormScreenEntity>(ENTITY.FormScreen, contextUser);
  screen.NewRecord();
  screen.FormID = formId;
  screen.ScreenType = screenType;
  return screen;
}

/** The copy both screen types share. `imagePrompt` is not written — the image stage fills MediaURL. */
function applyScreenCopy(
  screen: mjBizAppsFormsFormScreenEntity,
  source: BlueprintWelcomeScreen | BlueprintEndingScreen,
): void {
  if (source.body) {
    screen.Body = source.body;
  }
  if (source.buttonLabel) {
    screen.ButtonLabel = clampText(source.buttonLabel, COLUMN_LIMITS.screenButtonLabel, 'A screen button label');
  }
}

// --- Style -----------------------------------------------------------------------

/**
 * Create the per-form style row this draft will be pointed at, or `undefined` if it cannot be.
 *
 * BEST-EFFORT BY DESIGN. A theme is an enhancement, so a style row that will not save must not
 * discard a finished form — which is the failure this would otherwise cause more often than any
 * other row here, since `FormStyle.Name` is the only uniquely-constrained column the Builder
 * writes. The form simply lands unstyled, renders on the widget's defaults, and grows a style the
 * moment an author opens the Design tab: exactly what every form did before this existed.
 *
 * Created up front rather than only when there is a theme to write, so a generated form arrives in
 * the same state a hand-styled one does. The Design tab's `ensureOwnStyle` recognises a
 * `DisplayRank = 0` style already assigned to the form and edits it in place, instead of forking a
 * shared preset the first time the author touches a colour. `DisplayRank = 0` is the existing
 * marker for "belongs to one form" — it is what keeps this row out of the shared theme gallery.
 */
async function createStyle(
  md: Metadata,
  formName: string,
  contextUser: UserInfo,
): Promise<mjBizAppsFormsFormStyleEntity | undefined> {
  const style = await md.GetEntityObject<mjBizAppsFormsFormStyleEntity>(ENTITY.FormStyle, contextUser);
  style.NewRecord();
  const wanted = `${formName} theme`;
  style.Name = clampText(wanted, COLUMN_LIMITS.styleName, "The generated style's name");
  style.Description = 'Design for this form.';
  // Seeded with the house default rather than an empty map, so a generated form and a
  // hand-built one start from the same look. See `default-theme.ts`.
  style.CSSVariables = defaultThemeJSON();
  style.DisplayRank = 0;
  style.IsActive = true;
  try {
    await saveRow(style, 'FormStyle', { repair: renameOnCollision(wanted) });
    return style;
  } catch (error) {
    // Degraded, not swallowed: the reason is logged in full, the caller is told there is no style
    // by the undefined return, and the author still gets their form.
    LogError(
      `[Forms authoring] Could not create a style for "${formName}"; the form will use the ` +
        `widget defaults until its Design tab is opened. ${errorText(error)}`,
    );
    return undefined;
  }
}

function renameOnCollision(baseName: string) {
  return (style: mjBizAppsFormsFormStyleEntity, detail: string, attempt: number): boolean => {
    if (!isDuplicateKeyFailure(detail)) {
      return false;
    }
    style.Name = clampText(collisionName(baseName, style, attempt), COLUMN_LIMITS.styleName, "The generated style's name");
    return true;
  };
}

/**
 * The name to try next after a collision.
 *
 * The first retry appends `(2)`, which is what a person would do and what reads best in the theme
 * gallery. The LAST retry appends the row's own id instead, because counting up only survives as
 * many collisions as there are attempts — a tenant generating a fourth "Customer Feedback" form hit
 * the cap and lost their style entirely, which a smoke test found by running four times. The id is
 * assigned client-side before the insert, so it is available here and unique by construction.
 *
 * Falls back to counting when there is no id yet, so this degrades rather than producing `theme ()`.
 */
function collisionName(baseName: string, style: mjBizAppsFormsFormStyleEntity, attempt: number): string {
  const isLastChance = attempt >= MAX_PERSIST_ATTEMPTS - 1;
  const id = style.ID?.trim();
  if (isLastChance && id) {
    return `${baseName} (${id.slice(0, 8)})`;
  }
  return `${baseName} (${attempt + 1})`;
}

// --- Staged detail ---------------------------------------------------------------
//
// The second stage of a streamed build. The outline has already created this page and its
// questions as STUBS — real rows carrying only type and prompt — so the author sees the shape of
// the form within seconds. This fills those rows in and adds the options.
//
// OWNERSHIP IS SPLIT AND STAYS SPLIT: the outline owns page structure (title, description, page
// rule, how many questions and in what order), the detail owns question content. A detail pass
// that also rewrote page titles would let a prompt working from one page's stubs overwrite a
// decision made with the whole form in view — and produce a different title every time it retried.

/** What one detail pass changed. */
export interface PageDetailResult {
  questionsUpdated: number;
  /** Detailed questions with no stub to fill in. See {@link applyPageDetail} for when that happens. */
  questionsAdded: number;
  optionsAdded: number;
  /**
   * True when the read that decides which questions already have options FAILED.
   *
   * Reported rather than inferred from `optionsAdded === 0`, which is also what a page of free-text
   * questions produces. The two mean opposite things: one is a page that needed no choices, the
   * other is a page whose choice lists were silently dropped to avoid duplicating them.
   */
  optionsSkipped: boolean;
  /**
   * Options on this page that asked for a generated picture.
   *
   * A staged build's options are created HERE, not by the outline, so this is where their image
   * requests come from. A single-shot build collects them from the Builder instead.
   */
  optionImages: ImageTargets['options'];
}

/**
 * Fill in one page's stub questions from its detail blueprint, and add their options.
 *
 * MATCHING IS BY KEY FIRST, THEN BY POSITION, and the order of those two matters.
 *
 * Position alone was wrong, and wrong in the worst way. A key permanently names one row: the
 * outline mints `key -> questionId` and every conditional rule in the form resolves through that
 * map, forever. So a detail response that returned the same questions in a different order — which
 * a model is free to do — would write question B's content onto question A's row while every rule
 * naming A's key kept pointing at it. The form renders perfectly and one branch is silently gated
 * on the wrong answer, which is precisely the failure keys exist to prevent. Keyed questions are
 * therefore matched by KEY, which is the thing the prompt is actually told to preserve.
 *
 * Position remains the matcher for everything else, because most questions have no key — the
 * Designer is told to add one only where a rule needs it — and position is what still works when
 * the model rewords a prompt, which it is explicitly allowed to do. The two ways position can
 * disagree are both handled without losing anything:
 *
 *   - MORE detailed questions than stubs: the surplus is appended as new questions, past every
 *     stub's `DisplayOrder`. Which of the detailed questions gets created is not necessarily the
 *     last one — it is whichever UNKEYED question first finds no unreserved stub left, because
 *     keyed questions hold their rows. The count is what the invariant is about: a create happens
 *     exactly as often as the detail exceeds the stubs. A model that
 *     decided a page needed one more question has made an authoring judgement, and discarding it
 *     silently would be worse than keeping it.
 *   - FEWER: the un-detailed stubs are left exactly as the outline made them. A stub is already a
 *     valid question with a type and a prompt, so the page stays complete and the author sees a
 *     less-detailed question rather than a missing one.
 *
 * Safe to call twice: options are skipped for any question that already has them, so a retried
 * page cannot double its own choices.
 */
export async function applyPageDetail(
  formId: string,
  pageId: string,
  detail: BlueprintPage,
  idByKey: QuestionIdByKey,
  contextUser: UserInfo,
): Promise<PageDetailResult> {
  const md = new Metadata();
  const stubs = await loadPageQuestions(md, pageId, contextUser);
  const existingOptions = await loadQuestionsHavingOptions(stubs.map((q) => q.ID), contextUser);
  const questionsWithOptions = existingOptions.questionIds;

  const result: PageDetailResult = {
    questionsUpdated: 0,
    questionsAdded: 0,
    optionsAdded: 0,
    optionsSkipped: existingOptions.readFailed,
    optionImages: [],
  };
  const claim = stubClaimer(stubs, idByKey, detail.questions.map((q) => q.key));
  // APPENDED, past every stub. `createQuestion` stamps the `DisplayOrder` it is handed, and stubs
  // already hold 0..n-1 — so passing the DETAIL index put a new row on a number a stub still has.
  // That was unreachable while a create only happened after every stub was spent; it became
  // reachable when claiming started reserving stubs for keyed questions, since a create can now
  // occur while reserved stubs are still live. Nothing renumbers this page afterwards, and every
  // reader sorts on this column alone, so a tie is decided by the query plan and then frozen into
  // the published snapshot — the same intermittent reordering `apply-edits.ts` documents.
  let nextOrder = stubs.length;
  for (let i = 0; i < detail.questions.length; i++) {
    const detailed = detail.questions[i];
    const stub = claim(detailed.key);
    const question = stub
      ? await refineQuestion(stub, detailed, idByKey, formId)
      : await createQuestion(md, formId, pageId, detailed, nextOrder++, idByKey, contextUser);
    if (stub) {
      result.questionsUpdated++;
    } else {
      result.questionsAdded++;
    }
    if (!questionsWithOptions.has(question.ID)) {
      const created = await createOptions(md, formId, question.ID, detailed, contextUser);
      result.optionsAdded += created.count;
      result.optionImages.push(...created.imageTargets);
    }
  }
  return result;
}

/**
 * Hands out the stub each detailed question belongs to, by key where there is one.
 *
 * Stateful because a stub may be claimed only once: without that, two detailed questions naming
 * the same key would both refine the same row and one would be lost, and a keyed claim followed by
 * positional claims could hand the same row out twice. The closure is the smallest thing that can
 * hold "which stubs are still free" while the caller walks the detail list in order.
 *
 * Returns `undefined` when nothing is left to claim — the caller creates a new question, which is
 * the documented "more detailed questions than stubs" case.
 */
export function stubClaimer<T extends { ID: string }>(
  stubs: readonly T[],
  idByKey: QuestionIdByKey,
  detailKeys: ReadonlyArray<string | undefined>,
): (key: string | undefined) => T | undefined {
  const byId = new Map(stubs.map((stub) => [stub.ID, stub]));

  // RESERVED BEFORE ANYTHING IS HANDED OUT. Claiming used to be one pass in detail order, so an
  // UNKEYED question earlier in the list took the front of the queue — including the stub a later
  // KEYED question named. That keyed question then found its row already gone and fell through to
  // whatever was left, so its key landed on another question's row and every `conditionalRule`
  // naming it pointed at the wrong question. The model returning a page's questions in a different
  // order was enough to cause it, and the docstring above promised keys prevented precisely this.
  const reserved = new Set<string>();
  for (const key of detailKeys) {
    const id = key ? idByKey.get(key) : undefined;
    if (id && byId.has(id)) {
      reserved.add(id);
    }
  }
  // Positional claims may only take what no key has spoken for.
  const unclaimed = stubs.filter((stub) => !reserved.has(stub.ID));

  const take = (stub: T): T => {
    byId.delete(stub.ID);
    const at = unclaimed.indexOf(stub);
    if (at !== -1) {
      unclaimed.splice(at, 1);
    }
    return stub;
  };

  return (key) => {
    // A key that maps to a stub ON THIS PAGE wins outright. A key mapping elsewhere — the model
    // echoing another page's key — resolves to nothing here and correctly falls through.
    const keyed = key ? byId.get(idByKey.get(key) ?? '') : undefined;
    if (keyed) {
      return take(keyed);
    }
    // Only what no key has spoken for. When this is empty, everything still live is reserved for a
    // keyed claim that has not happened yet — reservations are built from the detail's own key
    // list, so each one HAS a pending claimant. Spending one here to avoid "wasting" it guarantees
    // that claimant finds nothing, which is the failure the reservation exists to prevent. The
    // caller creates a new question instead, which is the documented "more detailed questions than
    // stubs" case.
    return unclaimed.length > 0 ? take(unclaimed[0]) : undefined;
  };
}

/** This page's questions in display order, as savable entities. */
async function loadPageQuestions(
  md: Metadata,
  pageId: string,
  contextUser: UserInfo,
): Promise<mjBizAppsFormsFormQuestionEntity[]> {
  // The id is interpolated into a filter, and `applyPageDetail` is exported — so "it always comes
  // from the Builder's own return value" is an invariant nothing enforces. The GUID check IS the
  // injection guard (a value matching this pattern cannot carry a quote), which is the same
  // arrangement the asset route uses rather than a second escaping rule to keep right.
  assertGuid(pageId, 'page id');
  const view = await new RunView().RunView<mjBizAppsFormsFormQuestionEntity>(
    {
      EntityName: ENTITY.FormQuestion,
      ExtraFilter: `PageID='${pageId}'`,
      OrderBy: 'DisplayOrder',
      ResultType: 'entity_object',
    },
    contextUser,
  );
  if (!view.Success) {
    throw new FormPersistError(
      `Could not load page ${pageId}'s questions to fill them in: ${view.ErrorMessage ?? 'unknown error'}`,
    );
  }
  return view.Results ?? [];
}

/**
 * Reject anything that is not a GUID before it reaches a filter string.
 *
 * Throws rather than returning a flag: every caller here is mid-build with a form already created,
 * and a non-GUID id means a programming error upstream, not a data condition to route around.
 *
 * The SHAPE test is `isGuid` from the shared contract, not a regex of its own — a second copy of
 * that pattern is a second place for it to drift, and this file carried one. What stays local is
 * only the error TYPE: `FormPersistError` is what the persist layer's handling keys on, and the
 * shared `assertGuid` throws a plain `Error`.
 */
function assertGuid(value: string, what: string): void {
  if (!isGuid(value)) {
    throw new FormPersistError(`Refusing to query with a ${what} that is not a GUID: "${value}".`);
  }
}

/**
 * Which of these questions already carry options.
 *
 * One batched read rather than a per-question check, and the reason it exists at all is
 * idempotency: the outline creates no options, so on the normal path this set is empty and nothing
 * is skipped. It earns its keep only when a detail pass runs twice for the same page, where
 * without it a retry silently doubles every choice list.
 */
async function loadQuestionsHavingOptions(
  questionIds: readonly string[],
  contextUser: UserInfo,
): Promise<{ questionIds: Set<string>; readFailed: boolean }> {
  if (questionIds.length === 0) {
    return { questionIds: new Set(), readFailed: false };
  }
  for (const id of questionIds) {
    assertGuid(id, 'question id');
  }
  const view = await new RunView().RunView<{ QuestionID: string }>(
    {
      EntityName: ENTITY.FormQuestionOption,
      ExtraFilter: `QuestionID IN (${questionIds.map((id) => `'${id}'`).join(', ')})`,
      Fields: ['QuestionID'],
      ResultType: 'simple',
    },
    contextUser,
  );
  if (!view.Success) {
    // Fail closed toward NOT duplicating: an unreadable option list is treated as "options may
    // already exist", so a lost read costs a question its choices rather than doubling them. The
    // author can see a missing choice list; they cannot see a duplicated one that renders fine.
    //
    // `readFailed` is what carries that decision out to the run's degradation list. Without it the
    // choice lists vanished and the build still reported Ready — a single-select rendering as an
    // empty, unanswerable control, with the only trace in a server log.
    LogError(
      `[Forms authoring] Could not check which questions already have options ` +
        `(${view.ErrorMessage ?? 'unknown error'}); skipping option creation for this page to ` +
        'avoid duplicating them.',
    );
    return { questionIds: new Set(questionIds), readFailed: true };
  }
  return {
    questionIds: new Set((view.Results ?? []).map((row) => row.QuestionID)),
    readFailed: false,
  };
}

/** Apply a detailed question onto the stub row the outline created. */
async function refineQuestion(
  stub: mjBizAppsFormsFormQuestionEntity,
  detailed: BlueprintQuestion,
  idByKey: QuestionIdByKey,
  formId: string,
): Promise<mjBizAppsFormsFormQuestionEntity> {
  // Type and prompt are overwritten rather than preserved: the detail pass sees the same brief the
  // outline did plus one page's worth of focus, so its wording is the later and better-informed
  // judgement. Everything else here the stub simply did not have.
  stub.QuestionType = detailed.type;
  stub.Prompt = detailed.prompt;
  if (detailed.helpText) {
    stub.HelpText = detailed.helpText;
  }
  stub.IsRequired = detailed.isRequired ?? false;
  if (detailed.settings && Object.keys(detailed.settings).length > 0) {
    stub.Settings = JSON.stringify(detailed.settings);
  }
  if (detailed.validationRule && Object.keys(detailed.validationRule).length > 0) {
    stub.ValidationRule = JSON.stringify(detailed.validationRule);
  }
  stub.ConditionalRule = conditionalRuleJSON(
    detailed.conditionalRule,
    idByKey,
    `Question "${detailed.prompt}"`,
  );
  await saveRow(stub, 'FormQuestion (detail)', { formId });
  return stub;
}

// --- Media and theme write-back ---------------------------------------------------
//
// Both run AFTER the form is built and both are best-effort: a form is complete without them.
// They are here rather than in their stages because writing a row is the Builder's job and
// deciding what to write is the stage's.

/** Attach a generated image's URL to the option or screen that asked for it. */
export async function applyGeneratedImage(
  formId: string,
  target: { kind: 'option'; optionId: string } | { kind: 'screen'; screenId: string },
  url: string,
  contextUser: UserInfo,
): Promise<void> {
  const md = new Metadata();
  const clamped = clampText(url, COLUMN_LIMITS.optionImageUrl, 'A generated image URL');
  if (target.kind === 'option') {
    const option = await md.GetEntityObject<mjBizAppsFormsFormQuestionOptionEntity>(
      ENTITY.FormQuestionOption,
      contextUser,
    );
    if (!(await option.Load(target.optionId))) {
      throw new FormPersistError(`Could not load option ${target.optionId} to attach its image.`);
    }
    option.ImageURL = clamped;
    await saveRow(option, 'FormQuestionOption (image)', { formId });
    return;
  }
  const screen = await md.GetEntityObject<mjBizAppsFormsFormScreenEntity>(ENTITY.FormScreen, contextUser);
  if (!(await screen.Load(target.screenId))) {
    throw new FormPersistError(`Could not load screen ${target.screenId} to attach its image.`);
  }
  screen.MediaURL = clamped;
  await saveRow(screen, 'FormScreen (image)', { formId });
}

/**
 * Write a validated token map onto the form's style row.
 *
 * Writes to the style the Builder ALREADY created and linked, rather than creating one: the form
 * is pointed at it from its own insert, so a second row here would leave the first orphaned and
 * the form styled by whichever one won.
 */
export async function applyThemeTokens(
  formId: string,
  styleId: string,
  cssVariables: Record<string, string>,
  contextUser: UserInfo,
): Promise<void> {
  const md = new Metadata();
  const style = await md.GetEntityObject<mjBizAppsFormsFormStyleEntity>(ENTITY.FormStyle, contextUser);
  if (!(await style.Load(styleId))) {
    throw new FormPersistError(`Could not load style ${styleId} to apply the generated theme.`);
  }
  style.CSSVariables = JSON.stringify(cssVariables, null, 2);
  await saveRow(style, 'FormStyle (theme)', { formId });
}
