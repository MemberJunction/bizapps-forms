/**
 * The `EXEC` text for one of Forms' guarded-write stored procedures (#338).
 *
 * WHY PROCEDURES. MJ grants its runtime roles (cdp_Developer, cdp_Integration, cdp_UI) EXECUTE on
 * stored procedures and never rights on base tables, so a raw UPDATE or locking SELECT against a
 * Forms table is refused on a host whose MJAPI login holds only those roles. Each raw SQL Server
 * statement the server ran now lives in a procedure (migration V202610222300); ownership chaining
 * lets an EXECUTE-only caller run it. The PostgreSQL branches keep their raw statements.
 *
 * WHY A STRING THROUGH `ExecuteSQL`. The caller sends it on the SAME provider instance it already
 * uses, so the EXEC runs on that connection and inside its open transaction: a lock the procedure
 * takes is held until the caller commits, exactly as the inline statement's was.
 *
 * Values are inlined as literals (strings quoted with `quoteSqlString`, integers bare, `null` as
 * `NULL`) because `ExecuteSQL` here takes no bound parameters. Anything that cannot be rendered
 * safely throws before a statement exists.
 */
import type { DatabaseProviderBase } from '@memberjunction/core';
import { quoteSqlString } from '@mj-biz-apps/forms-entities';

/** A procedure parameter's value: a string, an integer, or `NULL`. */
export type ProcedureParamValue = string | number | null;

/** The parameter names this code passes are identifiers it controls; anything else is a bug. */
const PARAMETER_NAME = /^[A-Za-z][A-Za-z0-9]*$/;

/**
 * `EXEC [<schema of entityName>].[<procedure>] @A = 'x', @B = 5, @C = NULL` — parameters in the
 * order given. Throws when the entity is not in metadata, or a parameter cannot be rendered.
 */
export function formsProcedureCall(
  provider: Pick<DatabaseProviderBase, 'EntityByName' | 'QuoteSchemaAndView'>,
  entityName: string,
  procedure: string,
  params: Record<string, ProcedureParamValue>,
): string {
  const entity = provider.EntityByName(entityName);
  if (!entity) {
    throw new Error(`"${entityName}" is not in this host's metadata, so its procedure ${procedure} cannot be called.`);
  }
  return procedureCallInSchema(provider, entity.SchemaName, procedure, params);
}

/**
 * {@link formsProcedureCall} for a caller that already holds the entity's schema name — an entity
 * server subclass reading its own `EntityInfo`, whose provider is typed without `EntityByName`, or
 * a caller that looks the entity up itself so its missing-metadata error can name the record.
 */
export function procedureCallInSchema(
  provider: Pick<DatabaseProviderBase, 'QuoteSchemaAndView'>,
  schemaName: string,
  procedure: string,
  params: Record<string, ProcedureParamValue>,
): string {
  const args = Object.entries(params).map(([name, value]) => `@${name} = ${renderParam(procedure, name, value)}`);
  const target = `EXEC ${provider.QuoteSchemaAndView(schemaName, procedure)}`;
  return args.length === 0 ? target : `${target} ${args.join(', ')}`;
}

function renderParam(procedure: string, name: string, value: ProcedureParamValue): string {
  if (!PARAMETER_NAME.test(name)) {
    throw new Error(`${procedure}: parameter name ${JSON.stringify(name)} is not a plain identifier.`);
  }
  if (value === null) {
    return 'NULL';
  }
  if (typeof value === 'number') {
    // Safe integers only: a larger one (1e21) stringifies as `1e+21`, which T-SQL does not parse.
    if (!Number.isSafeInteger(value)) {
      throw new Error(`${procedure}: parameter @${name} must be a safe integer; got ${String(value)}.`);
    }
    return String(value);
  }
  return quoteSqlString(value);
}
