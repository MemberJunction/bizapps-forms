/**
 * Boot-time readiness checks for the anonymous respondent path.
 *
 * Forms needs three things from its HOST that it cannot install itself, and each one stays
 * silent until a respondent pays for it if nobody asks at boot:
 *
 *  1. core `magicLink` enabled, with the respondent role grantable. Without it the minter's
 *     graceful gate skips, `FormDistribution.PublicLinkToken` stays null, and every public link
 *     answers 409 "This form link is not ready yet."
 *  2. a real magic-link provisioning user. Core's default for it is a literal placeholder that
 *     resolves to nobody, so every link open logged an error and provisioned the respondent's
 *     anonymous account under whichever user happened to be an Owner (#122).
 *  3. Turnstile keys, IF anything on this host asks for a captcha. A link that requires one on a
 *     keyless host refused every final submit — after the respondent had typed everything — with
 *     copy that said THEY had failed verification (#122).
 *
 * The problem in every case is *when* it surfaces: long after install, on someone else's screen,
 * with a message that reads like a transient glitch rather than a missing setting. So the checks
 * run at startup, where the operator can still act on them. Each is a pure function over plain
 * config so it is testable without booting a server, and so the message lives next to the reason
 * rather than inside a middleware. {@link assessRespondentReadiness} runs them all and returns
 * every failing reason at once — one per defect, so the operator is not sent through a
 * fix-restart-read loop as long as the number of things wrong.
 */

/** The shape these checks need from the host's core `magicLink` config. */
export interface HostMagicLinkConfig {
  enabled?: boolean;
  restrictedRoleName?: string;
  grantableRoleNames?: string[];
  /** Name of the user whose context provisions magic-link users (core matches it on `User.Name`). */
  contextUserForProvisioning?: string;
}

/** The one field of the host's core `userHandling` config that magic-link provisioning falls back to. */
export interface HostUserHandlingConfig {
  contextUserForNewUserCreation?: string;
}

/**
 * Whether each half of Turnstile is configured on this host. They are two env vars read by two
 * files — `FORMS_TURNSTILE_SECRET` by the submit pipeline (siteverify), `FORMS_TURNSTILE_SITE_KEY`
 * by the host page (handed to the widget so it can render the challenge) — so setting one and not
 * the other is the realistic slip, and each half missing fails somewhere different.
 */
export interface TurnstileHostConfig {
  secretConfigured: boolean;
  siteKeyConfigured: boolean;
}

/**
 * What on this host actually asks for a captcha, as read from the database at boot. `undefined`
 * where the check is called means the read failed (and was logged): a verdict is not invented from
 * evidence that is not there.
 */
export interface CaptchaDemand {
  /** At least one Active, IsActive distribution has `CaptchaRequired = 1`. */
  activeDistributions: boolean;
  /** At least one Published version's snapshot says `settings.captchaRequired: true`. */
  publishedForms: boolean;
}

/** Everything {@link assessRespondentReadiness} needs, gathered by the middleware at boot. */
export interface RespondentReadinessInputs {
  magicLink: HostMagicLinkConfig | undefined;
  /**
   * Yields the role THIS app's minter grants — a thunk, because resolving the minter's config can
   * throw and {@link checkRespondentReadiness} turns that into a readiness reason rather than an
   * error the boot-time caller propagates. See {@link checkRespondentReadiness}.
   */
  resolveRoleName: () => string;
  userHandling: HostUserHandlingConfig | undefined;
  /** Core's own lookup (`UserCache.UserByName`), injected so this stays a pure function. */
  userExists: (name: string) => boolean;
  /** `User.Name` of this host's system user, offered to the operator as the value to configure. */
  systemUserName: string | undefined;
  turnstile: TurnstileHostConfig;
  captchaDemand: CaptchaDemand | undefined;
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
 * Three ways it can be unready — magicLink off, this app configured to grant a blank role, or
 * the role not grantable by this host — each with a different fix, so each gets its own message
 * rather than one vague "check your config".
 *
 * @param magicLink the host's core `magicLink` config
 * @param resolveRoleName  yields the role THIS app's minter grants — a thunk, because
 *                         resolving the minter's config can throw, and that throw is a readiness
 *                         failure this check reports rather than an error the caller propagates
 *                  (`FORMS_MAGICLINK_ROLE`) so the check cannot drift from what is actually
 *                  minted. Defaults to {@link RESPONDENT_ROLE}.
 *
 * Deliberately does NOT REQUIRE `magicLink.restrictedRoleName` to equal our role — it is still
 * consulted, as one more allowed name, exactly as core does. That deployment-global is only
 * core's default for invites that name no role (`isRoleGrantable` treats it as one more allowed
 * name, and `isProtectedAccount` already includes the invited role in its allowed set). Forms'
 * minter always names its role, so the global is irrelevant to us — and requiring it to equal
 * ours made every stock host unready, since core defaults it to 'Magic Link Baseline'. Worse, it
 * is one value per deployment, so demanding it meant no second Open App could ever be ready on
 * the same MJAPI instance. The real requirement is grantability, checked below.
 */
export function checkRespondentReadiness(
  magicLink: HostMagicLinkConfig | undefined,
  resolveRoleName: () => string = () => RESPONDENT_ROLE,
): RespondentReadiness {
  // Resolved HERE, under this check's own guard, rather than by the caller: the provisioning
  // config refuses a malformed channel list by throwing, and the boot-time caller is the one
  // place that must not propagate a throw — it would take down all of MJAPI, which also serves
  // Caliber and ATS, over a Forms env-var typo. "Is the respondent path ready?" includes "can
  // its config be read at all?", so this is where that answer belongs.
  let roleName: string;
  try {
    roleName = resolveRoleName();
  } catch (e) {
    return { ready: false, reason: e instanceof Error ? e.message : String(e) };
  }
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
  if (!target) {
    return {
      ready: false,
      reason:
        `this app is configured to grant a blank magic-link role, so no anonymous session can ` +
        `carry any permission. Set FORMS_MAGICLINK_ROLE to the role name Forms should grant ` +
        `(default '${RESPONDENT_ROLE}').`,
    };
  }
  if (!allowed.has(target)) {
    return {
      ready: false,
      reason:
        `core 'magicLink' is enabled but '${roleName}' is neither ` +
        `magicLink.restrictedRoleName nor listed in magicLink.grantableRoleNames, so invites ` +
        `cannot grant it. Add it to grantableRoleNames, or anonymous respondents will have no ` +
        `permission to create responses.`,
    };
  }
  return { ready: true };
}

/**
 * Whether this host can verify the captchas its forms and links ask for.
 *
 * Two ways to be unready, each with a different fix: the two halves of Turnstile disagree (one env
 * var set, the other not), or nothing is configured while something on the host requires a captcha.
 * A keyless host with no demand is fine — captcha is opt-in — and a host with both halves set is
 * fine whatever the demand.
 *
 * `demand` is what the boot-time probe read. When it is `undefined` the read failed and has been
 * logged; this check then says nothing about demand rather than guessing. A miss here only ever
 * costs a boot warning: the submit pipeline is the enforcement, and it fails closed on its own.
 */
export function checkTurnstileReadiness(
  turnstile: TurnstileHostConfig,
  demand: CaptchaDemand | undefined,
): RespondentReadiness {
  if (turnstile.secretConfigured && !turnstile.siteKeyConfigured) {
    return {
      ready: false,
      reason:
        `FORMS_TURNSTILE_SECRET is set but FORMS_TURNSTILE_SITE_KEY is not, so the widget can never ` +
        `render the challenge that the server would verify: every captcha-required form shows the ` +
        `respondent a configuration message instead of a submit. Set FORMS_TURNSTILE_SITE_KEY to the ` +
        `public site key that pairs with the secret.`,
    };
  }
  if (turnstile.siteKeyConfigured && !turnstile.secretConfigured) {
    return {
      ready: false,
      reason:
        `FORMS_TURNSTILE_SITE_KEY is set but FORMS_TURNSTILE_SECRET is not, so the widget renders a ` +
        `challenge the server cannot verify: every captcha-required submit is refused as a server ` +
        `misconfiguration after the respondent has solved it. Set FORMS_TURNSTILE_SECRET to the ` +
        `secret key that pairs with the site key.`,
    };
  }
  if (!turnstile.secretConfigured && demand && (demand.activeDistributions || demand.publishedForms)) {
    const who = [
      demand.activeDistributions ? 'an active link' : undefined,
      demand.publishedForms ? 'a published form' : undefined,
    ].filter((w): w is string => w !== undefined);
    return {
      ready: false,
      reason:
        `Turnstile is not configured, but ${who.join(' and ')} on this host ` +
        `${who.length > 1 ? 'require' : 'requires'} a captcha: every final submit there is refused as a ` +
        `server misconfiguration. Set FORMS_TURNSTILE_SECRET and FORMS_TURNSTILE_SITE_KEY, or turn the ` +
        `captcha off on that form or link.`,
    };
  }
  return { ready: true };
}

/**
 * Whether magic-link provisioning will run under a user the operator chose.
 *
 * Deliberately mirrors core's `MagicLinkService.resolveProvisioningContextUser`: the candidate is
 * `magicLink.contextUserForProvisioning || userHandling.contextUserForNewUserCreation`, and it is
 * resolved with `UserCache.UserByName` — by `User.Name`, NOT by email, whatever core's config
 * comment says. When that lookup misses, core logs an error and falls back to whichever user
 * happens to be an Owner, on every redeem. Core does not export the resolution, so the candidate
 * rule is duplicated here (two lines) and the lookup itself is injected as `userExists`, so the
 * verdict cannot disagree with the call core will actually make.
 *
 * The placeholder core ships as its default (`not.set@nowhere.com`) is not special-cased: it is
 * simply a name that resolves to nobody, and "does not resolve" covers it without this file having
 * to know core's current default string.
 */
export function checkProvisioningUserReadiness(
  magicLink: Pick<HostMagicLinkConfig, 'contextUserForProvisioning'> | undefined,
  userHandling: HostUserHandlingConfig | undefined,
  userExists: (name: string) => boolean,
  systemUserName?: string,
): RespondentReadiness {
  // `typeof` rather than a truthiness check for the same reason as the role check above: host
  // config parsed from JSON hands us `null` for a blanked value, which the type does not admit.
  const configured = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim().length > 0 ? value : undefined;
  const candidate =
    configured(magicLink?.contextUserForProvisioning) ??
    configured(userHandling?.contextUserForNewUserCreation);
  const suggestion = systemUserName
    ? ` This host's system user is '${systemUserName}'.`
    : '';
  if (candidate === undefined) {
    return {
      ready: false,
      reason:
        `no magic-link provisioning user is configured, so core provisions every anonymous ` +
        `respondent under whichever user happens to be an Owner, and logs an error on every link ` +
        `open. Set magicLink.contextUserForProvisioning to the Name of a dedicated service ` +
        `user.${suggestion}`,
    };
  }
  if (!userExists(candidate)) {
    return {
      ready: false,
      reason:
        `magic-link provisioning user '${candidate}' matches no user — core matches it against ` +
        `User.Name, not Email — so core logs an error and falls back to an arbitrary Owner on ` +
        `every link open. Set magicLink.contextUserForProvisioning to an existing user's ` +
        `Name.${suggestion}`,
    };
  }
  return { ready: true };
}

/**
 * Every reason this host is not ready to serve anonymous respondents — empty when it is.
 *
 * Runs each check once and keeps every failure, so one boot log lists everything an operator has
 * to fix. The checks stay independent and individually testable; this is only their union.
 */
export function assessRespondentReadiness(inputs: RespondentReadinessInputs): string[] {
  const verdicts: RespondentReadiness[] = [
    checkRespondentReadiness(inputs.magicLink, inputs.resolveRoleName),
    checkProvisioningUserReadiness(
      inputs.magicLink,
      inputs.userHandling,
      inputs.userExists,
      inputs.systemUserName,
    ),
    checkTurnstileReadiness(inputs.turnstile, inputs.captchaDemand),
  ];
  return verdicts.flatMap((v) => (v.ready === false ? [v.reason] : []));
}
