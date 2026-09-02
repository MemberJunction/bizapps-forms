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
 * Whether the link is outside its accepting window right now — switched off, not yet opened for
 * responses, closed, not yet open, or past its closing date.
 *
 * Phrased as the refusal rather than as "is open" because both callers act on the negative, and
 * a predicate its callers must invert is one `!` away from being read backwards.
 *
 * `Status !== 'Active'` rather than `Status === 'Closed'`: only an Active link is taking
 * responses, and that is what the other two surfaces already say — the magic-link minter refuses
 * to mint for anything else (`provisioning-decision.ts`) and the builder badges it "Paused".
 * `Draft` is this column's DEFAULT, so testing for `Closed` alone let a Draft link open in full
 * while its author was being told "Turned off. Anyone opening it is told the form is not taking
 * responses."
 *
 * This gate does NOT lean on the credential, and that has survived a change in what the credential
 * does. It used to be that the minter never un-minted, so a link set back to `Draft` kept a working
 * token and this was the only thing stopping it — bizapps-forms#104 changed that: the lifecycle hook
 * now revokes on the way out, and a paused link normally holds no credential at all. The gate is
 * still load-bearing anyway, for two reasons that outlive the fix. Revocation rides `Save()`, so a
 * raw SQL `UPDATE` that closes a link revokes nothing until something next saves that row; and the
 * hook is deliberately fail-soft, so a revoke the host refused (no Update on `MJ: Magic Link
 * Invites`, say) leaves a live credential behind and logs it. In both cases THIS is what refuses the
 * submission. Two independent layers was the point of #81/#90 and it still is.
 */
export function distributionWindowClosed(
  dist: mjBizAppsFormsFormDistributionEntityType,
  now: Date,
): boolean {
  if (!dist.IsActive || dist.Status !== 'Active') {
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
