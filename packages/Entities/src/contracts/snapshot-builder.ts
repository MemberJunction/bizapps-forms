import type {
  FormSettings,
  FormStyleTokens,
  PublishedFormAutomation,
  PublishedFormDefinition,
  PublishedFormPage,
  PublishedFormQuestion,
  PublishedFormQuestionOption,
  PublishedFormScreen,
} from './form-definition';
import type { ConditionalRule, ValidationRule } from './conditional-rule';
import {
  endScreensOf,
  welcomeScreenOf,
  type AuthoredFormTree,
  type AuthoredPageNode,
  type AuthoredQuestionNode,
  type AuthoredScreenRow,
  type AuthoredStyleRow,
} from './authored-form';
import { publishedOptionIdentities } from './option-labels';
import {
  buildStyleTokens,
  parseQuestionSettings,
  readStoredConditionalRule,
  readStoredFormSettings,
  readStoredValidationRule,
  type StoredColumnRead,
} from './stored-columns';
import { parseQuestionScoring } from './scoring';
import { parseSocialLinks } from './social-links';
import { mapDefinitionAssets, toAssetRef } from './asset-ref';

/**
 * Pure transform from an authored draft to the immutable {@link PublishedFormDefinition} stored in
 * `FormVersion.DefinitionSnapshot` (the S1 contract). No I/O, no MJ services — so it is the
 * unit-testable core of publish, and the ONE implementation of it: the builder calls it for the
 * live Preview and the draft/publish fingerprint, the server calls it to publish. It lives in the
 * contracts rather than the builder because two copies of "what a draft publishes as" can only
 * ever drift.
 *
 * Takes {@link AuthoredFormTree} — structural rows, not live entities — so the builder passes its
 * own entity tree and the server passes `simple` RunView rows, with no adapter on either side.
 *
 * REFUSES A RULE IT CANNOT READ. Every rule column is read through the zod schemas, and one that
 * fails throws {@link UnreadableColumnError}, naming the item. It used to be cast through unchecked, frozen into the immutable
 * snapshot, and then dropped by the server's parser on every public load — which for a show rule
 * made the guarded item visible to everyone, with nothing anywhere to say so. The builder's rule
 * gate (`brokenRuleLines`) reports the same column as broken first, so an author meets this as a
 * badge rather than as a failed publish.
 *
 * Pages and questions are re-numbered to a dense 0-based `displayOrder` reflecting
 * their sorted position, so the snapshot order is canonical regardless of any gaps
 * in the stored DisplayOrder values.
 *
 * `styleTokensOverride` lets the builder's live Preview reflect UNSAVED theme edits: when
 * supplied it replaces the tokens derived from `style`, and — like every other asset reference in
 * the snapshot — its uploaded-image URLs are relativised to `/forms/asset/<id>` (#270). Every
 * non-asset value in it is kept as given.
 *
 * `settingsOverride` is the mirror image and exists for the opposite reason: publish must NOT
 * trust the tree, because the Automate tab writes `Form.Settings` through its own entity and the
 * builder's copy never learns about it.
 *
 * `automations` is REQUIRED rather than defaulted, because defaulting it is exactly how this
 * silently broke once: publish emitted a hardcoded empty array, every configured binding
 * therefore never fired, and nothing failed — the submit path simply fell back to the legacy
 * hook list. A caller that genuinely has none (the live Preview, which renders a form and runs
 * nothing) must now say so explicitly.
 *
 * Every asset reference in the result is relativised to `/forms/asset/<id>` (#270). The builder
 * stores that form for new uploads, but rows authored before the fix still hold the ABSOLUTE URL
 * of whichever MJAPI took the upload — often `localhost` — and a published snapshot is immutable,
 * so this is the last point at which such a row can be kept out of one. The live Preview renders
 * this same output, which is fine: the preview stage resolves the references again before drawing.
 */
export function buildPublishedDefinition(
  tree: AuthoredFormTree,
  style: AuthoredStyleRow | undefined,
  formVersionId: string,
  automations: readonly PublishedFormAutomation[],
  styleTokensOverride?: FormStyleTokens,
  settingsOverride?: FormSettings,
): PublishedFormDefinition {
  const form = tree.form;
  return mapDefinitionAssets({
    formId: form.ID,
    formVersionId,
    name: form.Name,
    description: form.Description ?? undefined,
    renderMode: form.RenderMode,
    // The override is what publish supplies, and it is authoritative: the builder's tree is loaded
    // once and never refreshed, so `form.Settings` here can be older than what the database holds
    // — so a publisher re-reads the stored column and passes it here. Deriving from the tree
    // remains right for the live Preview, which renders unsaved edits.
    settings: settingsOverride ?? readable(readStoredFormSettings(form.Settings), `form "${form.Name}" (${form.ID}) Settings`),
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
  }, toAssetRef);
}

/** The outcome of {@link tryBuildPublishedDefinition}. */
export type PublishedDefinitionBuild =
  | { readonly ok: true; readonly definition: PublishedFormDefinition }
  | { readonly ok: false; readonly error: UnreadableColumnError };

/**
 * {@link buildPublishedDefinition}, with an unreadable draft column returned as a result.
 *
 * For callers that must go on working when a draft cannot publish — the builder rebuilds the
 * snapshot on every edit for its live Preview and change fingerprint, and publish turns the refusal
 * into a message — so each does not write its own try/catch. Catches ONLY
 * {@link UnreadableColumnError}; anything else is a bug and propagates.
 */
export function tryBuildPublishedDefinition(
  ...args: Parameters<typeof buildPublishedDefinition>
): PublishedDefinitionBuild {
  try {
    return { ok: true, definition: buildPublishedDefinition(...args) };
  } catch (err) {
    if (err instanceof UnreadableColumnError) {
      return { ok: false, error: err };
    }
    throw err;
  }
}

/**
 * Freeze one screen into the snapshot.
 *
 * `displayOrder` is re-derived from position rather than copied, matching how pages and questions
 * are renumbered above: ending resolution walks this list in order, so a gap left by a deleted
 * screen must not survive into the published form.
 */
function buildWelcomeScreen(tree: AuthoredFormTree): PublishedFormScreen | undefined {
  const welcome = welcomeScreenOf(tree);
  return welcome ? buildScreen(welcome, 0) : undefined;
}

function buildScreen(
  screen: AuthoredScreenRow,
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
  if (screen.IsDisqualification) {
    built.isDisqualification = true;
  }
  const conditional = conditionalRuleOf(screen.ConditionalRule, `screen "${screen.Title}" (${screen.ID})`);
  if (conditional) {
    built.conditionalRule = conditional;
  }
  // Parsed rather than copied: the snapshot is what a public page renders, so a link that could
  // not be drawn — unknown platform, blank, or a non-web scheme — is dropped at publish time
  // rather than shipped to every respondent for the widget to re-litigate.
  const social = parseSocialLinks(screen.SocialLinks);
  if (social.length > 0) {
    built.socialLinks = social;
  }
  return built;
}

function buildPage(page: AuthoredPageNode, displayOrder: number): PublishedFormPage {
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
  const conditional = conditionalRuleOf(
    page.entity.ConditionalRule,
    `page "${page.entity.Title ?? ''}" (${page.entity.ID})`,
  );
  if (conditional) {
    result.conditionalRule = conditional;
  }
  return result;
}

function buildQuestion(node: AuthoredQuestionNode, displayOrder: number): PublishedFormQuestion {
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
  const conditional = conditionalRuleOf(q.ConditionalRule, `question "${q.Prompt}" (${q.ID})`);
  if (conditional) {
    result.conditionalRule = conditional;
  }
  const validation: ValidationRule | undefined = readable(
    readStoredValidationRule(q.ValidationRule),
    `question "${q.Prompt}" (${q.ID}) ValidationRule`,
  );
  if (validation) {
    result.validationRule = validation;
  }
  // Per-option points (C4). Tolerant parse: a ScoringConfig holding non-scoring content (the
  // documented LLM-judge use) publishes no scoring rather than failing the snapshot.
  const scoring = parseQuestionScoring(q.ScoringConfig);
  if (scoring) {
    result.scoring = scoring;
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
function buildOptions(node: AuthoredQuestionNode): PublishedFormQuestionOption[] {
  return publishedOptionIdentities(node.options).map(({ source, label, value }, index) => {
    const built: PublishedFormQuestionOption = {
      id: source.ID,
      label,
      value,
      displayOrder: index,
    };
    if (source.IsDefault) {
      built.isDefault = true;
    }
    if (source.ImageURL) {
      built.imageURL = source.ImageURL;
    }
    if (source.MatrixAxis) {
      built.matrixAxis = source.MatrixAxis;
    }
    return built;
  });
}

/** An item's conditional rule, or a throw naming the item when the column cannot be read. */
function conditionalRuleOf(raw: string | null, item: string): ConditionalRule | undefined {
  return readable(readStoredConditionalRule(raw), `${item} ConditionalRule`);
}

/**
 * A draft column the snapshot builder refused to read — the ONE failure it throws on purpose.
 *
 * Its own class so an interactive caller (the builder's live Preview and change fingerprint, which
 * rebuild the snapshot on every edit) can catch exactly this and re-throw anything else: an
 * unreadable rule there is an authoring state the canvas badge already reports, while any other
 * throw is a bug that must not be mistaken for one.
 */
export class UnreadableColumnError extends Error {
  /** Which column, on which item — e.g. `question "Your age" (<id>) ConditionalRule`. */
  public readonly column: string;
  /** Why it could not be read — the JSON parser's or the schema's own message. */
  public readonly reason: string;

  constructor(column: string, reason: string) {
    super(unreadableDraftMessage('publish', { column, reason }));
    this.name = 'UnreadableColumnError';
    this.column = column;
    this.reason = reason;
  }
}

/**
 * What an author is told about an unreadable draft column, for the action they tried (or, for
 * `publish`, the one being held back) — the ONE wording, used by {@link UnreadableColumnError} (the
 * server's publish refusal) and by the builder's banner and live Preview.
 *
 * Composed from the column and the reason rather than by rewriting another message's text, so a
 * change of wording in one place cannot silently break the other.
 */
export function unreadableDraftMessage(
  action: 'publish' | 'preview',
  problem: { readonly column: string; readonly reason: string },
): string {
  return `Cannot ${action}: the ${problem.column} cannot be read — ${problem.reason}.`;
}

/**
 * The value of a column read, or a throw saying which column and why.
 *
 * The message names the item because the person reading it is an author (or an engineer reading
 * a refused publish), and "invalid rule" without a "where" sends them clicking through every
 * question on the form.
 */
function readable<T>(read: StoredColumnRead<T>, column: string): T {
  if (!read.ok) {
    throw new UnreadableColumnError(column, read.reason);
  }
  return read.value;
}
