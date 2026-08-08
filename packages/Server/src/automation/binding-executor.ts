/**
 * Execute one entity binding for one submission: validate the configuration, decide whether this
 * submission updates an existing record or creates one, work out which fields may be written, and
 * write them.
 *
 * All the MJ I/O sits behind {@link BindingTargetGateway}. That split is not ceremony — the
 * decisions here are the ones that quietly corrupt data when they are wrong (matching the wrong
 * record, overwriting a value that should have survived, creating a duplicate person), and they
 * are the ones that are impossible to exercise thoroughly against a live database.
 *
 * Two doctrines are imported from MJ's own integration engine, where the same problem was solved
 * for external systems:
 *
 * - **A wrong match is worse than a missed match.** Creating a duplicate is untidy and fixable by
 *   a human; writing one person's answers onto another person's record is neither. Every rule
 *   below that looks over-cautious is paying for that asymmetry.
 * - **Absence must be proven, never inferred.** A lookup that FAILED is not a lookup that found
 *   nothing, so a failed match surfaces as a retryable error rather than falling through to
 *   "create" — otherwise a transient database blip silently duplicates every record it touches.
 */
import {
  BindingConfigError,
  isFileAnswer,
  planMerge,
  resolveMappedValues,
  type CanonicalAnswers,
  type CanonicalAnswerValue,
  type FieldMappings,
  type IdentityNormalization,
  type IdentityRule,
  type MergePolicy,
} from '@mj-biz-apps/forms-entities';

/**
 * Whether a failure is the form's fault or this submission's.
 *
 * A `config` failure is broken for EVERY submission and needs an author; a `candidate` failure is
 * about this one response. Keeping them apart stops a mistyped column name from being reported as
 * though the respondent had done something wrong — and stops a genuinely per-response problem from
 * being escalated as an outage.
 */
export type BindingFailureScope = 'config' | 'candidate';

/** What the binding did. */
export type BindingOutcomeKind = 'Created' | 'Merged' | 'Unchanged' | 'Skipped';

export interface BindingOutcome {
  kind: BindingOutcomeKind;
  targetRecordId: string | null;
  writtenFields: string[];
  /** Why nothing was written, when kind is `Skipped`. */
  skipReason?: string;
}

export interface BindingFailure {
  scope: BindingFailureScope;
  /** Only retryable failures are re-driven by the recovery sweep. */
  retryable: boolean;
  message: string;
}

export type BindingResult = { ok: true; outcome: BindingOutcome } | { ok: false; failure: BindingFailure };

/** One identity criterion, already resolved to the value being matched on. */
export interface MatchCriterion {
  field: string;
  value: string;
  normalize: IdentityNormalization;
}

export interface MatchQuery {
  entityName: string;
  criteria: MatchCriterion[];
}

export interface MatchedRecord {
  recordId: string;
  /** The matched record's current field values, for the merge planner to compare against. */
  values: ReadonlyMap<string, unknown>;
  /** True when the criteria matched more than one record; this is the oldest of them. */
  multipleFound: boolean;
}

/** What this binding's identity mode needs to be able to do to the target entity. */
export interface EntityCapability {
  create: boolean;
  update: boolean;
}

/** Everything the executor needs from MemberJunction, and nothing it does not. */
export interface BindingTargetGateway {
  /** Field names that exist on the entity and can be written, or null when it does not resolve. */
  describeEntity(entityName: string, needs: EntityCapability): Promise<ReadonlySet<string> | null>;
  /** Oldest matching record, or null when none matched. Rejects when the lookup itself fails. */
  findMatch(query: MatchQuery): Promise<MatchedRecord | null>;
  /** Create (recordId null) or update a record; returns the primary key written. */
  writeRecord(
    entityName: string,
    recordId: string | null,
    values: ReadonlyMap<string, CanonicalAnswerValue>,
  ): Promise<string>;
}

export interface BindingConfig {
  targetEntityName: string;
  fieldMappings: FieldMappings;
  identityRule: IdentityRule;
  mergePolicy: MergePolicy;
}

export interface ExecuteBindingInput {
  config: BindingConfig;
  answers: CanonicalAnswers;
  gateway: BindingTargetGateway;
  /**
   * Entities this deployment permits bindings to write. Null disables the check.
   *
   * A form author with builder rights must not thereby be able to write any entity the service
   * principal can reach; the principal's own grants are the hard ceiling and this keeps authoring
   * honest inside it.
   */
  allowedEntities: ReadonlySet<string> | null;
}

function fail(scope: BindingFailureScope, retryable: boolean, message: string): BindingResult {
  return { ok: false, failure: { scope, retryable, message } };
}

function skipped(reason: string): BindingResult {
  return { ok: true, outcome: { kind: 'Skipped', targetRecordId: null, writtenFields: [], skipReason: reason } };
}

/** Execute the binding. Never throws for an expected failure — the result carries it. */
export async function executeBinding(input: ExecuteBindingInput): Promise<BindingResult> {
  const { config, gateway } = input;

  if (input.allowedEntities && !input.allowedEntities.has(config.targetEntityName)) {
    return fail(
      'config',
      false,
      `Entity "${config.targetEntityName}" is not on this deployment's binding allow-list.`,
    );
  }

  const needs = capabilityFor(config.identityRule.mode);
  let writableFields: ReadonlySet<string> | null;
  try {
    writableFields = await gateway.describeEntity(config.targetEntityName, needs);
  } catch (error) {
    return fail('config', true, `Could not read metadata for "${config.targetEntityName}": ${messageOf(error)}`);
  }
  if (!writableFields) {
    return fail('config', false, `Entity "${config.targetEntityName}" does not exist or is not writable.`);
  }

  const unwritable = unwritableTargets(config, writableFields);
  if (unwritable.length > 0) {
    // Reported together rather than one per run: BaseEntity.Set silently ignores a field that does
    // not exist, so an unchecked mapping loses data with no error at all, and fixing them one
    // failed submission at a time is how you spend a week on a five-minute problem.
    return fail(
      'config',
      false,
      `Binding targets fields that do not exist or cannot be written on "${config.targetEntityName}": ${unwritable.join(', ')}.`,
    );
  }

  const unmappedIdentity = unmappedIdentityFields(config);
  if (unmappedIdentity.length > 0) {
    // Without this, the mistake is invisible in the worst way: the identity value is never
    // produced, so `resolveIdentity` reports "this respondent left it blank" and skips — for
    // EVERY submission, forever, while looking like ordinary per-respondent data quality. It also
    // means a created record would not carry the value later lookups match on, so the binding
    // would create a fresh duplicate every single time.
    return fail(
      'config',
      false,
      `Identity field(s) ${unmappedIdentity.join(', ')} are not mapped, so no submission can ever supply them.`,
    );
  }

  const resolved = resolveMappedValues(config.fieldMappings, input.answers);
  if (resolved.missingRequired.length > 0) {
    return fail('candidate', false, `Submission is missing required value(s): ${resolved.missingRequired.join(', ')}.`);
  }

  narrowObjectValues(resolved.values);

  for (const scope of config.identityRule.scope ?? []) {
    resolved.values.set(scope.targetField, scope.value);
  }

  const match = await resolveIdentity(config, resolved.values, gateway);
  if ('failure' in match) {
    return match.result;
  }

  // Scope fields identify the record every bit as much as the match fields do — they are what
  // keeps one tenant's submission from landing on another's record — so they are stamped on create
  // and never rewritten on update.
  const identityFields = [
    ...(config.identityRule.match ?? []).map((m) => m.targetField),
    ...(config.identityRule.scope ?? []).map((s) => s.targetField),
  ];
  const plan = planMerge({
    mapped: resolved.values,
    existing: match.existing?.values ?? null,
    policy: config.mergePolicy,
    identityFields,
  });

  if (plan.size === 0) {
    // Nothing to write, on either path. On update, saving anyway would stamp __mj_UpdatedAt and
    // fabricate a record-change row, turning every replay into an apparent edit. On CREATE it is
    // worse: it would insert a record with no values at all — a blank row that satisfies no
    // lookup, that a NOT NULL column may reject as a mysterious write failure, and that nothing
    // downstream can tell from a real one.
    return match.existing
      ? { ok: true, outcome: { kind: 'Unchanged', targetRecordId: match.existing.recordId, writtenFields: [] } }
      : skipped('Submission supplied no values to write.');
  }

  try {
    const recordId = await gateway.writeRecord(config.targetEntityName, match.existing?.recordId ?? null, plan);
    return {
      ok: true,
      outcome: {
        kind: match.existing ? 'Merged' : 'Created',
        targetRecordId: recordId,
        writtenFields: [...plan.keys()],
      },
    };
  } catch (error) {
    return fail('candidate', true, `Writing to "${config.targetEntityName}" failed: ${messageOf(error)}`);
  }
}

/** What each identity mode can do to the target: `MatchThenCreate` is the only one that does both. */
function capabilityFor(mode: BindingConfig['identityRule']['mode']): EntityCapability {
  return {
    create: mode === 'AlwaysCreate' || mode === 'MatchThenCreate',
    update: mode === 'MatchOrSkip' || mode === 'MatchThenCreate',
  };
}

/**
 * Reduce object-shaped answers to something a database column can hold.
 *
 * Two answer types collapse to objects rather than scalars: a file answer is `{ fileId }` (wrapped
 * so a file stays distinguishable from a text answer that merely looks like a GUID) and a
 * multi-select is an array. Passed through untouched, both reach `BaseEntity.Set` as objects and
 * are stringified by the driver into `[object Object]` — a write that succeeds, corrupts the
 * column, and reports success.
 *
 * A file becomes its bare GUID, which is what a `File` foreign-key column wants.
 *
 * NOTE: before this path is wired into the submit pipeline, a file answer must first clear the
 * upload-provenance check (F-SEC-1). `__mj.File` rows carry no owner, so a respondent can submit
 * any file's GUID; copying one onto a business record that other users can read turns that into
 * cross-tenant file disclosure. Unwrapping here is necessary and not sufficient.
 */
function narrowObjectValues(values: Map<string, CanonicalAnswerValue>): void {
  for (const [field, value] of values) {
    if (isFileAnswer(value)) {
      values.set(field, value.fileId);
    } else if (value !== null && typeof value === 'object') {
      values.set(field, JSON.stringify(value));
    }
  }
}

/**
 * Identity match fields that no mapping produces.
 *
 * Scope fields are exempt: they carry their own literal value in the rule, so they need no mapping.
 */
function unmappedIdentityFields(config: BindingConfig): string[] {
  const mapped = new Set(config.fieldMappings.fields.map((f) => f.targetField.toLowerCase()));
  return (config.identityRule.match ?? [])
    .map((m) => m.targetField)
    .filter((field) => !mapped.has(field.toLowerCase()));
}

/** Target fields the mapping and the identity scope want to write but the entity will not accept. */
function unwritableTargets(config: BindingConfig, writableFields: ReadonlySet<string>): string[] {
  const lowered = new Set([...writableFields].map((f) => f.toLowerCase()));
  const wanted = [
    ...config.fieldMappings.fields.map((f) => f.targetField),
    ...(config.identityRule.match ?? []).map((m) => m.targetField),
    ...(config.identityRule.scope ?? []).map((s) => s.targetField),
  ];
  return [...new Set(wanted)].filter((field) => !lowered.has(field.toLowerCase()));
}

type IdentityResolution = { existing: MatchedRecord | null } | { failure: true; result: BindingResult };

/** Decide which record this submission belongs to, per the configured mode. */
async function resolveIdentity(
  config: BindingConfig,
  values: ReadonlyMap<string, CanonicalAnswerValue>,
  gateway: BindingTargetGateway,
): Promise<IdentityResolution> {
  const rule = config.identityRule;
  if (rule.mode === 'AlwaysCreate') {
    return { existing: null };
  }

  const criteria: MatchCriterion[] = [];
  for (const field of rule.match ?? []) {
    const value = values.get(field.targetField);
    if (value === undefined || value === null || String(value).trim() === '') {
      // Refusing to create without an identity value is Caliber's ruling, adopted deliberately: an
      // unbound submission is recoverable — the answers are still recorded and a human or a later
      // re-run can attach them — while a duplicate person created because we had nothing to match
      // on has to be merged by hand, if anyone ever notices.
      return {
        failure: true,
        result:
          rule.onMissingIdentityValue === 'Fail'
            ? fail('candidate', false, `No value for identity field "${field.targetField}".`)
            : skipped(`No value for identity field "${field.targetField}".`),
      };
    }
    criteria.push({ field: field.targetField, value: String(value), normalize: field.normalize ?? 'ExactMatch' });
  }
  for (const scope of rule.scope ?? []) {
    criteria.push({ field: scope.targetField, value: scope.value, normalize: 'ExactMatch' });
  }

  let matched: MatchedRecord | null;
  try {
    matched = await gateway.findMatch({ entityName: config.targetEntityName, criteria });
  } catch (error) {
    // Retryable, and emphatically NOT treated as "no match": a failed read that fell through to
    // create would duplicate a record every time the database hiccuped.
    return { failure: true, result: fail('candidate', true, `Identity lookup failed: ${messageOf(error)}`) };
  }

  if (matched?.multipleFound && rule.onMultipleMatch === 'Fail') {
    return {
      failure: true,
      result: fail('candidate', false, 'Identity matched more than one record.'),
    };
  }
  if (!matched && rule.mode === 'MatchOrSkip') {
    return { failure: true, result: skipped('No existing record matched, and this binding does not create.') };
  }
  return { existing: matched };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Parse the three authored config blobs, reporting a config-scoped failure on anything malformed. */
export function parseBindingConfig(
  targetEntityName: string,
  raw: { fieldMappings: string | null; identityRule: string | null; mergePolicy: string | null },
  parsers: {
    fieldMappings: (v: unknown) => FieldMappings;
    identityRule: (v: unknown) => IdentityRule;
    mergePolicy: (v: unknown) => MergePolicy;
  },
): { ok: true; config: BindingConfig } | { ok: false; failure: BindingFailure } {
  try {
    return {
      ok: true,
      config: {
        targetEntityName,
        fieldMappings: parsers.fieldMappings(jsonOrNull(raw.fieldMappings)),
        identityRule: parsers.identityRule(jsonOrNull(raw.identityRule)),
        mergePolicy: parsers.mergePolicy(jsonOrNull(raw.mergePolicy)),
      },
    };
  } catch (error) {
    const message = error instanceof BindingConfigError ? error.message : messageOf(error);
    return { ok: false, failure: { scope: 'config', retryable: false, message } };
  }
}

function jsonOrNull(raw: string | null): unknown {
  if (raw === null || raw.trim() === '') {
    return null;
  }
  return JSON.parse(raw) as unknown;
}
