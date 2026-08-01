/**
 * Boot-time readiness check for the anonymous respondent path.
 *
 * Forms needs one thing from its HOST that it cannot install itself: core `magicLink`
 * must be enabled, with the restricted respondent role grantable. Without it the
 * minter's graceful gate skips, `FormDistribution.PublicLinkToken` stays null, and
 * every public link answers 409 "This form link is not ready yet."
 *
 * The problem is *when* that surfaces. The gate fires when a distribution is saved —
 * long after install, on someone else's screen, with a message that reads like a
 * transient glitch rather than a missing setting. A host can install Forms, watch a
 * clean boot, publish a form, and only then discover its public link never worked.
 *
 * So the check runs at startup, where the operator can still act on it. Kept as a pure
 * function over plain config so it is testable without booting a server, and so the
 * message lives next to the reason rather than inside a middleware.
 */

/** The shape this check needs from the host's MJ config. */
export interface HostMagicLinkConfig {
  enabled?: boolean;
  restrictedRoleName?: string;
  grantableRoleNames?: string[];
}

/** Outcome of the readiness check: ready, or not with a reason the operator can act on. */
export type RespondentReadiness =
  | { ready: true }
  | { ready: false; reason: string };

/** The role Forms' anonymous sessions are granted by default. Seeded by this app's metadata. */
export const RESPONDENT_ROLE = 'Form Respondent';

/**
 * Whether this host can mint the anonymous links public forms depend on.
 *
 * Two ways it can be unready, each with a distinct fix, so they get distinct messages rather
 * than one vague "check your config".
 *
 * @param magicLink the host's core `magicLink` config
 * @param roleName  the role THIS app's minter grants — pass the value the minter uses
 *                  (`FORMS_MAGICLINK_ROLE`) so the check cannot drift from what is actually
 *                  minted. Defaults to {@link RESPONDENT_ROLE}.
 *
 * Deliberately does NOT inspect `magicLink.restrictedRoleName`. That deployment-global is only
 * core's default for invites that name no role (`isRoleGrantable` treats it as one more allowed
 * name, and `isProtectedAccount` already includes the invited role in its allowed set). Forms'
 * minter always names its role, so the global is irrelevant to us — and requiring it to equal
 * ours made every stock host unready, since core defaults it to 'Magic Link Baseline'. Worse, it
 * is one value per deployment, so demanding it meant no second Open App could ever be ready on
 * the same MJAPI instance. The real requirement is grantability, checked below.
 */
export function checkRespondentReadiness(
  magicLink: HostMagicLinkConfig | undefined,
  roleName: string = RESPONDENT_ROLE,
): RespondentReadiness {
  if (!magicLink || magicLink.enabled !== true) {
    return {
      ready: false,
      reason:
        `core 'magicLink' is not enabled on this host. Public forms will publish, but every ` +
        `link will answer 409 because no anonymous session can be minted. Set magicLink.enabled ` +
        `= true in the host's MJAPI config.`,
    };
  }
  // Deliberately mirrors core's `isRoleGrantable` (auth/magicLink/magicLinkCore): a role is
  // grantable if it is the restricted role OR appears in grantableRoleNames, compared through
  // core's own `normalizeName` (`n.trim().toLowerCase()`). Duplicated rather than imported
  // because core does not export it from its public surface, and reaching into
  // `@memberjunction/server/dist/auth/...` would couple us to its internal file layout. If core
  // ever exports it, delete this and call it — the point is to agree with core, not to have an
  // opinion. The normalization is part of that agreement: without it a host that spelled the
  // role 'form respondent' was told it could not grant a role core would grant it. Getting this
  // wrong only ever produces a wrong BOOT WARNING, never a wrong authorization decision — core
  // re-checks grantability itself at mint time.
  //
  // Two details are load-bearing beyond the comparison itself. The `typeof` filter is not
  // belt-and-braces: `magicLink` is host config parsed from JSON, where an operator blanking a
  // value writes `null` — a value the TypeScript shape does not admit but the runtime hands us
  // anyway — and this runs inside boot middleware, where throwing is strictly worse than any
  // wrong verdict. The empty-target guard mirrors core's own `if (!target) return false`, which
  // it checks BEFORE consulting the allow-list, so a blank name is never grantable.
  const normalize = (name: string): string => name.trim().toLowerCase();
  const target = normalize(roleName ?? '');
  const allowed = new Set(
    [magicLink.restrictedRoleName, ...(magicLink.grantableRoleNames ?? [])]
      .filter((n): n is string => typeof n === 'string')
      .map(normalize),
  );
  if (!target || !allowed.has(target)) {
    return {
      ready: false,
      reason:
        `core 'magicLink' is enabled but '${roleName}' is not in ` +
        `magicLink.grantableRoleNames, so invites cannot grant it. Add it, or anonymous ` +
        `respondents will have no permission to create responses.`,
    };
  }
  return { ready: true };
}
