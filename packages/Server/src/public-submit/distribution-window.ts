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
 * Why the link is outside its window: it has not opened yet, or it is closed for good (switched
 * off, not Active, or past its closing date). Only the first is a state the holder can wait out.
 */
export type DistributionWindowRefusal = 'not-yet-open' | 'closed';

/**
 * Why the link is outside its accepting window right now, or `undefined` when it is inside it.
 *
 * The reason exists for the door: "opens next Monday" and "no longer accepting responses" are
 * opposite statements to the person holding the link, and the door used to make the second one
 * for both (bizapps-forms#118). The submit gate only needs the boolean below, which is DERIVED
 * from this — one rule, two views of it — so the two gates cannot disagree about whether a link
 * is open, and the door never carries its own spelling of `OpenAt > now`.
 *
 * `Status !== 'Active'` rather than `Status === 'Closed'`: only an Active link is taking
 * responses, and that is what the other two surfaces already say — the magic-link minter refuses
 * to mint for anything else (`provisioning-decision.ts`) and the builder badges it "Paused".
 * `Draft` is this column's DEFAULT, so testing for `Closed` alone let a Draft link open in full
 * while its author was being told "Turned off. Anyone opening it is told the form is not taking
 * responses." The minter is not the backstop it looks like: it never UN-mints, so a link that was
 * Active once and is later set back to Draft still carries a working token.
 *
 * A switched-off or non-Active link is `'closed'` even when its `OpenAt` is in the future: the
 * author has taken it out of service, and "opens later" would promise something that is not so.
 */
export function distributionWindowRefusal(
  dist: mjBizAppsFormsFormDistributionEntityType,
  now: Date,
): DistributionWindowRefusal | undefined {
  if (!dist.IsActive || dist.Status !== 'Active') {
    return 'closed';
  }
  if (dist.CloseAt && new Date(dist.CloseAt) < now) {
    return 'closed';
  }
  if (dist.OpenAt && new Date(dist.OpenAt) > now) {
    return 'not-yet-open';
  }
  return undefined;
}

/**
 * Whether the link is outside its accepting window right now — the boolean the submit gate acts
 * on. Phrased as the refusal rather than as "is open" because both callers act on the negative,
 * and a predicate its callers must invert is one `!` away from being read backwards.
 */
export function distributionWindowClosed(
  dist: mjBizAppsFormsFormDistributionEntityType,
  now: Date,
): boolean {
  return distributionWindowRefusal(dist, now) !== undefined;
}
