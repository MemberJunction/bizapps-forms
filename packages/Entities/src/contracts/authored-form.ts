/**
 * The AUTHORED form — the rows an author edits — as the shape every reader of a draft takes.
 *
 * Two very different callers read a draft: the builder, which holds live `BaseEntity` objects it
 * mutates and saves, and the server, which loads `simple` rows to publish them. Both must turn a
 * draft into the same published snapshot and judge it with the same rule-integrity gate, so the
 * snapshot builder and the gate take THIS structural shape rather than either caller's own.
 *
 * Every field type is derived from the generated entity with `Pick` rather than restated, the
 * precedent being {@link AuthoredAutomationRow}: the value-list unions (`QuestionType`,
 * `ScreenType`, `RenderMode`, `MatrixAxis`) keep tracking their CHECK constraints, and a column
 * renamed by a migration fails the build here instead of arriving as `undefined`. A live entity
 * satisfies each row type structurally (its getters ARE these properties), so the builder passes
 * its own tree straight through with no adapter.
 *
 * The node shape (`{ entity, questions }` / `{ entity, options }`) is the builder's existing
 * tree shape on purpose: it is the shape the builder already holds, and a second shape would need
 * a translation layer on the one side that runs on every keystroke (live preview).
 *
 * `import type` only — the widget bundle may import contracts but never the generated entity
 * classes, and type imports are erased at compile time.
 */
import type {
  mjBizAppsFormsFormEntity,
  mjBizAppsFormsFormPageEntity,
  mjBizAppsFormsFormQuestionEntity,
  mjBizAppsFormsFormQuestionOptionEntity,
  mjBizAppsFormsFormScreenEntity,
  mjBizAppsFormsFormStyleEntity,
} from '../generated/entity_subclasses';

/** The `Form` columns publish and the rule gate read. */
export type AuthoredFormRow = Pick<
  mjBizAppsFormsFormEntity,
  'ID' | 'Name' | 'Description' | 'RenderMode' | 'Settings'
>;

/** The `FormStyle` columns that become the snapshot's style tokens. */
export type AuthoredStyleRow = Pick<mjBizAppsFormsFormStyleEntity, 'CSSVariables' | 'CustomCSS' | 'LogoURL'>;

/** The `FormPage` columns publish and the rule gate read. */
export type AuthoredPageRow = Pick<
  mjBizAppsFormsFormPageEntity,
  'ID' | 'Title' | 'Description' | 'DisplayOrder' | 'IsPartialSubmitPoint' | 'ConditionalRule'
>;

/** The `FormQuestion` columns publish and the rule gate read. */
export type AuthoredQuestionRow = Pick<
  mjBizAppsFormsFormQuestionEntity,
  | 'ID'
  | 'QuestionType'
  | 'Prompt'
  | 'HelpText'
  | 'IsRequired'
  | 'DisplayOrder'
  | 'ConditionalRule'
  | 'ValidationRule'
  | 'ScoringConfig'
  | 'Settings'
>;

/** The `FormQuestionOption` columns publish and the condition editor read. */
export type AuthoredOptionRow = Pick<
  mjBizAppsFormsFormQuestionOptionEntity,
  'ID' | 'Label' | 'Value' | 'DisplayOrder' | 'IsDefault' | 'ImageURL' | 'MatrixAxis'
>;

/** The `FormScreen` columns publish and the rule gate read. */
export type AuthoredScreenRow = Pick<
  mjBizAppsFormsFormScreenEntity,
  | 'ID'
  | 'ScreenType'
  | 'Title'
  | 'Body'
  | 'ButtonLabel'
  | 'MediaURL'
  | 'RedirectURL'
  | 'DisplayOrder'
  | 'ConditionalRule'
  | 'IsDefault'
  | 'IsDisqualification'
  | 'SocialLinks'
>;

/**
 * The `Fields` lists a `simple` RunView must ask for to build each row type.
 *
 * Exported for the same reason as `AUTHORED_AUTOMATION_FIELDS`: a `simple` RunView returns only
 * the fields it was asked for, so a column missing from the query arrives as `undefined` and is
 * published as a silently wrong value. `satisfies` ties each list to its row type, so a field
 * added to a `Pick` above and not here fails the build.
 */
export const AUTHORED_FORM_FIELDS = ['ID', 'Name', 'Description', 'RenderMode', 'Settings'] as const satisfies readonly (keyof AuthoredFormRow)[];
export const AUTHORED_STYLE_FIELDS = ['CSSVariables', 'CustomCSS', 'LogoURL'] as const satisfies readonly (keyof AuthoredStyleRow)[];
export const AUTHORED_PAGE_FIELDS = [
  'ID', 'Title', 'Description', 'DisplayOrder', 'IsPartialSubmitPoint', 'ConditionalRule',
] as const satisfies readonly (keyof AuthoredPageRow)[];
export const AUTHORED_QUESTION_FIELDS = [
  'ID', 'QuestionType', 'Prompt', 'HelpText', 'IsRequired', 'DisplayOrder',
  'ConditionalRule', 'ValidationRule', 'ScoringConfig', 'Settings',
] as const satisfies readonly (keyof AuthoredQuestionRow)[];
export const AUTHORED_OPTION_FIELDS = [
  'ID', 'Label', 'Value', 'DisplayOrder', 'IsDefault', 'ImageURL', 'MatrixAxis',
] as const satisfies readonly (keyof AuthoredOptionRow)[];
export const AUTHORED_SCREEN_FIELDS = [
  'ID', 'ScreenType', 'Title', 'Body', 'ButtonLabel', 'MediaURL', 'RedirectURL',
  'DisplayOrder', 'ConditionalRule', 'IsDefault', 'IsDisqualification', 'SocialLinks',
] as const satisfies readonly (keyof AuthoredScreenRow)[];

/** A question with its options. */
export interface AuthoredQuestionNode {
  readonly entity: AuthoredQuestionRow;
  readonly options: readonly AuthoredOptionRow[];
}

/** A page with its questions. */
export interface AuthoredPageNode {
  readonly entity: AuthoredPageRow;
  readonly questions: readonly AuthoredQuestionNode[];
}

/**
 * A whole draft.
 *
 * `screens` sits BESIDE `pages`, not inside it: a screen has no page, no position among
 * questions and no answer, so no helper that walks questions can reach one by accident.
 */
export interface AuthoredFormTree {
  readonly form: AuthoredFormRow;
  readonly pages: readonly AuthoredPageNode[];
  readonly screens: readonly AuthoredScreenRow[];
}

/**
 * The single Welcome screen, if the draft has one.
 *
 * Generic so a caller holding live entities gets live entities back — the builder edits what
 * this returns.
 */
export function welcomeScreenOf<S extends Pick<AuthoredScreenRow, 'ScreenType'>>(
  tree: { readonly screens: readonly S[] },
): S | undefined {
  return tree.screens.find((s) => s.ScreenType === 'Welcome');
}

/** The Ending screens in display order. Generic for the same reason as {@link welcomeScreenOf}. */
export function endScreensOf<S extends Pick<AuthoredScreenRow, 'ScreenType' | 'DisplayOrder'>>(
  tree: { readonly screens: readonly S[] },
): S[] {
  return tree.screens
    .filter((s) => s.ScreenType === 'Ending')
    .sort((a, b) => a.DisplayOrder - b.DisplayOrder);
}

/** Every question across all pages, in the order the pages hold them. */
export function allQuestions<Q>(tree: { readonly pages: readonly { readonly questions: readonly Q[] }[] }): Q[] {
  return tree.pages.flatMap((page) => [...page.questions]);
}
