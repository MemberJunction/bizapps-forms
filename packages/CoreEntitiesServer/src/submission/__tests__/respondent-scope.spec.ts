import { describe, expect, it } from 'vitest';
import { checkRespondentScope } from '../respondent-scope.js';
import { makeContextUser, makeFakeProvider, respondentPermissions } from '../../testing/index.js';

describe('checkRespondentScope', () => {
  it('allows a properly-scoped respondent (CanCreate on responses only)', () => {
    const { provider } = makeFakeProvider({ createPermissions: respondentPermissions() });
    expect(checkRespondentScope(provider, makeContextUser()).allowed).toBe(true);
  });

  it('denies when CanCreate is missing on Form Responses', () => {
    const perms = respondentPermissions();
    perms['MJ_BizApps_Forms: Form Responses'] = false;
    const { provider } = makeFakeProvider({ createPermissions: perms });
    expect(checkRespondentScope(provider, makeContextUser()).allowed).toBe(false);
  });

  it('denies privilege accretion (create on a definition entity)', () => {
    const perms = respondentPermissions();
    perms['MJ_BizApps_Forms: Form Versions'] = true;
    const { provider } = makeFakeProvider({ createPermissions: perms });
    const result = checkRespondentScope(provider, makeContextUser());
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/privilege accretion/i);
  });

  it('denies create access on ANY entity outside the respondent allow-list, not just form definitions', () => {
    // The old deny-list named only Forms / Form Versions / Form Distributions, so a grant on any
    // other entity — core tables included — sailed through. The allow-list refuses all of them.
    const perms = respondentPermissions();
    perms['MJ: Users'] = true;
    const { provider } = makeFakeProvider({ createPermissions: perms });
    const result = checkRespondentScope(provider, makeContextUser());
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('MJ: Users');
  });
});
