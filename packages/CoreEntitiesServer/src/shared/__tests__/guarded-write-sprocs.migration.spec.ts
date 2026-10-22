import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Shape checks on the #338 migration: the guarded-write procedures a roles-only MJAPI login runs
 * instead of raw SQL against base tables. A text check, not a database run: it pins the parts a
 * later edit could quietly lose — the grants, the absence of dynamic SQL (which would break
 * ownership chaining), and the lock hints and fences moved verbatim from the TypeScript.
 */
const MIGRATION = 'V202610222300__v0.16.x__Roles_Only_Guarded_Write_Sprocs.sql';
const migrationPath = fileURLToPath(new URL(`../../../../../migrations/${MIGRATION}`, import.meta.url));

const PROCEDURES = [
  'spFormDistributionConsumeResponseSlot',
  'spFormLockRowForQuota',
  'spFormResponseLockRow',
  'spFormAutomationEventBringPartialsForward',
  'spFormAutomationEventClaim',
  'spFormAutomationEventSettle',
  'spFormAutomationEventRenewLease',
  'spFormAutomationEventReplay',
  'spFormDistributionReadServerColumnsLocked',
] as const;

const SCHEMA = '[${flyway:defaultSchema}]';

function readMigration(): string {
  if (!existsSync(migrationPath)) {
    throw new Error(`The #338 migration is missing: expected it at ${migrationPath}.`);
  }
  return readFileSync(migrationPath, 'utf8');
}

/** The file with `--` line comments removed, so the header's prose cannot satisfy or fail a check. */
function codeOf(sql: string): string {
  return sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

/** The batch (between GO lines) that creates `name` — so an assertion checks the right procedure. */
function bodyOf(code: string, name: string): string {
  const batches = code.split(/^\s*GO\s*$/m);
  const matches = batches.filter((b) => b.includes(`CREATE PROCEDURE ${SCHEMA}.[${name}]`));
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one CREATE PROCEDURE batch for ${name}; found ${matches.length}.`);
  }
  return matches[0];
}

describe('#338 guarded-write procedures migration', () => {
  const sql = readMigration();
  const code = codeOf(sql);

  describe.each(PROCEDURES)('%s', (name) => {
    it('is dropped if it exists, created, and granted to exactly cdp_Developer and cdp_Integration', () => {
      expect(code).toContain(`DROP PROCEDURE IF EXISTS ${SCHEMA}.[${name}];`);
      expect(code).toContain(`CREATE PROCEDURE ${SCHEMA}.[${name}]`);
      const grants = code.match(new RegExp(String.raw`GRANT[^;]*\[${name}\][^;]*;`, 'g')) ?? [];
      expect(grants).toEqual([`GRANT EXECUTE ON ${SCHEMA}.[${name}] TO [cdp_Developer], [cdp_Integration];`]);
    });

    it('sets NOCOUNT so the caller reads only its own result set', () => {
      expect(bodyOf(code, name)).toContain('SET NOCOUNT ON;');
    });
  });

  it('creates no procedure beyond the nine', () => {
    const created = [...code.matchAll(/CREATE\s+PROCEDURE\s+\S+\.\[(\w+)\]/g)].map((m) => m[1]);
    expect(created.sort()).toEqual([...PROCEDURES].sort());
  });

  it('never grants cdp_UI anything', () => {
    for (const grant of code.match(/GRANT[^;]*;/g) ?? []) {
      expect(grant).not.toContain('cdp_UI');
    }
  });

  it('grants nothing on a base table', () => {
    expect(code).not.toMatch(/GRANT .* ON \[\$\{flyway:defaultSchema\}\]\.\[Form/);
  });

  it('runs no dynamic SQL, which would break ownership chaining', () => {
    expect(code).not.toMatch(/sp_executesql/i);
    expect(code).not.toMatch(/\bEXEC(UTE)?\s*\(/i);
  });

  it('uses no flyway placeholder but defaultSchema', () => {
    const placeholders = new Set([...sql.matchAll(/\$\{flyway:(\w+)\}/g)].map((m) => m[1]));
    expect([...placeholders]).toEqual(['defaultSchema']);
  });

  it('changes no table, column or entity', () => {
    expect(code).not.toMatch(/\b(CREATE|ALTER|DROP)\s+TABLE\b/i);
    expect(code).not.toMatch(/sp_addextendedproperty/i);
    expect(code).not.toMatch(/\bEntityField\b/);
  });

  it('carries @codegen-none with a reason', () => {
    expect(sql).toMatch(/^-- @codegen-none:[ \t]*\S.{20,}$/m);
  });

  it('claim: the verbatim due rule, ordering fence, lock hints, lease and OUTPUT INTO', () => {
    const body = bodyOf(code, 'spFormAutomationEventClaim');
    expect(body).toContain('@WorkerID NVARCHAR(100)');
    expect(body).toContain('@FormResponseID UNIQUEIDENTIFIER = NULL');
    expect(body).toContain('@BatchSize INT');
    expect(body).toContain('@LeaseSeconds INT');
    expect(body).toContain('DECLARE @claimed TABLE (');
    expect(body).toContain('TOP (@BatchSize)');
    expect(body).toContain('WITH (UPDLOCK, READPAST, ROWLOCK)');
    expect(body).toContain(
      "((e.[Status] = 'Pending' AND (e.[AttemptCount] = 0 OR e.[NextAttemptAt] <= SYSDATETIMEOFFSET())) OR (e.[Status] = 'Running' AND e.[LockedUntil] < SYSDATETIMEOFFSET()))",
    );
    expect(body).toContain('AND (@FormResponseID IS NULL OR e.[FormResponseID] = @FormResponseID)');
    expect(body).toContain(
      "AND NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[FormAutomationEvent] o WHERE o.[FormResponseID] = e.[FormResponseID] AND o.[Status] IN ('Pending', 'Running') AND (o.[__mj_CreatedAt] < e.[__mj_CreatedAt] OR (o.[__mj_CreatedAt] = e.[__mj_CreatedAt] AND o.[ID] < e.[ID])))",
    );
    expect(body).toContain('ORDER BY e.[__mj_CreatedAt], e.[ID]');
    expect(body).toContain('[LockedBy] = @WorkerID');
    expect(body).toContain('[LockedUntil] = DATEADD(SECOND, @LeaseSeconds, SYSDATETIMEOFFSET())');
    expect(body).toContain('[AttemptCount] = [AttemptCount] + 1');
    expect(body).toMatch(
      /OUTPUT inserted\.\[ID\], inserted\.\[FormResponseID\], inserted\.\[Trigger\], inserted\.\[PartialSaveKey\], inserted\.\[AttemptCount\], inserted\.\[IsReplay\]\s+INTO @claimed;/,
    );
    expect(body).toContain('SELECT [ID], [FormResponseID], [Trigger], [PartialSaveKey], [AttemptCount], [IsReplay] FROM @claimed;');
  });

  it.each(['spFormLockRowForQuota', 'spFormResponseLockRow', 'spFormDistributionReadServerColumnsLocked'])(
    '%s takes its lock with UPDLOCK, HOLDLOCK on the one row',
    (name) => {
      const body = bodyOf(code, name);
      expect(body).toContain('WITH (UPDLOCK, HOLDLOCK)');
      expect(body).toContain('WHERE [ID] = @ID');
    },
  );

  it('the lock procedures lock the right tables', () => {
    expect(bodyOf(code, 'spFormLockRowForQuota')).toContain(`SELECT [ID] FROM ${SCHEMA}.[Form] WITH (UPDLOCK, HOLDLOCK) WHERE [ID] = @ID;`);
    expect(bodyOf(code, 'spFormResponseLockRow')).toContain(`SELECT [ID] FROM ${SCHEMA}.[FormResponse] WITH (UPDLOCK, HOLDLOCK) WHERE [ID] = @ID;`);
    expect(bodyOf(code, 'spFormDistributionReadServerColumnsLocked')).toContain(
      `SELECT [MagicLinkInviteID], [PublicLinkToken], [ResponseCount] FROM ${SCHEMA}.[FormDistribution] WITH (UPDLOCK, HOLDLOCK) WHERE [ID] = @ID;`,
    );
  });

  it('slot: the conditional increment, and its affected-row count', () => {
    const body = bodyOf(code, 'spFormDistributionConsumeResponseSlot');
    expect(body).toContain(`UPDATE ${SCHEMA}.[FormDistribution] SET [ResponseCount] = [ResponseCount] + 1`);
    expect(body).toContain('([MaxResponses] IS NULL OR [ResponseCount] < [MaxResponses])');
    expect(body).toContain('SELECT @@ROWCOUNT AS [AffectedRows];');
  });

  it('settle: the lease fence, the three Pending CASE arms, and the missing-retry guard', () => {
    const body = bodyOf(code, 'spFormAutomationEventSettle');
    expect(body).toContain('@LastError NVARCHAR(MAX) = NULL');
    expect(body).toContain('@RetryAfterSeconds INT = NULL');
    expect(body).toContain("WHERE [ID] = @ID AND [Status] = 'Running' AND [LockedBy] = @WorkerID");
    expect(body).toContain("[NextAttemptAt] = CASE WHEN @Status = 'Pending' THEN DATEADD(SECOND, @RetryAfterSeconds, SYSDATETIMEOFFSET()) ELSE [NextAttemptAt] END");
    expect(body).toContain("[CompletedAt] = CASE WHEN @Status = 'Pending' THEN NULL ELSE SYSDATETIMEOFFSET() END");
    expect(body).toContain("[IsReplay] = CASE WHEN @Status = 'Pending' THEN [IsReplay] ELSE 0 END");
    expect(body).toMatch(/IF @Status = 'Pending' AND @RetryAfterSeconds IS NULL[\s\S]*THROW 50000,/);
    expect(body).toContain('SELECT @@ROWCOUNT AS [AffectedRows];');
  });

  it('renew: fenced on the lease, pushed out by @LeaseSeconds', () => {
    const body = bodyOf(code, 'spFormAutomationEventRenewLease');
    expect(body).toContain('[LockedUntil] = DATEADD(SECOND, @LeaseSeconds, SYSDATETIMEOFFSET())');
    expect(body).toContain("WHERE [ID] = @ID AND [Status] = 'Running' AND [LockedBy] = @WorkerID");
    expect(body).toContain('SELECT @@ROWCOUNT AS [AffectedRows];');
  });

  it('replay: fenced on DeadLetter', () => {
    const body = bodyOf(code, 'spFormAutomationEventReplay');
    expect(body).toContain("WHERE [ID] = @ID AND [Status] = 'DeadLetter'");
    expect(body).toContain('SELECT @@ROWCOUNT AS [AffectedRows];');
  });

  it('bring-forward: only this response’s waiting OnPartial events', () => {
    const body = bodyOf(code, 'spFormAutomationEventBringPartialsForward');
    expect(body).toContain(
      "WHERE [FormResponseID] = @FormResponseID AND [Trigger] = 'OnPartial' AND [Status] = 'Pending' AND [NextAttemptAt] > SYSDATETIMEOFFSET()",
    );
  });
});
