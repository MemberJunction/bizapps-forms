/**
 * Where the server-side redeem POST is ADDRESSED, which decides whether the respondent's address
 * survives the trip to core.
 *
 * C-B (gauntlet #207, F2). The redeem is a PROCESS-LOCAL call: core's magic-link router is mounted
 * on the very same Express app (`MJ/packages/MJServer/src/index.ts:1221`). It was nevertheless
 * addressed to `MJAPI_PUBLIC_URL`, the externally-reachable origin — and that variable cannot
 * quietly be repointed inward, because `resolveConfiguredGraphqlUrl()` derives from it too and that value is
 * handed to the RESPONDENT'S BROWSER as `data-graphql-url`.
 *
 * So behind any real proxy the call left the perimeter, resolved to the proxy, and came back in —
 * and the proxy appended MJAPI's own egress to the `X-Forwarded-For` the door had just set.
 * `proxy-addr` at `trust proxy = 1` returns the RIGHT-MOST entry, so core saw the egress address:
 * one constant for the whole deployment, which is precisely the defect this branch exists to close.
 * The fix was inert in exactly the topology it targeted, and measurable only on a loopback harness
 * — which is where it was measured.
 *
 * A loopback default cannot traverse a proxy, so no hop can be appended. The class is designed out
 * rather than guarded against.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  getGraphqlUrlForRequest,
  getRespondentHostConfig,
  graphqlRootPathWarning,
  resetRespondentHostConfigForTests,
} from '../config';

const SAVED = { ...process.env };

beforeEach(() => {
  // Cleared up front, not in a trailing line: a test that throws mid-body never reaches its own
  // cleanup and the next test then runs under someone else's environment.
  for (const k of ['FORMS_MAGICLINK_REDEEM_URL', 'MJAPI_PUBLIC_URL', 'GRAPHQL_PORT', 'FORMS_GRAPHQL_URL', 'GRAPHQL_ROOT_PATH']) {
    delete process.env[k];
  }
  resetRespondentHostConfigForTests();
});

afterEach(() => {
  process.env = { ...SAVED };
  resetRespondentHostConfigForTests();
});

describe('magicLinkRedeemUrl — the redeem never leaves the host', () => {
  it('defaults to loopback on our own port, not the public origin', () => {
    process.env.MJAPI_PUBLIC_URL = 'https://forms.example.com';
    process.env.GRAPHQL_PORT = '4131';
    resetRespondentHostConfigForTests();

    expect(getRespondentHostConfig().magicLinkRedeemUrl).toBe('http://127.0.0.1:4131/magic-link/redeem');
  });

  it('never composes the redeem URL from the public origin, however that origin is spelled', () => {
    // The whole point: a public hostname is what drags the call back through the proxy.
    process.env.MJAPI_PUBLIC_URL = 'https://forms.example.com';
    resetRespondentHostConfigForTests();

    expect(getRespondentHostConfig().magicLinkRedeemUrl).not.toContain('forms.example.com');
  });

  it('uses core’s own default port when GRAPHQL_PORT is unset', () => {
    // MJ/packages/MJServer/src/config.ts:660 — `GRAPHQL_PORT` or 4000.
    expect(getRespondentHostConfig().magicLinkRedeemUrl).toBe('http://127.0.0.1:4000/magic-link/redeem');
  });

  it('addresses loopback NUMERICALLY, so it cannot be re-resolved by DNS to the proxy', () => {
    process.env.GRAPHQL_PORT = '4131';
    resetRespondentHostConfigForTests();

    const url = getRespondentHostConfig().magicLinkRedeemUrl;
    expect(new URL(url).hostname).toBe('127.0.0.1');
  });

  it('still honours an explicit FORMS_MAGICLINK_REDEEM_URL, for a split deployment', () => {
    process.env.FORMS_MAGICLINK_REDEEM_URL = 'http://core.internal:4000/magic-link/redeem';
    process.env.GRAPHQL_PORT = '4131';
    resetRespondentHostConfigForTests();

    expect(getRespondentHostConfig().magicLinkRedeemUrl).toBe('http://core.internal:4000/magic-link/redeem');
  });

  it('leaves the widget’s GraphQL URL on the PUBLIC origin — the browser has to reach it', () => {
    // Guards the fix against over-reach: only the server-to-server leg moves to loopback. Pointing
    // this one inward would break every respondent's page.
    process.env.MJAPI_PUBLIC_URL = 'https://forms.example.com';
    process.env.GRAPHQL_PORT = '4131';
    resetRespondentHostConfigForTests();

    expect(getRespondentHostConfig().graphqlUrl).toBe('https://forms.example.com');
  });
});

/**
 * Where the respondent's BROWSER is told to send GraphQL (#238).
 *
 * The page used to fall back to a hardcoded `http://localhost:4121` when no public URL was set, so a
 * host on any other port — MJ's own host on :4000, a branch harness on :4131 — served a page that
 * submitted to a server that was not there, or worse, to another checkout's. The process serving
 * `/f/:slug` is the one serving GraphQL, so with nothing configured the right answer is the origin
 * the page request arrived on. An explicit setting still wins: behind a proxy that rewrites Host,
 * only the operator knows the public URL.
 */
describe('getGraphqlUrlForRequest — the page addresses the server that served it', () => {
  it('prefers an explicit FORMS_GRAPHQL_URL over the request origin', () => {
    process.env.FORMS_GRAPHQL_URL = 'https://api.example.com/graphql';
    resetRespondentHostConfigForTests();
    expect(getGraphqlUrlForRequest(getRespondentHostConfig(), 'http://localhost:4131')).toBe(
      'https://api.example.com/graphql',
    );
  });

  it('prefers MJAPI_PUBLIC_URL over the request origin', () => {
    process.env.MJAPI_PUBLIC_URL = 'https://forms.example.com/';
    resetRespondentHostConfigForTests();
    expect(getGraphqlUrlForRequest(getRespondentHostConfig(), 'http://localhost:4131')).toBe(
      'https://forms.example.com',
    );
  });

  it('uses the request origin when neither is set — never a hardcoded port', () => {
    expect(getGraphqlUrlForRequest(getRespondentHostConfig(), 'http://localhost:4131')).toBe('http://localhost:4131');
  });

  it('composes GRAPHQL_ROOT_PATH onto the request origin', () => {
    process.env.GRAPHQL_ROOT_PATH = 'graphql';
    resetRespondentHostConfigForTests();
    expect(getGraphqlUrlForRequest(getRespondentHostConfig(), 'http://localhost:4131')).toBe(
      'http://localhost:4131/graphql',
    );
  });

  it('refuses, naming the settings, when there is neither a configured URL nor a request origin', () => {
    expect(() => getGraphqlUrlForRequest(getRespondentHostConfig(), undefined)).toThrow(
      /FORMS_GRAPHQL_URL.*MJAPI_PUBLIC_URL/,
    );
  });
});

describe('graphqlRootPathWarning — Forms routes live at the api-url minus /graphql (#270)', () => {
  // MJServer mounts every Forms route at its app ROOT and moves only GraphQL under
  // GRAPHQL_ROOT_PATH. The widget and builder derive `/forms/*` by stripping a trailing `/graphql`
  // from the API URL, so the only root paths that leave `/forms/*` addressable are the root itself
  // and exactly `/graphql`: anything else sends images and uploads to a path nothing serves.
  it.each([undefined, '', '/', '//', '/graphql', '/GraphQL/', 'graphql'])(
    'is silent for a supported root path (%s)',
    (rootPath) => {
      expect(graphqlRootPathWarning(rootPath)).toBeUndefined();
    },
  );

  it('warns, naming the setting and the consequence, for a root path that moves only GraphQL (/api)', () => {
    const warning = graphqlRootPathWarning('/api');
    expect(warning).toContain('GRAPHQL_ROOT_PATH');
    expect(warning).toContain('/api');
    expect(warning).toMatch(/404/);
  });

  it('warns for a root path that merely CONTAINS graphql without ending in it', () => {
    expect(graphqlRootPathWarning('/graphql/v1')).toBeDefined();
  });

  // Ending in `/graphql` is not enough: stripping it from `https://h/api/graphql` leaves
  // `https://h/api`, and `/api/forms/asset/<id>` is not where MJServer mounts the route — the same
  // 404 as `/api`, but with no warning (gauntlet F1, observed on a harness booted with this value).
  it.each(['/api/graphql', '/v1/graphql', 'api/graphql/'])(
    'warns for a prefixed GraphQL root path (%s), whose Forms routes are not under the prefix',
    (rootPath) => {
      const warning = graphqlRootPathWarning(rootPath);
      expect(warning).toContain('GRAPHQL_ROOT_PATH');
      expect(warning).toContain(rootPath);
    },
  );

  it('names the path the widget will actually look under, not the root path itself', () => {
    expect(graphqlRootPathWarning('/api/graphql')).toContain('"/api/forms/..."');
    expect(graphqlRootPathWarning('/api')).toContain('"/api/forms/..."');
  });
});
