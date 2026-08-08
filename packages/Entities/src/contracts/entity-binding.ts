/**
 * The authored configuration of an entity binding: which answers map to which fields, how an
 * existing record is recognised, and which values may overwrite which.
 *
 * Shared because both sides need the same reading — the builder authors these blobs and the
 * server executes them, and a disagreement between the two shows up as a form that writes the
 * wrong data rather than as an error.
 *
 * VOCABULARY IS BORROWED ON PURPOSE. `neverBlank` / `latestWins` / `writeOnce`, the
 * refuse-without-identity rule, and oldest-first convergence are Caliber's, adopted verbatim
 * rather than renamed. They encode several review rounds of decisions that are easy to get
 * wrong and expensive to get wrong quietly, and keeping the names identical is what lets
 * Caliber's intake layer eventually delete its own copy instead of translating between two
 * dialects that mean the same thing.
 *
 * EVERY PARSER HERE REFUSES WHAT IT DOES NOT UNDERSTAND. An unknown merge rule is not silently
 * treated as the default: a mistyped `neverBank` would present as a field that simply stops
 * updating, with no error anywhere and nothing to notice until someone compares two records by
 * hand. Refusing at authoring time is the only point where a human is still looking.
 */
import type { JSONObject, JSONValue } from './json-value';

/** How an incoming value may overwrite what a matched record already holds. */
export type MergeRule =
  /** Never replace an existing value with a blank one. The default. */
  | 'neverBlank'
  /** The only rule that can clear a field — and only via an explicitly present empty answer. */
  | 'latestWins'
  /** Never overwrite an existing non-empty value at all. */
  | 'writeOnce';

/** Whether a submission may create a record, update one, or only ever update. */
export type BindingIdentityMode =
  /** Every submission creates a new record; no lookup happens. */
  | 'AlwaysCreate'
  /** Look for an existing record; create one when there is no match. */
  | 'MatchThenCreate'
  /** Look for an existing record; record a skip when there is no match, never create. */
  | 'MatchOrSkip';

/** How a match value is normalised before comparison. Mirrors MJ's Organic Key vocabulary. */
export type IdentityNormalization = 'LowerCaseTrim' | 'Trim' | 'ExactMatch';

/** What to do when the identity lookup finds more than one record. */
export type MultipleMatchPolicy = 'Oldest' | 'Fail';

/** What to do when the submission carries no value for an identity field. */
export type MissingIdentityPolicy = 'Skip' | 'Fail';

/** Where a mapped value comes from. */
export type FieldMappingSource =
  | { kind: 'question'; questionId: string }
  | { kind: 'static'; value: JSONValue };

/** One mapped target field. */
export interface FieldMapping {
  targetField: string;
  source: FieldMappingSource;
  /** When true, a submission missing this value is refused rather than partially written. */
  required?: boolean;
}

/** The whole field mapping, versioned so a future shape change is explicit rather than guessed. */
export interface FieldMappings {
  version: 1;
  fields: FieldMapping[];
}

/** One field participating in the identity lookup. */
export interface IdentityMatchField {
  targetField: string;
  normalize?: IdentityNormalization;
}

/** A constant constraint ANDed into the lookup and stamped on create (e.g. tenant scoping). */
export interface IdentityScopeField {
  targetField: string;
  value: string;
}

/** How an existing record is recognised. */
export interface IdentityRule {
  mode: BindingIdentityMode;
  match?: IdentityMatchField[];
  scope?: IdentityScopeField[];
  onMultipleMatch?: MultipleMatchPolicy;
  onMissingIdentityValue?: MissingIdentityPolicy;
}

/** Per-field overrides on top of a default rule. */
export interface MergePolicy {
  default?: MergeRule;
  fields?: Record<string, MergeRule>;
}

const MERGE_RULES: ReadonlySet<string> = new Set<MergeRule>(['neverBlank', 'latestWins', 'writeOnce']);
const IDENTITY_MODES: ReadonlySet<string> = new Set<BindingIdentityMode>([
  'AlwaysCreate',
  'MatchThenCreate',
  'MatchOrSkip',
]);
const NORMALIZATIONS: ReadonlySet<string> = new Set<IdentityNormalization>([
  'LowerCaseTrim',
  'Trim',
  'ExactMatch',
]);

/** Raised when authored binding configuration cannot be understood. */
export class BindingConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BindingConfigError';
  }
}

function asObject(value: JSONValue | undefined): JSONObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}

/**
 * Parse the field mapping.
 *
 * Duplicate target fields are refused rather than last-one-wins: two mappings writing the same
 * column is never what an author meant, and silently honouring one of them makes the other look
 * like it is working.
 */
export function parseFieldMappings(raw: JSONValue | null | undefined): FieldMappings {
  const obj = asObject(raw ?? undefined);
  if (!obj) {
    throw new BindingConfigError('FieldMappings must be an object.');
  }
  if (obj.version !== 1) {
    throw new BindingConfigError(`FieldMappings.version must be 1, got ${JSON.stringify(obj.version)}.`);
  }
  if (!Array.isArray(obj.fields)) {
    throw new BindingConfigError('FieldMappings.fields must be an array.');
  }

  const fields: FieldMapping[] = [];
  const seen = new Set<string>();
  for (const rawField of obj.fields) {
    const field = parseFieldMapping(asObject(rawField));
    const key = field.targetField.toLowerCase();
    if (seen.has(key)) {
      throw new BindingConfigError(`FieldMappings maps "${field.targetField}" more than once.`);
    }
    seen.add(key);
    fields.push(field);
  }
  return { version: 1, fields };
}

function parseFieldMapping(obj: JSONObject | undefined): FieldMapping {
  if (!obj) {
    throw new BindingConfigError('Each entry of FieldMappings.fields must be an object.');
  }
  const targetField = typeof obj.targetField === 'string' ? obj.targetField.trim() : '';
  if (!targetField) {
    throw new BindingConfigError('A field mapping is missing its targetField.');
  }
  const source = asObject(obj.source);
  if (!source) {
    throw new BindingConfigError(`Mapping for "${targetField}" is missing its source.`);
  }
  const required = obj.required === true;

  if (source.kind === 'question') {
    const questionId = typeof source.questionId === 'string' ? source.questionId.trim() : '';
    if (!questionId) {
      throw new BindingConfigError(`Mapping for "${targetField}" names no question.`);
    }
    return { targetField, source: { kind: 'question', questionId }, required };
  }
  if (source.kind === 'static') {
    if (source.value === undefined) {
      throw new BindingConfigError(`Static mapping for "${targetField}" has no value.`);
    }
    return { targetField, source: { kind: 'static', value: source.value }, required };
  }
  throw new BindingConfigError(
    `Mapping for "${targetField}" has an unknown source kind ${JSON.stringify(source.kind)}.`,
  );
}

/**
 * Parse the identity rule.
 *
 * A matching mode with no match fields is refused. There is deliberately no default identity
 * field: guessing that a field called "email" is the identity is right often enough to be
 * dangerous, and wrong in exactly the cases — two people, one shared inbox — where merging two
 * real records is unrecoverable.
 */
export function parseIdentityRule(raw: JSONValue | null | undefined): IdentityRule {
  const obj = asObject(raw ?? undefined);
  if (!obj) {
    throw new BindingConfigError('IdentityRule must be an object.');
  }
  const mode = typeof obj.mode === 'string' ? obj.mode : '';
  if (!IDENTITY_MODES.has(mode)) {
    throw new BindingConfigError(
      `IdentityRule.mode must be one of AlwaysCreate, MatchThenCreate, MatchOrSkip — got ${JSON.stringify(obj.mode)}.`,
    );
  }
  const identityMode = mode as BindingIdentityMode;
  const match = parseMatchFields(obj.match);

  if (identityMode !== 'AlwaysCreate' && match.length === 0) {
    throw new BindingConfigError(`IdentityRule.mode "${identityMode}" needs at least one match field.`);
  }
  if (identityMode === 'AlwaysCreate' && match.length > 0) {
    throw new BindingConfigError('IdentityRule.mode "AlwaysCreate" cannot carry match fields.');
  }

  return {
    mode: identityMode,
    match,
    scope: parseScopeFields(obj.scope),
    onMultipleMatch: parseChoice(obj.onMultipleMatch, ['Oldest', 'Fail'] as const, 'Oldest', 'onMultipleMatch'),
    onMissingIdentityValue: parseChoice(
      obj.onMissingIdentityValue,
      ['Skip', 'Fail'] as const,
      'Skip',
      'onMissingIdentityValue',
    ),
  };
}

/**
 * Read one optional enumerated rule: absent means the default, anything unrecognised is refused.
 *
 * The distinction matters. Absent is a real authoring state — most bindings never mention these —
 * and defaulting it is correct. A value that is PRESENT and unrecognised is the opposite: the
 * author believed they configured something. Quietly substituting the default there produces a
 * binding that behaves the exact opposite of what its own JSON says, with nothing to notice.
 */
function parseChoice<T extends string>(
  raw: JSONValue | undefined,
  allowed: readonly T[],
  fallback: T,
  fieldName: string,
): T {
  if (raw === undefined || raw === null) {
    return fallback;
  }
  const match = allowed.find((value) => value === raw);
  if (!match) {
    throw new BindingConfigError(
      `IdentityRule.${fieldName} must be one of ${allowed.join(', ')} — got ${JSON.stringify(raw)}.`,
    );
  }
  return match;
}

function parseMatchFields(raw: JSONValue | undefined): IdentityMatchField[] {
  if (raw === undefined || raw === null) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new BindingConfigError('IdentityRule.match must be an array.');
  }
  return raw.map((entry) => {
    const obj = asObject(entry);
    const targetField = typeof obj?.targetField === 'string' ? obj.targetField.trim() : '';
    if (!targetField) {
      throw new BindingConfigError('An IdentityRule.match entry is missing its targetField.');
    }
    const normalize = obj?.normalize;
    if (normalize !== undefined && (typeof normalize !== 'string' || !NORMALIZATIONS.has(normalize))) {
      throw new BindingConfigError(
        `Unknown normalization ${JSON.stringify(normalize)} for match field "${targetField}".`,
      );
    }
    return { targetField, normalize: (normalize as IdentityNormalization) ?? 'ExactMatch' };
  });
}

function parseScopeFields(raw: JSONValue | undefined): IdentityScopeField[] {
  if (raw === undefined || raw === null) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new BindingConfigError('IdentityRule.scope must be an array.');
  }
  return raw.map((entry) => {
    const obj = asObject(entry);
    const targetField = typeof obj?.targetField === 'string' ? obj.targetField.trim() : '';
    const value = obj?.value;
    if (!targetField) {
      throw new BindingConfigError('An IdentityRule.scope entry is missing its targetField.');
    }
    if (typeof value !== 'string') {
      throw new BindingConfigError(`IdentityRule.scope entry "${targetField}" needs a string value.`);
    }
    return { targetField, value };
  });
}

/** Parse the merge policy. Null/absent means `neverBlank` throughout. */
export function parseMergePolicy(raw: JSONValue | null | undefined): MergePolicy {
  if (raw === undefined || raw === null) {
    return { default: 'neverBlank', fields: {} };
  }
  const obj = asObject(raw);
  if (!obj) {
    throw new BindingConfigError('MergePolicy must be an object.');
  }
  const fallback = obj.default;
  if (fallback !== undefined && (typeof fallback !== 'string' || !MERGE_RULES.has(fallback))) {
    throw new BindingConfigError(
      `MergePolicy.default must be one of neverBlank, latestWins, writeOnce — got ${JSON.stringify(fallback)}.`,
    );
  }
  const perField = asObject(obj.fields) ?? {};
  // Keys are folded on the way in and looked up folded, because everything else that compares a
  // target field name folds too. An authored `{"email": "writeOnce"}` against a column named
  // `Email` must not silently degrade to the default — the whole point of naming a field here is
  // to protect it, so getting the casing slightly wrong would remove exactly the guard the author
  // went out of their way to add.
  const fields: Record<string, MergeRule> = {};
  for (const [field, rule] of Object.entries(perField)) {
    if (typeof rule !== 'string' || !MERGE_RULES.has(rule)) {
      throw new BindingConfigError(
        `MergePolicy for "${field}" must be one of neverBlank, latestWins, writeOnce — got ${JSON.stringify(rule)}.`,
      );
    }
    const key = field.toLowerCase();
    if (key in fields && fields[key] !== rule) {
      throw new BindingConfigError(`MergePolicy names "${field}" more than once, with conflicting rules.`);
    }
    fields[key] = rule as MergeRule;
  }
  return { default: (fallback as MergeRule) ?? 'neverBlank', fields };
}

/** The rule that applies to one field, per-field override winning over the default. */
export function mergeRuleFor(policy: MergePolicy, targetField: string): MergeRule {
  return policy.fields?.[targetField.toLowerCase()] ?? policy.default ?? 'neverBlank';
}
