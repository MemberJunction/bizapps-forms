/**
 * Resolve a public distribution slug to its published form definition.
 *
 * Path (FORMS_BUILD_PLAN §4): `distributionSlug` -> FormDistribution -> Form ->
 * the Published FormVersion. The version's `DefinitionSnapshot` IS the immutable
 * `PublishedFormDefinition` captured at publish time (see the contract's
 * `form-definition.ts`), so the widget receives exactly what was published — it
 * does not drift if the underlying entity columns later change.
 *
 * All reads go through the per-request `provider` with the anonymous `contextUser`,
 * so the magic-link read scope is enforced. `RunView` results are checked for
 * `.Success`; a missing/closed distribution yields a typed not-found result rather
 * than a throw.
 */
import type { RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import { quoteSqlString } from '@mj-biz-apps/forms-entities';
import type {
  mjBizAppsFormsFormDistributionEntityType,
  mjBizAppsFormsFormVersionEntityType,
  PublishedFormDefinition,
} from '@mj-biz-apps/forms-entities';
import { distributionWindowClosed } from './distribution-window';
import { FORM_DISTRIBUTION_ENTITY, FORM_VERSION_ENTITY } from './entity-names';
import { parsePublishedDefinition } from './snapshot-parser';

/**
 * The narrow slice of a data provider this flow uses — a single `RunView`. Typed minimally
 * (not the full `IRunViewProvider`) so BOTH the per-request `DatabaseProviderBase` (submit
 * pipeline) and a global `RunView` instance (upload endpoint) satisfy it without casts.
 */
export interface DefinitionRunViewProvider {
  RunView<T = unknown>(params: RunViewParams, contextUser?: UserInfo): Promise<RunViewResult<T>>;
}

/** Why a slug could not be resolved to an open, published form. */
export type DefinitionLoadFailure =
  | 'distribution-not-found'
  | 'distribution-closed'
  | 'no-published-version'
  | 'version-mismatch'
  | 'invalid-snapshot';

/** Successful resolution: the distribution row, version row, and parsed definition. */
export interface ResolvedDefinition {
  distribution: mjBizAppsFormsFormDistributionEntityType;
  version: mjBizAppsFormsFormVersionEntityType;
  definition: PublishedFormDefinition;
}

/**
 * Load result. Flat (non-discriminated) shape so field access is safe under this
 * package's non-`strictNullChecks` compile (see persistence.service for rationale).
 */
export interface DefinitionLoadResult {
  ok: boolean;
  value?: ResolvedDefinition;
  failure?: DefinitionLoadFailure;
}

/** Load the active distribution row for a slug, or `undefined` if none/closed. */
async function loadDistribution(
  provider: DefinitionRunViewProvider,
  slug: string,
  contextUser: UserInfo,
): Promise<mjBizAppsFormsFormDistributionEntityType | undefined> {
  const result = await provider.RunView<mjBizAppsFormsFormDistributionEntityType>(
    {
      EntityName: FORM_DISTRIBUTION_ENTITY,
      ExtraFilter: `Slug=${quoteSqlString(slug)}`,
      ResultType: 'simple',
    },
    contextUser,
  );
  if (!result.Success) {
    return undefined;
  }
  return result.Results[0];
}

/**
 * The `ExtraFilter` that means "a Published version of this form".
 *
 * Exported because the respondent-host door refuses a link whose form has none (bizapps-forms#118)
 * with an existence read of its own — it needs a yes/no, not the snapshot — and the two gates must
 * mean the same thing by "published". Sharing the filter is what guarantees that: a version this
 * gate would serve is one the door would admit, and vice versa.
 */
export function publishedVersionFilter(formId: string): string {
  return `FormID=${quoteSqlString(formId)} AND Status='Published'`;
}

/**
 * Load the single Published version for a form, or `undefined`.
 *
 * "Single" is now true of the data: publishing retires the incumbent in the same transaction and
 * `UQ_FormVersion_OnePublishedPerForm` keeps a second one unrepresentable (#82). It used to be an
 * assumption the data contradicted — one dev form carried three simultaneously-Published versions
 * — and this `ORDER BY` was the only reason the newest one was the one being served.
 *
 * The ordering stays for exactly that reason: it is what makes this correct on a host whose
 * database has not yet run the backfill migration.
 */
async function loadPublishedVersion(
  provider: DefinitionRunViewProvider,
  formId: string,
  contextUser: UserInfo,
): Promise<mjBizAppsFormsFormVersionEntityType | undefined> {
  const result = await provider.RunView<mjBizAppsFormsFormVersionEntityType>(
    {
      EntityName: FORM_VERSION_ENTITY,
      ExtraFilter: publishedVersionFilter(formId),
      OrderBy: 'VersionNumber DESC',
      ResultType: 'simple',
    },
    contextUser,
  );
  if (!result.Success) {
    return undefined;
  }
  return result.Results[0];
}

/**
 * Resolve a slug to its published definition. `expectedVersionId`, when supplied
 * (submit path), pins the response to the version the widget rendered; a mismatch
 * is reported so a stale tab cannot submit against a re-published form.
 */
/**
 * Compare two `uniqueidentifier` values for identity.
 *
 * A GUID is case-insensitive, but the two sides of this comparison reliably disagree
 * on case: MJ mints the PK client-side at `NewRecord()` and the publish snapshot
 * embeds THAT spelling (lowercase) as `formVersionId`, while SQL Server returns the
 * stored column uppercased. The respondent widget echoes the snapshot's spelling back
 * on submit, so a case-sensitive `!==` rejected every single anonymous submission with
 * `version-mismatch` — the one path the whole product exists to serve.
 *
 * Trimmed because the value arrives from a JSON payload over the wire.
 */
function sameGuid(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export async function resolvePublishedDefinition(
  provider: DefinitionRunViewProvider,
  slug: string,
  contextUser: UserInfo,
  options: { expectedVersionId?: string; now?: Date } = {},
): Promise<DefinitionLoadResult> {
  const now = options.now ?? new Date();
  const distribution = await loadDistribution(provider, slug, contextUser);
  if (!distribution) {
    return { ok: false, failure: 'distribution-not-found' };
  }
  // The window only — deliberately not the response cap, unlike the respondent-host door, which
  // refuses a full link outright (bizapps-forms#81). This gate runs for EVERY submit, including a
  // partial save and a disqualifying knockout, neither of which consumes a slot; folding the cap
  // in here would strand a respondent already mid-form and would replace `checkQuotas`' specific
  // "(quota reached)" message with a generic closure. The cap belongs where that gate applies it:
  // on a terminal completion, as the authority for the last-slot race between two respondents.
  if (distributionWindowClosed(distribution, now)) {
    return { ok: false, failure: 'distribution-closed' };
  }

  const version = await loadPublishedVersion(provider, distribution.FormID, contextUser);
  if (!version) {
    return { ok: false, failure: 'no-published-version' };
  }
  if (options.expectedVersionId && !sameGuid(options.expectedVersionId, version.ID)) {
    return { ok: false, failure: 'version-mismatch' };
  }

  const definition = parsePublishedDefinition(version.DefinitionSnapshot);
  if (!definition) {
    return { ok: false, failure: 'invalid-snapshot' };
  }
  return { ok: true, value: { distribution, version, definition } };
}
