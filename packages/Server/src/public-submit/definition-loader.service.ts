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
import type {
  mjBizAppsFormsFormDistributionEntityType,
  mjBizAppsFormsFormVersionEntityType,
  PublishedFormDefinition,
} from '@mj-biz-apps/forms-entities';
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

/** Escape a string literal for safe inclusion in a RunView `ExtraFilter`. */
function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
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
      ExtraFilter: `Slug=${sqlString(slug)}`,
      ResultType: 'simple',
    },
    contextUser,
  );
  if (!result.Success) {
    return undefined;
  }
  return result.Results[0];
}

/** Load the single Published version for a form, or `undefined`. */
async function loadPublishedVersion(
  provider: DefinitionRunViewProvider,
  formId: string,
  contextUser: UserInfo,
): Promise<mjBizAppsFormsFormVersionEntityType | undefined> {
  const result = await provider.RunView<mjBizAppsFormsFormVersionEntityType>(
    {
      EntityName: FORM_VERSION_ENTITY,
      ExtraFilter: `FormID=${sqlString(formId)} AND Status='Published'`,
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

/** Distribution is open if Active, not Closed, and within its open/close window. */
function distributionIsOpen(
  dist: mjBizAppsFormsFormDistributionEntityType,
  now: Date,
): boolean {
  if (!dist.IsActive || dist.Status === 'Closed') {
    return false;
  }
  if (dist.OpenAt && new Date(dist.OpenAt) > now) {
    return false;
  }
  if (dist.CloseAt && new Date(dist.CloseAt) < now) {
    return false;
  }
  return true;
}

/**
 * Resolve a slug to its published definition. `expectedVersionId`, when supplied
 * (submit path), pins the response to the version the widget rendered; a mismatch
 * is reported so a stale tab cannot submit against a re-published form.
 */
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
  if (!distributionIsOpen(distribution, now)) {
    return { ok: false, failure: 'distribution-closed' };
  }

  const version = await loadPublishedVersion(provider, distribution.FormID, contextUser);
  if (!version) {
    return { ok: false, failure: 'no-published-version' };
  }
  if (options.expectedVersionId && options.expectedVersionId !== version.ID) {
    return { ok: false, failure: 'version-mismatch' };
  }

  const definition = parsePublishedDefinition(version.DefinitionSnapshot);
  if (!definition) {
    return { ok: false, failure: 'invalid-snapshot' };
  }
  return { ok: true, value: { distribution, version, definition } };
}
