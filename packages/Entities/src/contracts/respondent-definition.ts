/**
 * What an anonymous respondent's browser is allowed to know about a published form (#302).
 *
 * The respondent payload used to be the published snapshot minus its automations —
 * `{ ...definition, automations: [] }`. That is a DENYLIST: every key a later change added to the
 * snapshot shipped to every respondent by default, and by the time anyone looked, the browser held
 * the scoring table, every ending screen (which ones screen people out, and on what score), the
 * response quota and the post-submit redirect. A respondent who can read the scoring can game it;
 * one who can read the knockout can answer around it.
 *
 * {@link toRespondentDefinition} is the ALLOWLIST: it builds the projection field by field, so a
 * new snapshot field is absent until someone adds it here on purpose. {@link
 * PUBLISHED_DEFINITION_KEY_DECISIONS} records that decision for every top-level key, and is typed
 * so a new key fails the build until a decision is written down.
 *
 * What the widget keeps: the welcome screen, pages, questions (type, prompt, options, validation,
 * visibility and jump rules, per-type render settings), style tokens, the captcha flag and the
 * confirmation copy. What it loses, and therefore must get from the server instead: scoring, every
 * ending screen, score and knockout conditions, automations, quota, redirect and submit mode.
 * Which ending a respondent lands on is the server's call (`SaveResponse` returns it).
 *
 * THE PROJECTION MUST WALK THE SAME WAY. The widget settles visibility and validates over this
 * projection while the server does both over the full snapshot, and the two must reach the same
 * question set or the widget requires what the server never asks. So conditions are not simply
 * deleted — see {@link projectRule} for how each is folded so the walk is unchanged, and the spec
 * for the behavioural proof.
 */
import { z } from 'zod';
import type { ConditionalCondition, ConditionalGroup, ConditionalJumpRule, ConditionalRule } from './conditional-rule';
import type {
  FormRenderMode,
  FormStyleTokens,
  PublishedFormDefinition,
  PublishedFormPage,
  PublishedFormQuestion,
  PublishedFormQuestionOption,
  PublishedFormScreen,
} from './form-definition';
import type { JSONValue } from './json-value';
import { isFormQuestionType, type FormQuestionType } from './question-types';
import { conditionalRuleSchema, validationRuleSchema } from './schemas';

// --- Shape -------------------------------------------------------------------

/** An option as the respondent sees it — every published option field is a render field. */
export type RespondentFormQuestionOption = Pick<
  PublishedFormQuestionOption,
  'id' | 'label' | 'value' | 'displayOrder' | 'isDefault' | 'imageURL' | 'matrixAxis'
>;

/** A question as the respondent sees it: no `scoring`. */
export type RespondentFormQuestion = Pick<
  PublishedFormQuestion,
  'id' | 'type' | 'prompt' | 'helpText' | 'isRequired' | 'displayOrder' | 'conditionalRule' | 'validationRule' | 'settings'
> & { options: RespondentFormQuestionOption[] };

/** A page as the respondent sees it. */
export type RespondentFormPage = Pick<
  PublishedFormPage,
  'id' | 'title' | 'description' | 'displayOrder' | 'isPartialSubmitPoint' | 'conditionalRule'
> & { questions: RespondentFormQuestion[] };

/** The welcome screen: its copy only — conditions, defaults and redirects are ending-screen fields. */
export type RespondentWelcomeScreen = Pick<PublishedFormScreen, 'id' | 'title' | 'body' | 'buttonLabel' | 'mediaURL' | 'displayOrder'> & {
  screenType: 'Welcome';
};

/** The respondent projection of a published form. */
export interface RespondentFormDefinition {
  formId: string;
  formVersionId: string;
  name: string;
  description?: string;
  renderMode: FormRenderMode;
  /** Whether a Turnstile challenge must be solved before a final submit. */
  captchaRequired: boolean;
  /** Shown after a submit that lands on no ending screen. Copy every respondent sees anyway. */
  confirmationMessage?: string;
  styleTokens: FormStyleTokens;
  welcomeScreen?: RespondentWelcomeScreen;
  pages: RespondentFormPage[];
}

/** What happens to one top-level snapshot key in the projection. */
export type RespondentKeyDecision = 'kept' | 'reduced' | 'excluded';

/**
 * The decision for EVERY top-level {@link PublishedFormDefinition} key.
 *
 * `Record<keyof PublishedFormDefinition, …>` is the point: adding a key to the snapshot without
 * adding it here fails the build, so "may respondents see this?" is asked at the moment the field
 * is invented rather than discovered in a payload later. `reduced` means projected field by field.
 */
export const PUBLISHED_DEFINITION_KEY_DECISIONS: Readonly<Record<keyof PublishedFormDefinition, RespondentKeyDecision>> = {
  formId: 'kept',
  formVersionId: 'kept',
  name: 'kept',
  description: 'kept',
  renderMode: 'kept',
  // Only `captchaRequired` and `confirmationMessage`, lifted to the top level. `quota`,
  // `redirectUrl`, `opensAt`/`closesAt` and `onSubmitMode` are enforced or acted on by the server;
  // `anonymousAllowed` is access policy the server applies before the payload is built.
  settings: 'reduced',
  styleTokens: 'kept',
  // Questions lose `scoring` and every settings key not in `RESPONDENT_SETTING_KEYS`; rules lose
  // score and knockout conditions (see `projectRule`); items no respondent can ever see are
  // dropped (see `pruneNeverShown`).
  pages: 'reduced',
  automations: 'excluded',
  welcomeScreen: 'reduced',
  endScreens: 'excluded',
};

/**
 * The per-question `settings` keys a respondent's browser receives, per question type — the keys
 * the widget actually renders with, and nothing else.
 *
 * `settings` is an open JSON bag that the builder, the AI designer and a paste can all write, so it
 * is allowlisted like everything else in the projection rather than copied. `Record<FormQuestionType,
 * …>` makes a new question type a build failure until its keys are decided, and forms-ng's
 * `question-settings.spec.ts` fails when the builder offers a key that is not listed here.
 *
 * `Date` and `Time` keep `placeholder` although the builder offers none: the widget's default text
 * input reads it, so a placeholder written by the AI designer still renders. `Number`'s `min`/`max`
 * (which starter templates write) are deliberately absent — nothing in the widget reads them; range
 * enforcement is the `validationRule`'s job.
 */
export const RESPONDENT_SETTING_KEYS: Readonly<Record<FormQuestionType, readonly string[]>> = {
  ShortText: ['placeholder'],
  LongText: ['placeholder', 'rows'],
  Email: ['placeholder'],
  Phone: ['placeholder'],
  Website: ['placeholder'],
  Number: ['placeholder'],
  SingleChoice: [],
  MultiChoice: [],
  Dropdown: [],
  PictureChoice: [],
  Rating: ['max'],
  NPS: [],
  OpinionScale: ['min', 'max', 'labelMin', 'labelMax'],
  Ranking: [],
  Matrix: [],
  YesNo: [],
  Checkbox: ['placeholder'],
  Legal: ['terms'],
  Date: ['placeholder'],
  Time: ['placeholder'],
  Address: [],
  ContactInfo: [],
  FileUpload: ['accept'],
  Doodle: ['penColor', 'penWidth', 'penControls'],
  Statement: [],
};

// --- Projection --------------------------------------------------------------

/**
 * A question id no answer map ever carries, used to spell "never true" in a show group.
 *
 * The rule language has no constant `false`, and the projection sometimes needs one (see
 * {@link foldScoreConditions}). `isAnswered` on an id nothing answers is false for every
 * respondent on both sides of the wire — which is exactly what the score condition it replaces
 * evaluated to — and the reserved prefix keeps it from colliding with a real question id (GUIDs).
 */
export const NEVER_ANSWERED_QUESTION_ID = '__mjf-never-answered__';

const NEVER: ConditionalGroup = { all: [{ questionId: NEVER_ANSWERED_QUESTION_ID, op: 'isAnswered' }] };

/** Build the respondent projection of a published form. Pure. */
export function toRespondentDefinition(published: PublishedFormDefinition): RespondentFormDefinition {
  const knockoutEndings = new Set(
    (published.endScreens ?? []).filter((screen) => screen.isDisqualification === true).map((screen) => screen.id),
  );
  const projection: RespondentFormDefinition = {
    formId: published.formId,
    formVersionId: published.formVersionId,
    name: published.name,
    renderMode: published.renderMode,
    captchaRequired: published.settings.captchaRequired === true,
    styleTokens: projectStyleTokens(published.styleTokens),
    pages: pruneNeverShown(published.pages.map((page) => projectPage(page, knockoutEndings))),
  };
  if (published.description !== undefined) {
    projection.description = published.description;
  }
  if (published.settings.confirmationMessage !== undefined) {
    projection.confirmationMessage = published.settings.confirmationMessage;
  }
  if (published.welcomeScreen) {
    projection.welcomeScreen = projectWelcomeScreen(published.welcomeScreen);
  }
  return projection;
}

function projectStyleTokens(tokens: FormStyleTokens): FormStyleTokens {
  const projected: FormStyleTokens = { cssVariables: { ...tokens.cssVariables } };
  if (tokens.customCSS !== undefined) {
    projected.customCSS = tokens.customCSS;
  }
  if (tokens.logoURL !== undefined) {
    projected.logoURL = tokens.logoURL;
  }
  return projected;
}

function projectWelcomeScreen(screen: PublishedFormScreen): RespondentWelcomeScreen {
  const projected: RespondentWelcomeScreen = {
    id: screen.id,
    screenType: 'Welcome',
    title: screen.title,
    displayOrder: screen.displayOrder,
  };
  if (screen.body !== undefined) {
    projected.body = screen.body;
  }
  if (screen.buttonLabel !== undefined) {
    projected.buttonLabel = screen.buttonLabel;
  }
  if (screen.mediaURL !== undefined) {
    projected.mediaURL = screen.mediaURL;
  }
  return projected;
}

function projectPage(page: PublishedFormPage, knockoutEndings: ReadonlySet<string>): RespondentFormPage {
  const projected: RespondentFormPage = {
    id: page.id,
    displayOrder: page.displayOrder,
    questions: page.questions.map((question) => projectQuestion(question, knockoutEndings)),
  };
  if (page.title !== undefined) {
    projected.title = page.title;
  }
  if (page.description !== undefined) {
    projected.description = page.description;
  }
  if (page.isPartialSubmitPoint !== undefined) {
    projected.isPartialSubmitPoint = page.isPartialSubmitPoint;
  }
  const rule = projectRule(page.conditionalRule, knockoutEndings);
  if (rule) {
    projected.conditionalRule = rule;
  }
  return projected;
}

function projectQuestion(question: PublishedFormQuestion, knockoutEndings: ReadonlySet<string>): RespondentFormQuestion {
  const projected: RespondentFormQuestion = {
    id: question.id,
    type: question.type,
    prompt: question.prompt,
    isRequired: question.isRequired,
    displayOrder: question.displayOrder,
    options: question.options.map(projectOption),
  };
  if (question.helpText !== undefined) {
    projected.helpText = question.helpText;
  }
  if (question.validationRule !== undefined) {
    projected.validationRule = { ...question.validationRule };
  }
  const settings = renderSettings(question);
  if (settings) {
    projected.settings = settings;
  }
  const rule = projectRule(question.conditionalRule, knockoutEndings);
  if (rule) {
    projected.conditionalRule = rule;
  }
  return projected;
}

/** The question's settings restricted to {@link RESPONDENT_SETTING_KEYS}, or none when nothing is left. */
function renderSettings(question: PublishedFormQuestion): Record<string, JSONValue> | undefined {
  const kept: Record<string, JSONValue> = {};
  for (const key of RESPONDENT_SETTING_KEYS[question.type] ?? []) {
    const value = question.settings?.[key];
    if (value !== undefined) {
      kept[key] = value;
    }
  }
  return Object.keys(kept).length > 0 ? kept : undefined;
}

/**
 * Remove what no respondent can ever see — without moving where the walk goes.
 *
 * A show rule that folds to never-true ({@link foldScoreConditions}) hides its item from everyone,
 * so shipping its prompt, help text and options only hands the browser copy nobody was meant to
 * read. Such questions, and pages hidden the same way, are dropped. A page whose every question was
 * dropped goes too, unless it carries a `Go to` of its own (that fires when the page is left, so the
 * page must stay to be left).
 *
 * The one thing that must survive is a JUMP TARGET. The walk lands on a target's position and
 * carries on from there; a target that no longer exists makes the jump inert, so the respondent
 * would be asked questions the server skips. A never-visible item a live jump points at therefore
 * stays as a copy-less stub — id, position, a never-true show rule, nothing to read.
 */
function pruneNeverShown(pages: RespondentFormPage[]): RespondentFormPage[] {
  const targeted = liveJumpTargets(pages);
  const kept: RespondentFormPage[] = [];
  for (const page of pages) {
    const pageNever = isNeverShown(page.conditionalRule);
    const questions = page.questions.flatMap((question) => {
      if (!pageNever && !isNeverShown(question.conditionalRule)) {
        return [question];
      }
      return targeted.has(question.id) ? [stubQuestion(question)] : [];
    });
    if (pageNever) {
      if (targeted.has(page.id) || questions.length > 0) {
        kept.push({ id: page.id, displayOrder: page.displayOrder, conditionalRule: { show: NEVER }, questions });
      }
      continue;
    }
    const leftEmpty = page.questions.length > 0 && questions.length === 0;
    if (leftEmpty && !targeted.has(page.id) && !page.conditionalRule?.jump) {
      continue;
    }
    kept.push({ ...page, questions });
  }
  return kept;
}

/**
 * Whether a projected rule's show group is the never-true group {@link projectRule} wrote.
 *
 * By identity, deliberately: only a group this module folded is known to be never-true for EVERY
 * respondent. An authored rule that happens to read as false for everyone is left alone.
 */
function isNeverShown(rule: ConditionalRule | undefined): boolean {
  return rule?.show === NEVER;
}

/** Every page or question id a `Go to` on an item that can be shown points at. */
function liveJumpTargets(pages: readonly RespondentFormPage[]): Set<string> {
  const ids = new Set<string>();
  const collect = (rule: ConditionalRule | undefined): void => {
    for (const jump of rule?.jump ?? []) {
      if (jump.target.kind === 'page' || jump.target.kind === 'question') {
        ids.add(jump.target.id);
      }
    }
  };
  for (const page of pages) {
    if (isNeverShown(page.conditionalRule)) {
      continue; // a hidden page's stops never run, so nothing on it can fire
    }
    collect(page.conditionalRule);
    for (const question of page.questions) {
      if (!isNeverShown(question.conditionalRule)) {
        collect(question.conditionalRule);
      }
    }
  }
  return ids;
}

/** A never-visible jump target, reduced to its place in the walk. */
function stubQuestion(question: RespondentFormQuestion): RespondentFormQuestion {
  return {
    id: question.id,
    type: question.type,
    prompt: '',
    isRequired: false,
    displayOrder: question.displayOrder,
    options: [],
    conditionalRule: { show: NEVER },
  };
}

function projectOption(option: PublishedFormQuestionOption): RespondentFormQuestionOption {
  const projected: RespondentFormQuestionOption = {
    id: option.id,
    label: option.label,
    value: option.value,
    displayOrder: option.displayOrder,
  };
  if (option.isDefault !== undefined) {
    projected.isDefault = option.isDefault;
  }
  if (option.imageURL !== undefined) {
    projected.imageURL = option.imageURL;
  }
  if (option.matrixAxis !== undefined) {
    projected.matrixAxis = option.matrixAxis;
  }
  return projected;
}

/**
 * A page or question rule with its score and knockout conditions removed — WITHOUT changing the
 * walk for any respondent the server would not end the form for.
 *
 *  - A SCORE condition is folded, not deleted ({@link foldScoreConditions}): visibility is decided
 *    with no score, so it is a constant `false` on both sides, and the fold keeps that verdict.
 *  - A jump to a KNOCKOUT ending (`isDisqualification`) is dropped. When it fires, the server ends
 *    the form and says so; until then it changes nothing, so the walk is the same.
 *  - A jump to any other ending is retargeted to `submit`. Both are terminal in the walk, so the
 *    respondent is still not asked what follows — but the projection no longer names the screen.
 *
 * Returns `undefined` when nothing is left of the rule.
 */
function projectRule(
  rule: ConditionalRule | undefined,
  knockoutEndings: ReadonlySet<string>,
): ConditionalRule | undefined {
  if (!rule) {
    return undefined;
  }
  const projected: ConditionalRule = {};
  if (rule.show) {
    const show = foldScoreConditions(rule.show);
    projected.show = show === 'never' ? NEVER : show;
  }
  const jumps = (rule.jump ?? []).flatMap((jump) => projectJump(jump, knockoutEndings));
  if (jumps.length > 0) {
    projected.jump = jumps;
  }
  return projected.show || projected.jump ? projected : undefined;
}

function projectJump(jump: ConditionalJumpRule, knockoutEndings: ReadonlySet<string>): ConditionalJumpRule[] {
  if (jump.target.kind === 'ending' && knockoutEndings.has(jump.target.id)) {
    return [];
  }
  const when = foldScoreConditions(jump.when);
  if (when === 'never') {
    return []; // a jump that can never fire changes nothing by not being there
  }
  return [{ when, target: jump.target.kind === 'ending' ? { kind: 'submit' } : { ...jump.target } }];
}

/**
 * A group with its score conditions folded away, or `'never'` when the group can never pass.
 *
 * Every score condition evaluates `false` while visibility is decided (no score is known yet), so:
 * an `all` holding one can never pass; an `any` passes iff one of its OTHER conditions does —
 * and an `any` that held only score conditions can never pass. That last case is why the
 * conditions cannot simply be filtered out: an emptied `any` is vacuously TRUE.
 */
function foldScoreConditions(group: ConditionalGroup): ConditionalGroup | 'never' {
  const isScore = (condition: ConditionalCondition): boolean => condition.source === 'score';
  if (group.all?.some(isScore)) {
    return 'never';
  }
  const folded: ConditionalGroup = {};
  if (group.all) {
    folded.all = group.all.map((condition) => ({ ...condition }));
  }
  if (group.any) {
    const kept = group.any.filter((condition) => !isScore(condition));
    if (group.any.length > 0 && kept.length === 0) {
      return 'never';
    }
    folded.any = kept.map((condition) => ({ ...condition }));
  }
  return folded;
}

// --- Schema ------------------------------------------------------------------

const jsonValueSchema: z.ZodType<JSONValue> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(jsonValueSchema)]),
);

const questionTypeSchema = z.custom<FormQuestionType>((value) => isFormQuestionType(value), {
  message: 'not a known question type',
});

const optionSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.string(),
  displayOrder: z.number(),
  isDefault: z.boolean().optional(),
  imageURL: z.string().optional(),
  matrixAxis: z.enum(['Row', 'Column']).optional(),
});

const questionSchema = z.object({
  id: z.string(),
  type: questionTypeSchema,
  prompt: z.string(),
  helpText: z.string().optional(),
  isRequired: z.boolean(),
  displayOrder: z.number(),
  conditionalRule: conditionalRuleSchema.optional(),
  validationRule: validationRuleSchema.optional(),
  settings: z.record(jsonValueSchema).optional(),
  options: z.array(optionSchema),
});

const pageSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  displayOrder: z.number(),
  isPartialSubmitPoint: z.boolean().optional(),
  conditionalRule: conditionalRuleSchema.optional(),
  questions: z.array(questionSchema),
});

const welcomeScreenSchema = z.object({
  id: z.string(),
  screenType: z.literal('Welcome'),
  title: z.string(),
  body: z.string().optional(),
  buttonLabel: z.string().optional(),
  mediaURL: z.string().optional(),
  displayOrder: z.number(),
});

/**
 * The schema the widget parses the respondent payload with.
 *
 * Unknown keys are STRIPPED, not refused: the widget is served by the same server that builds the
 * payload, so a key it does not know is a server ahead of an old cached bundle, and the right
 * reaction is to ignore it. A smuggled `automations` therefore never reaches the widget's model.
 */
export const respondentFormDefinitionSchema = z.object({
  formId: z.string(),
  formVersionId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  renderMode: z.enum(['Scroll', 'OneQuestion']),
  captchaRequired: z.boolean(),
  confirmationMessage: z.string().optional(),
  styleTokens: z.object({
    cssVariables: z.record(z.string()),
    customCSS: z.string().optional(),
    logoURL: z.string().optional(),
  }),
  welcomeScreen: welcomeScreenSchema.optional(),
  pages: z.array(pageSchema),
});

// Fails `tsc` if the schema and the interface drift in either direction — the same one-tuple guard
// `schemas.ts` uses (the bare conditional distributes over unions and passes vacuously).
type AssertExtends<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const _respondentMatch: AssertExtends<z.infer<typeof respondentFormDefinitionSchema>, RespondentFormDefinition> = true;
void _respondentMatch;
