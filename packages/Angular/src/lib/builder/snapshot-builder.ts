import type {
  mjBizAppsFormsFormStyleEntity,
  FormStyleTokens,
  PublishedFormAutomation,
  PublishedFormDefinition,
  PublishedFormPage,
  PublishedFormQuestion,
  PublishedFormQuestionOption,
  FormRenderMode,
} from '@mj-biz-apps/forms-entities';
import type { FormTree, PageNode, QuestionNode } from './builder-models';
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
  };
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

function buildOptions(node: QuestionNode): PublishedFormQuestionOption[] {
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
      return built;
    });
}
