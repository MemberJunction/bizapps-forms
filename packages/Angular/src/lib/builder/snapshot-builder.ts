import type {
  mjBizAppsFormsFormStyleEntity,
  FormStyleTokens,
  PublishedFormAutomation,
  PublishedFormDefinition,
  PublishedFormPage,
  PublishedFormQuestion,
  PublishedFormQuestionOption,
  PublishedFormScreen,
  FormRenderMode,
  mjBizAppsFormsFormScreenEntity,
} from '@mj-biz-apps/forms-entities';
import type { FormTree, PageNode, QuestionNode } from './builder-models';
import { withUniqueValues } from './option-labels';
import { endScreensOf, welcomeScreenOf } from './builder-models';
import {
  parseConditionalRule,
  parseValidationRule,
  parseQuestionSettings,
  parseFormSettings,
  buildStyleTokens,
} from './json-fields';

/**
 * Pure transform from the live builder tree to the immutable
 * {@link PublishedFormDefinition} stored in `FormVersion.DefinitionSnapshot` (the S1
 * contract). No I/O, no MJ services — so it is the unit-testable core of publish.
 *
 * Pages and questions are re-numbered to a dense 0-based `displayOrder` reflecting
 * their sorted position, so the snapshot order is canonical regardless of any gaps
 * in the stored DisplayOrder values.
 *
 * `styleTokensOverride` lets the builder's live Preview reflect UNSAVED theme edits: when
 * supplied it is used verbatim instead of deriving tokens from `style`.
 *
 * `automations` is REQUIRED rather than defaulted, because defaulting it is exactly how this
 * silently broke once: publish emitted a hardcoded empty array, every configured binding
 * therefore never fired, and nothing failed — the submit path simply fell back to the legacy
 * hook list. A caller that genuinely has none (the live Preview, which renders a form and runs
 * nothing) must now say so explicitly.
 */
export function buildPublishedDefinition(
  tree: FormTree,
  style: mjBizAppsFormsFormStyleEntity | undefined,
  formVersionId: string,
  automations: readonly PublishedFormAutomation[],
  styleTokensOverride?: FormStyleTokens,
): PublishedFormDefinition {
  const form = tree.form;
  return {
    formId: form.ID,
    formVersionId,
    name: form.Name,
    description: form.Description ?? undefined,
    renderMode: form.RenderMode as FormRenderMode,
    settings: parseFormSettings(form.Settings),
    styleTokens:
      styleTokensOverride ??
      buildStyleTokens(
        style?.CSSVariables ?? null,
        style?.CustomCSS ?? null,
        style?.LogoURL ?? null,
      ),
    pages: [...tree.pages]
      .sort((a, b) => a.entity.DisplayOrder - b.entity.DisplayOrder)
      .map((p, index) => buildPage(p, index)),
    // Emitted always, even when empty, so the snapshot a publish produces always matches the
    // contract a parse expects — the two sides are whitelists that strip anything the other adds
    // unilaterally, so a field present on one and absent on the other is silently lost rather
    // than loudly broken. An empty array is also what keeps an already-published form on the
    // legacy hook list, so it is a meaningful value rather than a placeholder.
    automations: [...automations],
    // Same reasoning, one level up: the welcome screen is OPTIONAL because absent genuinely means
    // "start on the first question", while the ending list is always emitted because empty and
    // absent resolve identically and a consumer should not have to tell them apart.
    welcomeScreen: buildWelcomeScreen(tree),
    endScreens: endScreensOf(tree).map(buildScreen),
  };
}

/**
 * Freeze one screen into the snapshot.
 *
 * `displayOrder` is re-derived from position rather than copied, matching how pages and questions
 * are renumbered above: ending resolution walks this list in order, so a gap left by a deleted
 * screen must not survive into the published form.
 */
function buildWelcomeScreen(tree: FormTree): PublishedFormScreen | undefined {
  const welcome = welcomeScreenOf(tree);
  return welcome ? buildScreen(welcome, 0) : undefined;
}

function buildScreen(
  screen: mjBizAppsFormsFormScreenEntity,
  displayOrder: number,
): PublishedFormScreen {
  const built: PublishedFormScreen = {
    id: screen.ID,
    screenType: screen.ScreenType,
    title: screen.Title,
    displayOrder,
  };
  if (screen.Body) {
    built.body = screen.Body;
  }
  if (screen.ButtonLabel) {
    built.buttonLabel = screen.ButtonLabel;
  }
  if (screen.MediaURL) {
    built.mediaURL = screen.MediaURL;
  }
  if (screen.RedirectURL) {
    built.redirectURL = screen.RedirectURL;
  }
  if (screen.IsDefault) {
    built.isDefault = true;
  }
  const conditional = parseConditionalRule(screen.ConditionalRule);
  if (conditional) {
    built.conditionalRule = conditional;
  }
  return built;
}

function buildPage(page: PageNode, displayOrder: number): PublishedFormPage {
  const result: PublishedFormPage = {
    id: page.entity.ID,
    displayOrder,
    questions: [...page.questions]
      .sort((a, b) => a.entity.DisplayOrder - b.entity.DisplayOrder)
      .map((q, index) => buildQuestion(q, index)),
  };
  if (page.entity.Title) {
    result.title = page.entity.Title;
  }
  if (page.entity.Description) {
    result.description = page.entity.Description;
  }
  if (page.entity.IsPartialSubmitPoint) {
    result.isPartialSubmitPoint = true;
  }
  const conditional = parseConditionalRule(page.entity.ConditionalRule);
  if (conditional) {
    result.conditionalRule = conditional;
  }
  return result;
}

function buildQuestion(node: QuestionNode, displayOrder: number): PublishedFormQuestion {
  const q = node.entity;
  const result: PublishedFormQuestion = {
    id: q.ID,
    type: q.QuestionType,
    prompt: q.Prompt,
    isRequired: q.IsRequired,
    displayOrder,
    options: buildOptions(node),
  };
  if (q.HelpText) {
    result.helpText = q.HelpText;
  }
  const conditional = parseConditionalRule(q.ConditionalRule);
  if (conditional) {
    result.conditionalRule = conditional;
  }
  const validation = parseValidationRule(q.ValidationRule);
  if (validation) {
    result.validationRule = validation;
  }
  const settings = parseQuestionSettings(q.Settings);
  if (Object.keys(settings).length > 0) {
    result.settings = settings;
  }
  return result;
}

/**
 * Publish a question's options in display order, with unique values.
 *
 * The uniqueness pass is not cosmetic. An option's value IS the respondent's answer, so two
 * options sharing a value are one answer wearing two labels: the widget highlighted both when
 * either was picked, and the response was indistinguishable afterwards. Deduping here rather
 * than in the widget is deliberate — the widget would only be papering over a definition that
 * was already ambiguous, and the ambiguity would survive into the stored response.
 */
function buildOptions(node: QuestionNode): PublishedFormQuestionOption[] {
  return withUniqueValues(buildRawOptions(node));
}

function buildRawOptions(node: QuestionNode): PublishedFormQuestionOption[] {
  return [...node.options]
    .sort((a, b) => a.DisplayOrder - b.DisplayOrder)
    .map((opt, index) => {
      const built: PublishedFormQuestionOption = {
        id: opt.ID,
        label: opt.Label,
        value: opt.Value ?? opt.Label,
        displayOrder: index,
      };
      if (opt.IsDefault) {
        built.isDefault = true;
      }
      if (opt.ImageURL) {
        built.imageURL = opt.ImageURL;
      }
      if (opt.MatrixAxis) {
        built.matrixAxis = opt.MatrixAxis;
      }
      return built;
    });
}
