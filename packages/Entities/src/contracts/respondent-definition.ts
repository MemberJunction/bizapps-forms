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
 * This module is the projection's SHAPE and the zod schema the widget parses it with — the half that
 * ships to respondents. The projection BUILDER (`toRespondentDefinition`, the key decisions, the
 * settings allowlist) is in `respondent-projection.ts`, which only the server and Preview-side code
 * run; the widget bundle guard keeps it out of `<mj-form>` (#303 Task 10c fix round 1).
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
 * deleted — see `projectRule` in `respondent-projection.ts` for how each is folded so the walk is unchanged, and the spec
 * for the behavioural proof.
 */
import { z } from 'zod';
import type {
  FormRenderMode,
  FormStyleTokens,
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
