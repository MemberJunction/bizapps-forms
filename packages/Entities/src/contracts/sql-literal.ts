/**
 * The one place the SHIPPED CODE knows how to put a string into SQL.
 *
 * "Shipped code" is the honest boundary and is meant literally: this covers the TypeScript under
 * `packages/<pkg>/src` that installs on someone's database. Nine further copies live in `smoke/` and
 * `smoke/lib/fixture.mjs`, and they stay there — those are stdlib-only Node scripts that run before
 * (and in order to test) a build, so importing a built package would make the test suite depend on
 * the artifact under test. Do not "finish the job" by consolidating those; read `smoke/lib/sqlcmd.mjs`
 * for why that layer keeps its own copies of small helpers.
 *
 * There were sixteen. Seven were named local functions spelled four different ways (`sqlLiteral`,
 * `escapeSql`, `sqlString`, and a `sqlLikeLiteral` that layers wildcard escaping on top) and nine
 * were the doubling written inline at the call site. They had already drifted in three ways that
 * matter: one N-prefixes the literal and the rest do not, one tolerates `null`/`undefined` and the
 * rest would throw on it, and one escapes LIKE wildcards. That is not sixteen copies of one
 * decision — it is four different decisions about the same question, none of them written down, and
 * the file-link gateway's copy had a comment saying so and predicting this module.
 *
 * Living in `forms-entities` is what makes it reachable: forms-actions, forms-server AND forms-ng
 * already depend on this package (its own only dependency is zod), so nothing here creates a new
 * edge in the dependency graph. The alternative that was actually available before — importing the
 * binding gateway's exported copy — would have made the file-link module depend on the
 * entity-binding gateway for string quoting, which is the coupling that kept the duplication alive.
 *
 * WHAT THIS IS NOT. It is not a query builder and it is not a sanitiser that makes untrusted input
 * safe to concatenate. It is the escaping rule for a value you have already decided belongs in a
 * literal — chiefly MJ `RunView` `ExtraFilter` strings, which take SQL text and offer no parameter
 * binding. Where a parameterised path exists, use it instead of this.
 */

/**
 * Double any single quotes — the one escaping rule a SQL string literal has.
 *
 * Returns the BODY of a literal, without the surrounding quotes, for call sites that build the
 * quoting themselves (`` `FileID='${escapeSqlString(id)}'` ``). Prefer {@link quoteSqlString}, which
 * cannot be misassembled; this exists because several call sites already write the quotes into a
 * longer template and rewriting them would have made a pure refactor edit more than the escaping.
 */
export function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * A quoted SQL string literal: `O'Brien` → `'O''Brien'`. Valid on every dialect.
 *
 * The default for new code. See {@link sqlLiteral} for the nvarchar-prefixed variant and the reason
 * the difference is not cosmetic.
 */
export function quoteSqlString(value: string): string {
  return `'${escapeSqlString(value)}'`;
}

/**
 * Single-quote a value for SQL, doubling any quote it contains.
 *
 * `N`-prefixed so the literal is nvarchar. Without it SQL Server parses the literal as varchar in
 * the database's collation codepage, which silently replaces any character that codepage lacks
 * with `?` BEFORE the comparison happens — so a respondent whose name or email contains a
 * non-Latin character matches nothing, and the binding creates them a second record on every
 * submission.
 *
 * The `dialect` parameter exists because PostgreSQL rejects that prefix, but NOTHING SELECTS IT
 * TODAY: every caller takes the SQL Server default, and there is no runtime dialect detection
 * anywhere in this package. Binding against a PostgreSQL-backed deployment therefore needs that
 * detection wired in first — the parameter is the seam for it, not evidence that it is handled.
 *
 * ⚠️ NOT INTERCHANGEABLE WITH {@link quoteSqlString}, even though the outputs differ by one
 * character. The prefix changes how SQL Server COMPARES the literal, per the paragraph above, so
 * moving a call site from one to the other is a behaviour change and not a tidy-up. The consolidation
 * that created this module deliberately preserved each call site's existing choice rather than
 * unifying them; upgrading the plain-quoted sites is a separate decision that wants its own
 * reasoning and its own smoke run.
 */
export function sqlLiteral(value: string, dialect: 'sqlserver' | 'postgresql' = 'sqlserver'): string {
  const quoted = quoteSqlString(value);
  return dialect === 'sqlserver' ? `N${quoted}` : quoted;
}
