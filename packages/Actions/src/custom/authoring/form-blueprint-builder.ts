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
import { LogError, Metadata } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import {
  mjBizAppsFormsFormEntity,
  mjBizAppsFormsFormVersionEntity,
  mjBizAppsFormsFormPageEntity,
  mjBizAppsFormsFormQuestionEntity,
  mjBizAppsFormsFormQuestionOptionEntity,
  mjBizAppsFormsFormScreenEntity,
  mjBizAppsFormsFormStyleEntity,
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
import { COLUMN_LIMITS } from './limits';
import { clampText, FormPersistError, isDuplicateKeyFailure, saveRow } from './persist';

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

/** What the builder created — surfaced back to the calling action's output params. */
export interface BuiltFormResult {
  formId: string;
  formVersionId: string;
  pageCount: number;
  questionCount: number;
  optionCount: number;
  screenCount: number;
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
  let questionCount = 0;
  let optionCount = 0;
  for (let pageIndex = 0; pageIndex < blueprint.pages.length; pageIndex++) {
    const blueprintPage = blueprint.pages[pageIndex];
    const page = await createPage(md, formId, blueprintPage, pageIndex, idByKey, contextUser);
    const counts = await createQuestionsForPage(md, formId, page.ID, blueprintPage, idByKey, contextUser);
    questionCount += counts.questions;
    optionCount += counts.options;
  }

  const screenCount = await createScreens(md, formId, blueprint, idByKey, contextUser);

  return {
    formId,
    formVersionId: version.ID,
    pageCount: blueprint.pages.length,
    questionCount,
    optionCount,
    screenCount,
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
): Promise<{ questions: number; options: number }> {
  let optionCount = 0;
  for (let i = 0; i < page.questions.length; i++) {
    const question = await createQuestion(md, formId, pageId, page.questions[i], i, idByKey, contextUser);
    if (page.questions[i].key) {
      idByKey.set(page.questions[i].key as string, question.ID);
    }
    optionCount += await createOptions(md, formId, question.ID, page.questions[i], contextUser);
  }
  return { questions: page.questions.length, options: optionCount };
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
): Promise<number> {
  if (!CHOICE_QUESTION_TYPES.has(question.type) || !question.options?.length) {
    return 0;
  }
  let count = 0;
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
  }
  return count;
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
  contextUser: UserInfo,
): Promise<number> {
  const screens = blueprint.screens;
  if (!screens) {
    return 0;
  }
  let count = 0;
  if (screens.welcome) {
    await createWelcomeScreen(md, formId, screens.welcome, contextUser);
    count++;
  }
  const endings = withExactlyOneDefault(screens.endings ?? []);
  for (let i = 0; i < endings.length; i++) {
    await createEndingScreen(md, formId, endings[i], i, idByKey, contextUser);
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
): Promise<void> {
  const screen = await newScreen(md, formId, 'Welcome', contextUser);
  screen.Title = clampText(welcome.title, COLUMN_LIMITS.screenTitle, "The welcome screen's title");
  applyScreenCopy(screen, welcome);
  screen.DisplayOrder = 0;
  // A Welcome is never chosen between and never the fallback for anything: `IsDefault` is an
  // Ending-only flag, so leaving it false keeps the row saying what it means.
  screen.IsDefault = false;
  await saveRow(screen, 'FormScreen (Welcome)', { formId });
}

async function createEndingScreen(
  md: Metadata,
  formId: string,
  ending: BlueprintEndingScreen,
  index: number,
  idByKey: QuestionIdByKey,
  contextUser: UserInfo,
): Promise<void> {
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
  style.CSSVariables = JSON.stringify({});
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
        `widget defaults until its Design tab is opened. ${asText(error)}`,
    );
    return undefined;
  }
}

function renameOnCollision(baseName: string) {
  return (style: mjBizAppsFormsFormStyleEntity, detail: string, attempt: number): boolean => {
    if (!isDuplicateKeyFailure(detail)) {
      return false;
    }
    style.Name = clampText(`${baseName} (${attempt + 1})`, COLUMN_LIMITS.styleName, "The generated style's name");
    return true;
  };
}

function asText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
