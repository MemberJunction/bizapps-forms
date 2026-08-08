/**
 * The MemberJunction implementation of {@link BindingTargetGateway} — everything the binding
 * executor needs from the database, and nothing about what it should do with it.
 *
 * Runs entirely under the caller's `contextUser`, which for the submit path is the automation
 * service principal and never the anonymous respondent. That separation is the whole security
 * story of binding: the respondent's grants let them create a response, and the elevated write to
 * a business entity happens downstream, from configuration the client never supplied.
 */
import { CompositeKey, LogError, Metadata, RunView } from '@memberjunction/core';
import type { BaseEntity, EntityInfo, UserInfo } from '@memberjunction/core';
import type { CanonicalAnswerValue, IdentityNormalization } from '@mj-biz-apps/forms-entities';
import type { BindingTargetGateway, EntityCapability, MatchedRecord, MatchQuery } from './binding-executor';

export class MJBindingGateway implements BindingTargetGateway {
  constructor(private readonly contextUser: UserInfo) {}

  /**
   * Writable field names for the entity, or null when it cannot be written at all.
   *
   * `EntityFieldInfo.ReadOnly` already folds in primary keys, the special date columns and
   * `AllowUpdateAPI`, so it is the single question worth asking. Entity-level API flags are
   * checked separately because no role grant can override them — a binding pointed at an entity
   * with `AllowCreateAPI` off would fail on every single submission, and finding that out at
   * authoring time is much cheaper.
   */
  public async describeEntity(entityName: string, needs: EntityCapability): Promise<ReadonlySet<string> | null> {
    const entity = new Metadata().EntityByName(entityName);
    if (!entity || !entity.IncludeInAPI || entity.VirtualEntity) {
      return null;
    }
    // Checked against what this binding's identity mode can actually DO, not merely "can it be
    // written at all". An entity with creates disabled and updates enabled would pass an
    // either-flag check and then fail on every submission that had no match — at write time, per
    // response, in production, instead of once at authoring time.
    if (needs.create && !entity.AllowCreateAPI) {
      return null;
    }
    if (needs.update && !entity.AllowUpdateAPI) {
      return null;
    }
    return new Set(entity.Fields.filter((f) => !f.ReadOnly).map((f) => f.Name));
  }

  /**
   * The oldest record matching every criterion, or null when none does.
   *
   * `MaxRows: 2` because the only thing worth knowing beyond "the oldest one" is whether there IS
   * more than one; fetching the rest would cost more and tell us nothing we act on. Ordering by
   * creation date makes the choice deterministic, so two runs over the same duplicates converge on
   * the same record instead of alternating between them.
   *
   * Throws rather than returning null when the read fails — the executor must be able to tell "no
   * such record" from "we could not find out", because the two lead to opposite actions.
   */
  public async findMatch(query: MatchQuery): Promise<MatchedRecord | null> {
    const filter = query.criteria.map(criterionToSql).join(' AND ');
    const result = await new RunView().RunView<Record<string, unknown>>(
      {
        EntityName: query.entityName,
        ExtraFilter: filter,
        OrderBy: '__mj_CreatedAt ASC',
        MaxRows: 2,
        ResultType: 'simple',
      },
      this.contextUser,
    );
    if (!result.Success) {
      throw new Error(result.ErrorMessage ?? 'identity lookup failed');
    }
    if (result.Results.length === 0) {
      return null;
    }

    const [oldest] = result.Results;
    const entity = new Metadata().EntityByName(query.entityName);
    const recordId = primaryKeyOf(oldest, entity);
    if (!recordId) {
      throw new Error(`Matched a record of "${query.entityName}" with no readable primary key.`);
    }
    if (result.Results.length > 1) {
      // Reported, never repaired: merging two real records is a decision with no undo, and this
      // code has no way to know which duplicate is the good one.
      LogError(
        `Forms entity binding: identity matched ${result.Results.length}+ records of "${query.entityName}" — binding to the oldest (${recordId}). These need merging by hand.`,
      );
    }
    return { recordId, values: new Map(Object.entries(oldest)), multipleFound: result.Results.length > 1 };
  }

  /** Create or update the record, returning its primary key. */
  public async writeRecord(
    entityName: string,
    recordId: string | null,
    values: ReadonlyMap<string, CanonicalAnswerValue>,
  ): Promise<string> {
    const md = new Metadata();
    const record = await md.GetEntityObject<BaseEntity>(entityName, this.contextUser);
    if (!record) {
      // GetEntityObject logs and returns null rather than throwing, so an unchecked call here would
      // fail later with a message about a property of null.
      throw new Error(`Could not create an entity object for "${entityName}".`);
    }

    if (recordId === null) {
      record.NewRecord();
    } else if (!(await record.InnerLoad(compositeKeyFor(entityName, recordId)))) {
      throw new Error(`Could not load "${entityName}" record ${recordId}.`);
    }

    for (const [field, value] of values) {
      // Set() routes inherited columns to the parent of an IS-A entity, which is why a child like
      // Applicant can be created together with its Person in one save.
      record.Set(field, value);
    }

    if (!(await record.Save())) {
      throw new Error(record.LatestResult?.CompleteMessage ?? 'save failed');
    }
    // Bare values joined by '|', matching what `primaryKeyOf` produces on the read side and what
    // `compositeKeyFor` parses back. NOT `PrimaryKey.ToConcatenatedString()`, which emits MJ's
    // `FieldName|Value` form ("ID|9f3e…"): that reads back as a value no query can join to the
    // target's ID column, and it would have put two different spellings of the same record into
    // one ledger column depending on whether the submission created it or left it unchanged.
    return record.PrimaryKey.KeyValuePairs.map((pair) => String(pair.Value)).join('|');
  }
}

/**
 * Render one criterion as SQL, normalising both sides the same way.
 *
 * Normalisation is applied to the COLUMN as well as the value, because matching a lower-cased
 * value against a raw column only works by accident of collation — and the accident differs
 * between SQL Server and PostgreSQL, so a binding that matched in one would silently create
 * duplicates in the other.
 */
function criterionToSql(criterion: { field: string; value: string; normalize: IdentityNormalization }): string {
  const column = `[${criterion.field}]`;
  switch (criterion.normalize) {
    case 'LowerCaseTrim':
      return `LOWER(LTRIM(RTRIM(${column}))) = ${sqlLiteral(criterion.value.trim().toLowerCase())}`;
    case 'Trim':
      return `LTRIM(RTRIM(${column})) = ${sqlLiteral(criterion.value.trim())}`;
    case 'ExactMatch':
    default:
      return `${column} = ${sqlLiteral(criterion.value)}`;
  }
}

/**
 * Single-quote a value for SQL, doubling any quote it contains.
 *
 * `N`-prefixed so the literal is nvarchar. Without it SQL Server parses the literal as varchar in
 * the database's collation codepage, which silently replaces any character that codepage lacks
 * with `?` BEFORE the comparison happens — so a respondent whose name or email contains a
 * non-Latin character matches nothing, and the binding creates them a second record on every
 * submission. PostgreSQL rejects the prefix, which is why this is behind a dialect check.
 */
export function sqlLiteral(value: string, dialect: 'sqlserver' | 'postgresql' = 'sqlserver'): string {
  const quoted = `'${value.replace(/'/g, "''")}'`;
  return dialect === 'sqlserver' ? `N${quoted}` : quoted;
}

/** Read the primary key out of a `simple` result row, pipe-joined for a composite key. */
function primaryKeyOf(row: Record<string, unknown>, entity: EntityInfo | undefined): string | null {
  const keyFields = entity?.PrimaryKeys ?? [];
  if (keyFields.length === 0) {
    return typeof row.ID === 'string' ? row.ID : null;
  }
  const parts = keyFields.map((f) => row[f.Name]);
  return parts.some((p) => p === undefined || p === null) ? null : parts.join('|');
}

/**
 * Rebuild the composite key for a load from the pipe-joined form produced above.
 *
 * Pipe-joined in primary-key order is MJ's own serialization for this (the integration engine's
 * record map uses it), so a value written here stays readable by anything else that understands
 * the convention.
 */
function compositeKeyFor(entityName: string, recordId: string): CompositeKey {
  const keyFields = new Metadata().EntityByName(entityName)?.PrimaryKeys ?? [];
  const values = recordId.split('|');
  if (keyFields.length <= 1) {
    return CompositeKey.FromKeyValuePair(keyFields[0]?.Name ?? 'ID', recordId);
  }
  return new CompositeKey(keyFields.map((field, index) => ({ FieldName: field.Name, Value: values[index] })));
}
