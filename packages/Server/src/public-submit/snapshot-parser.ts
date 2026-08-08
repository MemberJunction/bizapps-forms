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
  parseValidationRule,
  type ConditionalRule,
  type FormAutomationExecutionMode,
  type FormAutomationTargetType,
  type FormAutomationTrigger,
  type FormQuestionType,
  type FormRenderMode,
  type PublishedFormAutomation,
  type FormSettings,
  type FormStyleTokens,
  type JSONObject,
  type JSONValue,
  type PublishedFormDefinition,
  type PublishedFormPage,
  type PublishedFormQuestion,
  type PublishedFormQuestionOption,
  type ValidationRule,
} from '@mj-biz-apps/forms-entities';

const QUESTION_TYPES: ReadonlySet<string> = new Set<FormQuestionType>([
  'ShortText', 'LongText', 'Email', 'Phone', 'Number', 'SingleChoice', 'MultiChoice',
  'Dropdown', 'Rating', 'NPS', 'YesNo', 'Date', 'Time', 'FileUpload', 'Statement',
]);

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
  };
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
  if (!id || !type || !QUESTION_TYPES.has(type) || prompt === undefined || displayOrder === undefined) {
    return undefined;
  }
  return {
    id,
    type: type as FormQuestionType,
    prompt,
    helpText: asString(obj.helpText),
    isRequired: asBoolean(obj.isRequired) ?? false,
    displayOrder,
    conditionalRule: parseOptionalConditional(obj.conditionalRule),
    validationRule: parseOptionalValidation(obj.validationRule),
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
      options.push({ id, label, value: optValue, displayOrder, isDefault: asBoolean(obj.isDefault) });
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
