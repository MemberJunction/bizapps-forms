/**
 * When a share link is inside the window it agreed to accept responses in.
 *
 * One copy, because two gates ask it and must never answer differently: the respondent-host door
 * (`respondent-host/redeem.service.ts`, which refuses before minting an anonymous session) and the
 * submit path's definition loader. Each used to carry a verbatim copy of the cascade. A window rule
 * added to one and missed in the other lets a respondent open a form they cannot submit — which is
 * bizapps-forms#81's defect exactly, one field over.
 *
 * The response CAP is deliberately NOT part of this. The two gates genuinely differ on it: the door
 * refuses a full link outright, while the submit path lets a partial save and a knockout through
 * (neither consumes a slot) and applies the cap only to a terminal completion. See
 * {@link distributionQuotaExceeded} and each call site.
 */
import type { mjBizAppsFormsFormDistributionEntityType } from '@mj-biz-apps/forms-entities';

/**
 * Whether the link is outside its accepting window right now — switched off, closed, not yet
 * open, or past its closing date.
 *
 * Phrased as the refusal rather than as "is open" because both callers act on the negative, and
 * a predicate its callers must invert is one `!` away from being read backwards.
 */
export function distributionWindowClosed(
  dist: mjBizAppsFormsFormDistributionEntityType,
  now: Date,
): boolean {
  if (!dist.IsActive || dist.Status === 'Closed') {
    return true;
  }
  if (dist.OpenAt && new Date(dist.OpenAt) > now) {
    return true;
  }
  if (dist.CloseAt && new Date(dist.CloseAt) < now) {
    return true;
  }
  return false;
}
