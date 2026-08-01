import { describe, expect, it } from 'vitest';
import { checkRespondentReadiness, RESPONDENT_ROLE } from '../../respondent-host/host-readiness';

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
    const result = checkRespondentReadiness({ enabled: true, grantableRoleNames: [RESPONDENT_ROLE] }, custom);
    expect(result.ready).toBe(false);
    expect(result.ready === false && result.reason).toContain(custom);

    expect(checkRespondentReadiness({ enabled: true, grantableRoleNames: [custom] }, custom))
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
});
