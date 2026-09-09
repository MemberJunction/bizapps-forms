import { describe, expect, it } from 'vitest';
import {
  assessRespondentReadiness,
  checkProvisioningUserReadiness,
  checkRespondentReadiness,
  checkTurnstileReadiness,
  RESPONDENT_ROLE,
} from '../../respondent-host/host-readiness';
import type {
  CaptchaDemand,
  HostMagicLinkConfig,
  RespondentReadinessInputs,
} from '../../respondent-host/host-readiness';

/**
 * These describe what an OPERATOR needs to be told, not how the check is written.
 * The failure they guard against is a host installing Forms, seeing a clean boot, and
 * only discovering weeks later that every public link answered 409.
 */
describe('checkRespondentReadiness', () => {
  const ready = {
    enabled: true,
    restrictedRoleName: RESPONDENT_ROLE,
    grantableRoleNames: [RESPONDENT_ROLE],
  };

  it('passes a host configured the way this app requires', () => {
    expect(checkRespondentReadiness(ready)).toEqual({ ready: true });
  });

  it('fails when the host has no magicLink config at all', () => {
    const result = checkRespondentReadiness(undefined);
    expect(result.ready).toBe(false);
    // The operator has to know which setting, not merely that something is wrong.
    expect(result.ready === false && result.reason).toMatch(/magicLink.*not enabled/i);
  });

  it('fails when magicLink exists but is switched off', () => {
    const result = checkRespondentReadiness({ ...ready, enabled: false });
    expect(result.ready).toBe(false);
  });

  // Enabled-but-misconfigured is the nastier case: the minter runs and the link is
  // created, so nothing looks broken until a respondent is denied at submit time.
  it('fails when the respondent role is not grantable, naming the role', () => {
    // Both routes to grantability must be closed for this to be genuinely unready: core treats
    // the restricted role as always grantable, so leaving it set to ours would make this host
    // fine. That is why restrictedRoleName is another app's here, not ours.
    const result = checkRespondentReadiness({
      enabled: true,
      restrictedRoleName: 'Magic Link Baseline',
      grantableRoleNames: ['Some Other Role'],
    });
    expect(result.ready).toBe(false);
    expect(result.ready === false && result.reason).toContain(RESPONDENT_ROLE);
  });

  it('is ready when the host happens to have set restrictedRoleName to our role and listed nothing', () => {
    // Core always allows the restricted role, so this host can grant it even with an empty list.
    expect(checkRespondentReadiness({ enabled: true, restrictedRoleName: RESPONDENT_ROLE, grantableRoleNames: [] }))
      .toEqual({ ready: true });
  });

  // `restrictedRoleName` is core's default for invites that do NOT name a role. Forms' minter
  // always names one, and core's `isRoleGrantable` allows any role listed in grantableRoleNames,
  // so this deployment-global has no bearing on whether Forms works. Requiring it to equal our
  // role made every stock host unready (core's own default is 'Magic Link Baseline') and meant
  // two Open Apps could never both be ready on one MJAPI instance.
  it('is ready on a host whose restrictedRoleName belongs to another app, so apps can coexist', () => {
    expect(checkRespondentReadiness({ ...ready, restrictedRoleName: 'Some Other App Respondent' }))
      .toEqual({ ready: true });
  });

  it('is ready on a stock host, which defaults restrictedRoleName to "Magic Link Baseline"', () => {
    expect(checkRespondentReadiness({ ...ready, restrictedRoleName: 'Magic Link Baseline' }))
      .toEqual({ ready: true });
  });

  // The role Forms grants is per-app config (FORMS_MAGICLINK_ROLE, read by the minter). If
  // readiness checked a hardcoded name instead, a host that renamed the role would pass the
  // check and still mint invites for a role that is not grantable — the same silent drift the
  // client/server validation split caused.
  it('checks the role this app actually grants, not a hardcoded one', () => {
    const custom = 'Survey Respondent';
    const result = checkRespondentReadiness({ enabled: true, grantableRoleNames: [RESPONDENT_ROLE] }, () => custom);
    expect(result.ready).toBe(false);
    expect(result.ready === false && result.reason).toContain(custom);

    expect(checkRespondentReadiness({ enabled: true, grantableRoleNames: [custom] }, () => custom))
      .toEqual({ ready: true });
  });
  // Core compares role names case- and whitespace-insensitively: magicLinkCore's
  // `isRoleGrantable` runs every name through `normalizeName = (n) => n.trim().toLowerCase()`
  // before the set lookup. This check duplicates that function (core does not export it), and
  // duplicating it without the normalization made the copy disagree with the thing it claims to
  // mirror — a host that spelled the role 'form respondent' could mint invites perfectly well
  // and still be told at boot that it could not.
  it('matches role names the way core does: case- and whitespace-insensitively', () => {
    expect(checkRespondentReadiness({ enabled: true, grantableRoleNames: ['form respondent'] }))
      .toEqual({ ready: true });
    expect(checkRespondentReadiness({ enabled: true, grantableRoleNames: ['  FORM RESPONDENT  '] }))
      .toEqual({ ready: true });
    expect(checkRespondentReadiness({ enabled: true, restrictedRoleName: 'form respondent', grantableRoleNames: [] }))
      .toEqual({ ready: true });
  });
  // `magicLink` is host config read from JSON, so a null is reachable in a way the TypeScript
  // shape does not admit — an operator who blanks a value writes `null`, not `undefined`. This
  // runs inside boot middleware, so throwing here is strictly worse than any wrong verdict.
  it('ignores null entries in host config instead of throwing on them', () => {
    const fromJson: HostMagicLinkConfig = JSON.parse(
      '{"enabled":true,"restrictedRoleName":null,"grantableRoleNames":["Form Respondent",null]}',
    );
    expect(() => checkRespondentReadiness(fromJson)).not.toThrow();
    expect(checkRespondentReadiness(fromJson)).toEqual({ ready: true });
  });

  // Core's `isRoleGrantable` bails on an empty target (`if (!target) return false`) before it
  // consults the allow-list. Without the same guard, a config carrying a blank string would make
  // a blank role name "grantable" — agreeing with core means agreeing about this too.
  it('never treats a blank role name as grantable, as core does not', () => {
    const result = checkRespondentReadiness({ enabled: true, grantableRoleNames: [''] }, () => '   ');
    expect(result.ready).toBe(false);
  });

  it('reports a provisioning config that cannot be resolved as NOT ready, instead of throwing', () => {
    // The boot-time caller is not inside a try. A throw there takes down all of MJAPI — which
    // also serves Caliber and ATS — over a Forms env-var typo. The readiness line is exactly
    // where broken host config is meant to surface, so the check owns this case.
    const readiness = checkRespondentReadiness({ enabled: true, grantableRoleNames: [RESPONDENT_ROLE] }, () => {
      throw new Error("FORMS_MAGICLINK_CHANNELS contains 'embed', which is not a distribution channel.");
    });
    expect(readiness).toEqual({ ready: false, reason: expect.stringContaining("'embed'") });
  });
});

/**
 * Issue #122. Two more things a host can get wrong that stayed silent until a respondent paid for
 * them: Turnstile keys (a link demanding a captcha on a keyless host refused every final submit as
 * "Captcha verification failed"), and the magic-link provisioning user (core's default is a literal
 * placeholder, so every link open logged an error and provisioned under an arbitrary Owner).
 */
describe('checkTurnstileReadiness', () => {
  const noDemand: CaptchaDemand = { activeDistributions: false, publishedForms: false };

  it('is ready on a host with no Turnstile keys when nothing asks for a captcha', () => {
    expect(checkTurnstileReadiness({ secretConfigured: false, siteKeyConfigured: false }, noDemand))
      .toEqual({ ready: true });
  });

  it('is ready when both halves are configured, whatever the demand', () => {
    expect(checkTurnstileReadiness(
      { secretConfigured: true, siteKeyConfigured: true },
      { activeDistributions: true, publishedForms: true },
    )).toEqual({ ready: true });
  });

  // The two halves live in two different env vars read by two different files (the server
  // verifies with the secret, the host page hands the widget the site key). Setting one and not
  // the other is the realistic install slip, and each half missing fails in a different place.
  it('fails when the secret is set without the site key, naming the missing variable', () => {
    const result = checkTurnstileReadiness({ secretConfigured: true, siteKeyConfigured: false }, noDemand);
    expect(result.ready).toBe(false);
    expect(result.ready === false && result.reason).toContain('FORMS_TURNSTILE_SITE_KEY');
  });

  it('fails when the site key is set without the secret, naming the missing variable', () => {
    const result = checkTurnstileReadiness({ secretConfigured: false, siteKeyConfigured: true }, noDemand);
    expect(result.ready).toBe(false);
    expect(result.ready === false && result.reason).toContain('FORMS_TURNSTILE_SECRET');
  });

  it('fails when an active link requires a captcha and no secret is configured', () => {
    const result = checkTurnstileReadiness(
      { secretConfigured: false, siteKeyConfigured: false },
      { activeDistributions: true, publishedForms: false },
    );
    expect(result.ready).toBe(false);
    expect(result.ready === false && result.reason).toContain('FORMS_TURNSTILE_SECRET');
  });

  it('fails when a published form requires a captcha and no secret is configured', () => {
    const result = checkTurnstileReadiness(
      { secretConfigured: false, siteKeyConfigured: false },
      { activeDistributions: false, publishedForms: true },
    );
    expect(result.ready).toBe(false);
  });

  // The demand is read from the database at boot. When that read fails the probe logs it; this
  // check must not invent a verdict from evidence it does not have.
  it('does not fail on demand it could not read', () => {
    expect(checkTurnstileReadiness({ secretConfigured: false, siteKeyConfigured: false }, undefined))
      .toEqual({ ready: true });
  });
});

describe('checkProvisioningUserReadiness', () => {
  const exists = (name: string): boolean => name === 'System';

  it('is ready when magicLink.contextUserForProvisioning names an existing user', () => {
    expect(checkProvisioningUserReadiness({ contextUserForProvisioning: 'System' }, undefined, exists))
      .toEqual({ ready: true });
  });

  // Core resolves `magicLink.contextUserForProvisioning || userHandling.contextUserForNewUserCreation`.
  // The fallback is part of the contract, so a host that only set the userHandling one is ready.
  it('falls back to userHandling.contextUserForNewUserCreation, as core does', () => {
    expect(checkProvisioningUserReadiness(
      { contextUserForProvisioning: '' },
      { contextUserForNewUserCreation: 'System' },
      exists,
    )).toEqual({ ready: true });
  });

  it('fails when neither setting is present', () => {
    const result = checkProvisioningUserReadiness(undefined, undefined, exists);
    expect(result.ready).toBe(false);
    expect(result.ready === false && result.reason).toContain('contextUserForProvisioning');
  });

  // Core's config comment says "email"; its code calls `UserCache.UserByName`. An operator who
  // followed the comment gets a value that never resolves, so the message has to say which one.
  it('fails when the configured name matches no user, naming it and what it is matched against', () => {
    const result = checkProvisioningUserReadiness(
      { contextUserForProvisioning: 'not.set@nowhere.com' },
      undefined,
      exists,
    );
    expect(result.ready).toBe(false);
    expect(result.ready === false && result.reason).toContain("'not.set@nowhere.com'");
    expect(result.ready === false && result.reason).toMatch(/User\.Name/);
  });

  it('tells the operator which user to configure when the host has a system user', () => {
    const result = checkProvisioningUserReadiness(undefined, undefined, exists, 'System');
    expect(result.ready === false && result.reason).toContain("'System'");
  });

  // Core selects the candidate with plain `||` (MagicLinkService.resolveProvisioningContextUser),
  // so a whitespace-only value is TRUTHY there: core takes it, misses in UserByName, logs
  // "not found; falling back to an Owner" and provisions under an arbitrary Owner on every redeem.
  // Trimming it away here would fall through to the other setting and call the host ready, which is
  // the one thing this check must never do — the whole file's claim is that it cannot disagree with
  // the call core will actually make. `null` is still unset, because `||` rejects that too.
  it('agrees with core on a whitespace-only provisioning user, which core takes and fails to resolve', () => {
    const result = checkProvisioningUserReadiness(
      { contextUserForProvisioning: '   ' },
      { contextUserForNewUserCreation: 'System' },
      exists,
    );

    expect(result.ready).toBe(false);
    expect(result.ready === false && result.reason).toContain('matches no user');
  });

  // Host config is parsed from JSON, where blanking a value writes `null`, not `undefined`.
  it('treats null settings as unset instead of throwing on them', () => {
    const fromJson = JSON.parse('{"contextUserForProvisioning":null}') as HostMagicLinkConfig;
    expect(() => checkProvisioningUserReadiness(fromJson, undefined, exists)).not.toThrow();
    expect(checkProvisioningUserReadiness(fromJson, undefined, exists).ready).toBe(false);
  });
});

describe('assessRespondentReadiness', () => {
  const readyHost: RespondentReadinessInputs = {
    magicLink: { enabled: true, grantableRoleNames: [RESPONDENT_ROLE], contextUserForProvisioning: 'System' },
    resolveRoleName: () => RESPONDENT_ROLE,
    userHandling: undefined,
    userExists: (name) => name === 'System',
    systemUserName: 'System',
    turnstile: { secretConfigured: false, siteKeyConfigured: false },
    captchaDemand: { activeDistributions: false, publishedForms: false },
  };

  it('reports nothing for a host configured the way this app requires', () => {
    expect(assessRespondentReadiness(readyHost)).toEqual([]);
  });

  // The boundary boot actually crosses. `checkRespondentReadiness` owns the try, and has its own
  // test for it — but the middleware never calls that function directly, it calls THIS one, so
  // resolving the role name eagerly here would put the throw back on the boot path with the suite
  // still green. That is not hypothetical: it is what the merge of #131 into this branch produced,
  // and the type error that exposed it was a lucky accident of the aggregator being new. A throw
  // out of here takes down all of MJAPI, which also serves Caliber and ATS, over a Forms env-var typo.
  it('reports a provisioning config that cannot be resolved, instead of throwing out of boot', () => {
    const boom = () => {
      throw new Error("FORMS_MAGICLINK_CHANNELS contains 'embed', which is not a distribution channel.");
    };

    const reasons = assessRespondentReadiness({ ...readyHost, resolveRoleName: boom });

    expect(reasons).toContainEqual(expect.stringContaining("'embed'"));
  });

  // An unreadable role config must not HIDE the other verdicts. Resolving it outside the guard
  // aborts the whole assessment, so the operator would fix one env-var typo, restart, and only then
  // learn about the other two problems — the fix-restart-read loop this aggregator exists to end.
  it('still reports the other reasons when the role config cannot be resolved', () => {
    const reasons = assessRespondentReadiness({
      ...readyHost,
      resolveRoleName: () => { throw new Error('FORMS_MAGICLINK_CHANNELS is malformed'); },
      magicLink: { enabled: true, grantableRoleNames: [RESPONDENT_ROLE] },  // no provisioning user
      turnstile: { secretConfigured: true, siteKeyConfigured: false },      // half-configured
    });

    expect(reasons).toHaveLength(3);
    expect(reasons.join('\n')).toContain('FORMS_MAGICLINK_CHANNELS is malformed');
    expect(reasons.join('\n')).toContain('contextUserForProvisioning');
    expect(reasons.join('\n')).toContain('FORMS_TURNSTILE_SITE_KEY');
  });

  // One reason per defect, all at once. Reporting only the first would send the operator through
  // a fix-restart-read loop as long as the number of things wrong.
  it('reports every unready condition, not just the first', () => {
    const reasons = assessRespondentReadiness({
      ...readyHost,
      magicLink: { enabled: false },
      turnstile: { secretConfigured: true, siteKeyConfigured: false },
    });
    expect(reasons).toHaveLength(3);
    expect(reasons.join('\n')).toMatch(/magicLink.*not enabled/i);
    expect(reasons.join('\n')).toContain('contextUserForProvisioning');
    expect(reasons.join('\n')).toContain('FORMS_TURNSTILE_SITE_KEY');
  });
});
