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

/** The role Forms' anonymous sessions are granted. Seeded by this app's metadata. */
export const RESPONDENT_ROLE = 'Form Respondent';

/**
 * Whether this host can mint the anonymous links public forms depend on.
 *
 * Three ways it can be unready, each with a distinct fix, so they get distinct messages
 * rather than one vague "check your config".
 */
export function checkRespondentReadiness(magicLink: HostMagicLinkConfig | undefined): RespondentReadiness {
  if (!magicLink || magicLink.enabled !== true) {
    return {
      ready: false,
      reason:
        `core 'magicLink' is not enabled on this host. Public forms will publish, but every ` +
        `link will answer 409 because no anonymous session can be minted. Set magicLink.enabled ` +
        `= true in the host's MJAPI config.`,
    };
  }
  const grantable = magicLink.grantableRoleNames ?? [];
  if (!grantable.includes(RESPONDENT_ROLE)) {
    return {
      ready: false,
      reason:
        `core 'magicLink' is enabled but '${RESPONDENT_ROLE}' is not in ` +
        `magicLink.grantableRoleNames, so invites cannot grant it. Add it, or anonymous ` +
        `respondents will have no permission to create responses.`,
    };
  }
  if (magicLink.restrictedRoleName !== RESPONDENT_ROLE) {
    return {
      ready: false,
      reason:
        `core 'magicLink' has restrictedRoleName='${magicLink.restrictedRoleName ?? '(unset)'}' ` +
        `rather than '${RESPONDENT_ROLE}'. Anonymous sessions would be restricted to the wrong ` +
        `role and could carry permissions Forms never intended to grant.`,
    };
  }
  return { ready: true };
}
