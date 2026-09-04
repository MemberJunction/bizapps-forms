import { describe, expect, it } from 'vitest';

import {
  runForget,
  runRemember,
  runResume,
  type DeviceResumeDeps,
  type ResumeDistribution,
  type ResumeResponseRow,
} from '../device-resume.service';
import { matchResumeRoute } from '../resume-routes';

const SLUG = 'share-link-3gc41';
const DIST_ID = 'd1111111-0000-4000-8000-000000000001';
const ROW_ID = '9da322e6-0000-4000-8000-000000000001';
const OTHER_ROW_ID = '33910b9e-0000-4000-8000-000000000002';
const TOKEN = 'mj_ml_cookie';
const EMAILED_TOKEN = 'mj_ml_emailed';
const OWNER_SESSION = 'sess-first';

interface Recorder {
  redeems: string[];
  mints: string[];
  revokes: { responseId: string; deviceOnly: boolean }[];
}

interface DepsConfig {
  distribution?: Partial<ResumeDistribution> | null;
  response?: Partial<ResumeResponseRow> | null;
  /** The response a second, differently-scoped lookup returns (the cookie-conflict case). */
  otherResponse?: Partial<ResumeResponseRow> | null;
  redeem?: { ok?: boolean; errorCode?: string };
  mintFails?: boolean;
  inviteResourceId?: string;
  scopeOf?: string;
  allow?: boolean;
}

function makeDeps(config: DepsConfig = {}): { deps: DeviceResumeDeps; rec: Recorder } {
  const rec: Recorder = { redeems: [], mints: [], revokes: [] };
  const distribution: ResumeDistribution | undefined =
    config.distribution === null
      ? undefined
      : { id: DIST_ID, allowDeviceResume: true, closeAt: null, ...config.distribution };
  const response: ResumeResponseRow | undefined =
    config.response === null
      ? undefined
      : {
          id: ROW_ID,
          status: 'Partial',
          anonymousSessionId: OWNER_SESSION,
          formDistributionId: DIST_ID,
          ...config.response,
        };
  const other: ResumeResponseRow | undefined =
    config.otherResponse === undefined
      ? undefined
      : config.otherResponse === null
        ? undefined
        : {
            id: OTHER_ROW_ID,
            status: 'Partial',
            anonymousSessionId: OWNER_SESSION,
            formDistributionId: DIST_ID,
            ...config.otherResponse,
          };

  const deps: DeviceResumeDeps = {
    loadDistribution: async () => distribution,
    loadResponse: async (id) => (id === ROW_ID ? response : other),
    redeem: async (token) => {
      rec.redeems.push(token);
      const r = config.redeem ?? {};
      return r.ok === false || r.errorCode
        ? { ok: false, errorCode: r.errorCode }
        : { ok: true, token: 'JWT-2' };
    },
    mint: async ({ responseId }) => {
      rec.mints.push(responseId);
      return config.mintFails
        ? { ok: false }
        : { ok: true, rawToken: 'mj_ml_rotated', expiresAt: new Date(Date.now() + 86_400_000) };
    },
    revoke: async (args) => {
      rec.revokes.push(args);
    },
    inviteFor: async () => ({ ok: true, resourceId: config.inviteResourceId }),
    scopeOf: () => config.scopeOf ?? ROW_ID,
    allowRequest: () => config.allow !== false,
    cookieFor: (token, maxAge) => `mjf_resume=${token}; Max-Age=${maxAge}`,
    clearCookie: () => 'mjf_resume=; Max-Age=0',
    callerKey: 'ip-hash',
  };
  return { deps, rec };
}

describe('matchResumeRoute', () => {
  it.each([
    ['POST', `/f/${SLUG}/resume`, 'resume'],
    ['POST', `/f/${SLUG}/remember`, 'remember'],
    ['POST', `/f/${SLUG}/forget`, 'forget'],
  ])('matches %s %s', (method, path, action) => {
    expect(matchResumeRoute(method, path)).toEqual({ action, slug: SLUG });
  });

  it.each([
    ['GET', `/f/${SLUG}/resume`],
    ['POST', `/f/${SLUG}`],
    ['POST', '/f//resume'],
    ['POST', '/f/a/b/resume'],
    ['POST', `/f/${SLUG}/something-else`],
  ])('does not match %s %s', (method, path) => {
    expect(matchResumeRoute(method, path)).toBeUndefined();
  });
});

describe('runResume', () => {
  it('refuses a closed distribution BEFORE redeeming, so no use is burned', async () => {
    const { deps, rec } = makeDeps({ distribution: { doorRefusal: 'distribution-closed' } });

    const out = await runResume(deps, { slug: SLUG, cookieToken: TOKEN });

    expect(out.status).toBe(410);
    expect(out.reason).toBe('door-closed');
    expect(rec.redeems).toHaveLength(0);
  });

  it('rotates the pointer on success and returns the response-scoped session', async () => {
    const { deps, rec } = makeDeps();

    const out = await runResume(deps, { slug: SLUG, cookieToken: TOKEN });

    expect(out.status).toBe(200);
    expect(out.body).toEqual({ token: 'JWT-2' });
    expect(out.setCookie).toContain('mjf_resume=mj_ml_rotated');
    expect(rec.mints).toEqual([ROW_ID]);
  });

  it('does NOT clear the cookie when core says the token was already consumed', async () => {
    // Two tabs, or a restored session. The other tab won the compare-and-swap and has ALREADY
    // rotated this jar's cookie — there is one jar per profile. Clearing here discards the
    // winner's fresh pointer, and the loser then starts a SECOND draft that the next reopen
    // resumes, orphaning the real one.
    const { deps } = makeDeps({ redeem: { errorCode: 'consumed' } });

    const out = await runResume(deps, { slug: SLUG, cookieToken: TOKEN });

    expect(out.status).toBe(410);
    expect(out.reason).toBe('open-elsewhere');
    expect(out.setCookie).toBeUndefined();
  });

  it.each(['expired', 'revoked', 'not-found', undefined])(
    'clears the cookie when the pointer is genuinely dead (%s)',
    async (errorCode) => {
      const { deps } = makeDeps({ redeem: { ok: false, errorCode } });

      const out = await runResume(deps, { slug: SLUG, cookieToken: TOKEN });

      expect(out.reason).toBe('dead-pointer');
      expect(out.setCookie).toContain('Max-Age=0');
    },
  );

  it('clears the cookie without redeeming when the owner turned device resume off', async () => {
    const { deps, rec } = makeDeps({ distribution: { allowDeviceResume: false } });

    const out = await runResume(deps, { slug: SLUG, cookieToken: TOKEN });

    expect(out.reason).toBe('disabled');
    expect(out.setCookie).toContain('Max-Age=0');
    expect(rec.redeems).toHaveLength(0);
  });

  it('still resumes when the rotation mint fails, and clears the spent pointer', async () => {
    const { deps } = makeDeps({ mintFails: true });

    const out = await runResume(deps, { slug: SLUG, cookieToken: TOKEN });

    expect(out.status).toBe(200);
    expect(out.body).toEqual({ token: 'JWT-2' });
    expect(out.setCookie).toContain('Max-Age=0');
  });

  it("accepts the emailed link's token from the body, and gives that device a pointer too", async () => {
    // The rule that unifies the channels: EVERY successful response-scoped redeem on the host ends
    // by minting a device invite, so opening the emailed link on a new device earns same-device
    // resume there with no further step.
    const { deps, rec } = makeDeps();

    const out = await runResume(deps, { slug: SLUG, bodyToken: EMAILED_TOKEN });

    expect(rec.redeems).toEqual([EMAILED_TOKEN]);
    expect(out.setCookie).toContain('mjf_resume=mj_ml_rotated');
  });

  it('prefers the body token over the cookie when both arrive', async () => {
    const { deps, rec } = makeDeps();

    await runResume(deps, { slug: SLUG, cookieToken: TOKEN, bodyToken: EMAILED_TOKEN });

    expect(rec.redeems).toEqual([EMAILED_TOKEN]);
  });

  it('refuses with no pointer at all, and never calls core', async () => {
    const { deps, rec } = makeDeps();

    const out = await runResume(deps, { slug: SLUG });

    expect(out.status).toBe(410);
    expect(out.reason).toBe('no-pointer');
    expect(rec.redeems).toHaveLength(0);
  });

  it('refuses a rate-limited caller before touching the database', async () => {
    const { deps, rec } = makeDeps({ allow: false });

    const out = await runResume(deps, { slug: SLUG, cookieToken: TOKEN });

    expect(out.status).toBe(429);
    expect(rec.redeems).toHaveLength(0);
  });
});

describe('runRemember', () => {
  const args = { slug: SLUG, responseId: ROW_ID, sessionId: OWNER_SESSION, scopeId: DIST_ID };

  it('mints a pointer for a draft the caller owns', async () => {
    const { deps, rec } = makeDeps();

    const out = await runRemember(deps, args);

    expect(out.status).toBe(204);
    expect(out.setCookie).toContain('mjf_resume=mj_ml_rotated');
    expect(rec.mints).toEqual([ROW_ID]);
  });

  it('mints nothing without the owning session id, however valid the JWT and the row', async () => {
    // The review's second must-fix. Without the header there is no ownership proof at all on a
    // first sitting, and minting on a bare response id hands a bearer to anyone who can name one.
    const { deps, rec } = makeDeps();

    const out = await runRemember(deps, { ...args, sessionId: '   ' });

    expect(out.status).toBe(400);
    expect(rec.mints).toHaveLength(0);
  });

  it('mints nothing for a row owned by a different session', async () => {
    const { deps, rec } = makeDeps({ response: { anonymousSessionId: 'somebody-else' } });

    const out = await runRemember(deps, args);

    expect(out.status).toBe(403);
    expect(rec.mints).toHaveLength(0);
  });

  it('mints nothing when the row came through a DIFFERENT link than the JWT names', async () => {
    const { deps, rec } = makeDeps({ response: { formDistributionId: 'another-link' } });

    expect((await runRemember(deps, args)).status).toBe(403);
    expect(rec.mints).toHaveLength(0);
  });

  it('mints nothing when the row does not say which link it came through', async () => {
    // "Cannot tell" is a refusal, never a pass — which is also what makes the CodeGen-blocked
    // column fail closed rather than silently skipping the guard.
    const { deps, rec } = makeDeps({ response: { formDistributionId: undefined } });

    expect((await runRemember(deps, args)).status).toBe(403);
    expect(rec.mints).toHaveLength(0);
  });

  it('mints nothing for a row that is not a live draft', async () => {
    const { deps, rec } = makeDeps({ response: { status: 'Complete' } });

    expect((await runRemember(deps, args)).status).toBe(409);
    expect(rec.mints).toHaveLength(0);
  });

  it('refuses to replace a cookie that names a DIFFERENT live draft', async () => {
    // The other half of the two-tab fix: the loser tab's first autosave arrives holding the
    // winner's rotated pointer, and overwriting it abandons the real draft.
    const { deps, rec } = makeDeps({ inviteResourceId: OTHER_ROW_ID, otherResponse: {} });

    const out = await runRemember(deps, { ...args, cookieToken: TOKEN });

    expect(out.status).toBe(409);
    expect(out.setCookie).toBeUndefined();
    expect(rec.mints).toHaveLength(0);
  });

  it('replaces a cookie that names a draft which is no longer live', async () => {
    const { deps, rec } = makeDeps({ inviteResourceId: OTHER_ROW_ID, otherResponse: { status: 'Complete' } });

    const out = await runRemember(deps, { ...args, cookieToken: TOKEN });

    expect(out.status).toBe(204);
    expect(rec.mints).toEqual([ROW_ID]);
  });

  it('re-mints happily when the cookie already names THIS draft', async () => {
    const { deps, rec } = makeDeps({ inviteResourceId: ROW_ID });

    const out = await runRemember(deps, { ...args, cookieToken: TOKEN });

    expect(out.status).toBe(204);
    expect(rec.mints).toEqual([ROW_ID]);
  });

  it('mints nothing and sets no cookie when the switch is off, and says nothing went wrong', async () => {
    const { deps, rec } = makeDeps({ distribution: { allowDeviceResume: false } });

    const out = await runRemember(deps, args);

    expect(out.status).toBe(204);
    expect(out.setCookie).toBeUndefined();
    expect(rec.mints).toHaveLength(0);
  });

  it('leaves the respondent unaffected when the mint itself fails', async () => {
    const { deps } = makeDeps({ mintFails: true });

    const out = await runRemember(deps, args);

    expect(out.status).toBe(204);
    expect(out.setCookie).toBeUndefined();
  });
});

describe('runForget', () => {
  it('revokes only the device invites, and clears the cookie', async () => {
    const { deps, rec } = makeDeps({ inviteResourceId: ROW_ID });

    const out = await runForget(deps, { slug: SLUG, cookieToken: TOKEN });

    expect(rec.revokes).toEqual([{ responseId: ROW_ID, deviceOnly: true }]);
    expect(out.setCookie).toContain('Max-Age=0');
  });

  it('clears the cookie even when there is no pointer to revoke', async () => {
    const { deps, rec } = makeDeps();

    const out = await runForget(deps, { slug: SLUG });

    expect(out.status).toBe(204);
    expect(out.setCookie).toContain('Max-Age=0');
    expect(rec.revokes).toHaveLength(0);
  });
});
