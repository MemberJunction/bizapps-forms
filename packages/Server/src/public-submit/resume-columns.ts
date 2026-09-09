/**
 * The three touch-points of the two columns `V202609031200__v0.12.x__Resume_Own_Response.sql` adds:
 * `FormResponse.FormDistributionID` and `FormDistribution.AllowDeviceResume`.
 *
 * They stay together in one module because they are one rule seen from three sides — which link a
 * response came through, and whether that link will hand this browser a pointer back to it. A
 * reader who changes one almost always has to look at the others.
 *
 * These were stubs that failed closed while the migration was unapplied and CodeGen had therefore
 * not put either property on the generated entity types. Both now exist, so the stubs are gone and
 * the feature is live. If you are bringing a host forward, the column adds and the regenerated
 * procedures are both in that migration; there is nothing else to switch on.
 */
import type { mjBizAppsFormsFormDistributionEntityType, mjBizAppsFormsFormResponseEntity } from '@mj-biz-apps/forms-entities';

/**
 * Stamp the link a response came through, once, when the row is created.
 *
 * Write-once like the owner column beside it, and for a sharper reason: this column is the
 * authorization key a resumed session reads its own distribution through, so a later save must
 * never be able to move a row to another link. Guarded on the column's own emptiness rather than on
 * a "is this the first write?" flag computed elsewhere — one condition, not two free to disagree.
 */
export function stampFormDistribution(
  response: mjBizAppsFormsFormResponseEntity,
  distributionId: string,
): void {
  if (!response.FormDistributionID) {
    response.FormDistributionID = distributionId;
  }
}

/**
 * The link's own answer to "may this browser hold a pointer to a draft of mine?".
 *
 * Compared against `true` explicitly rather than coerced: the column is `BIT NOT NULL DEFAULT (1)`,
 * but the value reaches here through `BaseEntity.Get`, and a truthiness test would read a string
 * `'0'` — which is what some drivers hand back for a BIT — as permission granted.
 */
export function deviceResumeAllowed(
  distribution: Pick<mjBizAppsFormsFormDistributionEntityType, 'AllowDeviceResume'>,
): boolean {
  return distribution.AllowDeviceResume === true;
}

/**
 * The link a stored response came through, for the `/remember` guard that requires it to match the
 * distribution the caller's JWT is scoped to (design review finding 2).
 *
 * `undefined` means "cannot tell", and the caller treats that as a REFUSAL rather than a pass — so
 * a legacy row, which keeps this column NULL and is resumable by neither channel, is refused here
 * rather than somewhere further in.
 */
export function distributionOfResponse(
  response: Pick<mjBizAppsFormsFormResponseEntity, 'FormDistributionID'>,
): string | undefined {
  return response.FormDistributionID ?? undefined;
}
