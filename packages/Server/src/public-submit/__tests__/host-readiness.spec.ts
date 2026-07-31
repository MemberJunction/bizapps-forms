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
    const result = checkRespondentReadiness({ ...ready, grantableRoleNames: ['Some Other Role'] });
    expect(result.ready).toBe(false);
    expect(result.ready === false && result.reason).toContain(RESPONDENT_ROLE);
  });

  it('fails when the session would be restricted to a different role', () => {
    const result = checkRespondentReadiness({ ...ready, restrictedRoleName: 'Viewer' });
    expect(result.ready).toBe(false);
    // Naming what it actually found is what makes the message actionable.
    expect(result.ready === false && result.reason).toContain('Viewer');
  });
});
