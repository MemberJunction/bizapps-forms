/**
 * Parse a stored `FormVersion.DefinitionSnapshot` JSON string into a typed,
 * trusted {@link PublishedFormDefinition}.
 *
 * The snapshot is written by the builder (WP-D) at publish time and is the
 * source of truth for the published shape. We still parse defensively — the
 * column is `NVARCHAR(MAX)` and could be malformed — and return `undefined` on
 * any structural problem so callers fail closed (never `any`-cast their way
 * through bad data). The nested `ConditionalRule`/`ValidationRule`/`FormSettings`
 * blobs are validated with the shared contract parsers.
 */
import {
  parseConditionalRule,
  parseFormSettings,
  parseQuestionScoring,
  parseValidationRule,
  isFormQuestionType,
  type ConditionalRule,
  type FormAutomationExecutionMode,
  type FormAutomationTargetType,
  type FormAutomationTrigger,
  type FormRenderMode,
  type FormScreenType,
  type PublishedFormAutomation,
  type FormSettings,
  type FormStyleTokens,
  type JSONObject,
  type JSONValue,
  type PublishedFormDefinition,
  type PublishedFormPage,
  type PublishedFormQuestion,
  type PublishedFormQuestionOption,
  parseSocialLinks,
  type SocialLink,
  type PublishedFormScreen,
  type ValidationRule,
} from '@mj-biz-apps/forms-entities';

/** Narrow an unknown JSON value to a string-keyed object. */
function asObject(value: JSONValue | undefined): JSONObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JSONObject)
    : undefined;
}

function asString(value: JSONValue | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: JSONValue | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: JSONValue | undefined): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

/** Parse the top-level snapshot; returns `undefined` on malformed JSON or shape. */
export function parsePublishedDefinition(snapshot: string | null): PublishedFormDefinition | undefined {
  if (!snapshot) {
    return undefined;
  }
  try {
    const root = asObject(JSON.parse(snapshot) as JSONValue);
    if (!root) {
      return undefined;
    }
    return buildDefinition(root);
  } catch {
    return undefined;
  }
}

/** Assemble the definition from the parsed root object, returning `undefined` if incomplete. */
function buildDefinition(root: JSONObject): PublishedFormDefinition | undefined {
  const formId = asString(root.formId);
  const formVersionId = asString(root.formVersionId);
  const name = asString(root.name);
  const renderMode = parseRenderMode(root.renderMode);
  const settings = parseSettings(root.settings);
  const styleTokens = parseStyle(root.styleTokens);
  const pagesRaw = root.pages;

  if (!formId || !formVersionId || !name || !renderMode || !settings || !styleTokens || !Array.isArray(pagesRaw)) {
    return undefined;
  }

  const pages: PublishedFormPage[] = [];
  for (const raw of pagesRaw) {
    const page = parsePage(asObject(raw));
    if (!page) {
      return undefined;
    }
    pages.push(page);
  }

  return {
    formId,
    formVersionId,
    name,
    description: asString(root.description),
    renderMode,
    settings,
    styleTokens,
    pages,
    automations: parseAutomations(root.automations),
    welcomeScreen: parseScreen(asObject(root.welcomeScreen), 'Welcome'),
    endScreens: parseEndScreens(root.endScreens),
  };
}

/**
 * Parse the ending screens, dropping malformed entries.
 *
 * Lenient in the same way — and for the same reason — as {@link parseAutomations}, and
 * deliberately NOT like `parsePage`: a corrupt page means we would render a form we only half
 * understand, so the whole snapshot fails. A corrupt ending screen costs the respondent a
 * thank-you page they never saw before, and `endingMessage` already has a fallback for exactly
 * that. Taking the form offline to protect a confirmation screen is the wrong trade.
 */
function parseEndScreens(value: JSONValue | undefined): PublishedFormScreen[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const screens: PublishedFormScreen[] = [];
  for (const raw of value) {
    const screen = parseScreen(asObject(raw), 'Ending');
    if (screen) {
      screens.push(screen);
    }
  }
  return screens;
}

/**
 * Parse one screen, forcing its `screenType` to the slot it was found in.
 *
 * The slot is authoritative rather than the stored field: a screen sitting in `endScreens` IS
 * an ending regardless of what its own `screenType` says, and honouring a mismatched field
 * would produce an "Ending" the widget shows before intake, or a welcome screen with a
 * redirect. There is no reading of that disagreement that helps a respondent.
 */
function parseScreen(
  obj: JSONObject | undefined,
  screenType: FormScreenType,
): PublishedFormScreen | undefined {
  if (!obj) {
    return undefined;
  }
  const id = asString(obj.id);
  const title = asString(obj.title);
  if (!id || title === undefined) {
    return undefined;
  }
  return {
    id,
    screenType,
    title,
    body: asString(obj.body),
    buttonLabel: asString(obj.buttonLabel),
    mediaURL: asString(obj.mediaURL),
    redirectURL: asString(obj.redirectURL),
    displayOrder: asNumber(obj.displayOrder) ?? 0,
    conditionalRule: parseOptionalConditional(obj.conditionalRule),
    isDefault: asBoolean(obj.isDefault),
    isDisqualification: asBoolean(obj.isDisqualification),
    socialLinks: parseScreenSocialLinks(obj.socialLinks),
  };
}

/**
 * The screen's social links, revalidated on the way out.
 *
 * This parser copies field by field, and `socialLinks` was added to the PUBLISH side without
 * being added here — so the builder saved them, publish captured them, the database held
 * them, and the API silently served a screen without them. The author saw their links and
 * respondents never did, with nothing reporting a fault anywhere along the way.
 *
 * Revalidated rather than copied because `parseSocialLinks` takes the stored JSON string and
 * this is already-parsed JSON, and because these values become an `href` on a page shown to
 * anonymous members of the public: a snapshot published by an older build, or edited by hand,
 * must not be able to put `javascript:` in front of a respondent. Sharing the publish side's
 * function is what keeps the two ends from drifting apart again.
 */
function parseScreenSocialLinks(value: JSONValue | undefined): SocialLink[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const links = parseSocialLinks(JSON.stringify(value));
  return links.length > 0 ? links : undefined;
}

/**
 * Parse the automation array, dropping entries that are not well-formed.
 *
 * Deliberately lenient where the rest of this parser is strict: a malformed PAGE or QUESTION
 * fails the whole snapshot, because a respondent must never be shown a form we only half
 * understand. An automation is different — it is invisible to the respondent, so refusing to
 * serve the form because one automation entry is corrupt would take the form down for everyone
 * to protect a side effect. A dropped automation does not fire, which is the safe direction.
 * An absent array (every snapshot published before automations existed) is simply none.
 */
function parseAutomations(value: JSONValue | undefined): PublishedFormAutomation[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const automations: PublishedFormAutomation[] = [];
  for (const raw of value) {
    const automation = parseAutomation(asObject(raw));
    if (automation) {
      automations.push(automation);
    }
  }
  return automations;
}

function parseAutomation(obj: JSONObject | undefined): PublishedFormAutomation | undefined {
  if (!obj) {
    return undefined;
  }
  const id = asString(obj.id);
  const name = asString(obj.name);
  const targetType = parseTargetType(obj.targetType);
  const trigger = parseTrigger(obj.trigger);
  const executionMode = parseExecutionMode(obj.executionMode);
  const displayOrder = asNumber(obj.displayOrder);
  if (!id || name === undefined || !targetType || !trigger || !executionMode || displayOrder === undefined) {
    return undefined;
  }
  return {
    id,
    name,
    targetType,
    actionId: asString(obj.actionId),
    agentId: asString(obj.agentId),
    bindingId: asString(obj.bindingId),
    trigger,
    executionMode,
    displayOrder,
    conditionalRule: parseOptionalConditional(obj.conditionalRule),
    continueOnError: asBoolean(obj.continueOnError) ?? true,
    isActive: asBoolean(obj.isActive) ?? true,
  };
}

function parseTargetType(value: JSONValue | undefined): FormAutomationTargetType | undefined {
  return value === 'Action' || value === 'Agent' || value === 'EntityBinding' ? value : undefined;
}

function parseTrigger(value: JSONValue | undefined): FormAutomationTrigger | undefined {
  return value === 'OnComplete' || value === 'OnPartial' || value === 'OnCompleteOrPartial' ? value : undefined;
}

function parseExecutionMode(value: JSONValue | undefined): FormAutomationExecutionMode | undefined {
  return value === 'Sync' || value === 'Async' ? value : undefined;
}

function parseRenderMode(value: JSONValue | undefined): FormRenderMode | undefined {
  return value === 'Scroll' || value === 'OneQuestion' ? value : undefined;
}

/** FormSettings validated via the shared contract parser. */
function parseSettings(value: JSONValue | undefined): FormSettings | undefined {
  const obj = asObject(value);
  if (!obj) {
    return undefined;
  }
  try {
    return parseFormSettings(obj);
  } catch {
    return undefined;
  }
}

function parseStyle(value: JSONValue | undefined): FormStyleTokens | undefined {
  const obj = asObject(value);
  if (!obj) {
    return undefined;
  }
  const cssRaw = asObject(obj.cssVariables) ?? {};
  const cssVariables: Record<string, string> = {};
  for (const [k, v] of Object.entries(cssRaw)) {
    const s = asString(v);
    if (s !== undefined) {
      cssVariables[k] = s;
    }
  }
  return { cssVariables, customCSS: asString(obj.customCSS), logoURL: asString(obj.logoURL) };
}

function parsePage(obj: JSONObject | undefined): PublishedFormPage | undefined {
  if (!obj) {
    return undefined;
  }
  const id = asString(obj.id);
  const displayOrder = asNumber(obj.displayOrder);
  if (!id || displayOrder === undefined || !Array.isArray(obj.questions)) {
    return undefined;
  }
  const questions: PublishedFormQuestion[] = [];
  for (const raw of obj.questions) {
    const q = parseQuestion(asObject(raw));
    if (!q) {
      return undefined;
    }
    questions.push(q);
  }
  return {
    id,
    title: asString(obj.title),
    description: asString(obj.description),
    displayOrder,
    conditionalRule: parseOptionalConditional(obj.conditionalRule),
    isPartialSubmitPoint: asBoolean(obj.isPartialSubmitPoint),
    questions,
  };
}

function parseQuestion(obj: JSONObject | undefined): PublishedFormQuestion | undefined {
  if (!obj) {
    return undefined;
  }
  const id = asString(obj.id);
  const type = asString(obj.type);
  const prompt = asString(obj.prompt);
  const displayOrder = asNumber(obj.displayOrder);
  // `isFormQuestionType` replaces a 15-string set copied out of the contract by hand. The copy
  // was already the bug waiting to happen: it had no way to learn that the contract grew, so a
  // form published with a new type parsed as `undefined` and took the whole snapshot — and
  // therefore the whole form — down with it.
  if (!id || !isFormQuestionType(type) || prompt === undefined || displayOrder === undefined) {
    return undefined;
  }
  return {
    id,
    type,
    prompt,
    helpText: asString(obj.helpText),
    isRequired: asBoolean(obj.isRequired) ?? false,
    displayOrder,
    conditionalRule: parseOptionalConditional(obj.conditionalRule),
    validationRule: parseOptionalValidation(obj.validationRule),
    // Tolerant by contract: an unusable scoring blob means "does not score", never a failed
    // snapshot — same posture as automations (side-effect config must not take the form down).
    scoring: parseQuestionScoring(obj.scoring),
    settings: asObject(obj.settings),
    options: parseOptions(obj.options),
  };
}

function parseOptions(value: JSONValue | undefined): PublishedFormQuestionOption[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const options: PublishedFormQuestionOption[] = [];
  for (const raw of value) {
    const obj = asObject(raw);
    const id = asString(obj?.id);
    const label = asString(obj?.label);
    const optValue = asString(obj?.value);
    const displayOrder = asNumber(obj?.displayOrder);
    if (obj && id && label !== undefined && optValue !== undefined && displayOrder !== undefined) {
      const axis = asString(obj.matrixAxis);
      options.push({
        id,
        label,
        value: optValue,
        displayOrder,
        isDefault: asBoolean(obj.isDefault),
        imageURL: asString(obj.imageURL),
        matrixAxis: axis === 'Row' || axis === 'Column' ? axis : undefined,
      });
    }
  }
  return options;
}

/** Conditional rule is optional; a malformed one is treated as "no rule". */
function parseOptionalConditional(value: JSONValue | undefined): ConditionalRule | undefined {
  const obj = asObject(value);
  if (!obj) {
    return undefined;
  }
  try {
    return parseConditionalRule(obj);
  } catch {
    return undefined;
  }
}

/** Validation rule is optional; a malformed one is treated as "no rule". */
function parseOptionalValidation(value: JSONValue | undefined): ValidationRule | undefined {
  const obj = asObject(value);
  if (!obj) {
    return undefined;
  }
  try {
    return parseValidationRule(obj);
  } catch {
    return undefined;
  }
}
