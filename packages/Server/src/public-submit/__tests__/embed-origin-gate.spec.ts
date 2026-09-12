/**
 * The submit pipeline refuses a caller whose Origin the distribution did not authorise (#203).
 *
 * Issue #203's second acceptance criterion, at the gate that actually writes rows. Verified by
 * reproduction on 2026-09-12 that `Origin: https://evil.example` previously returned
 * `success: true` and persisted a FormResponse — so the assertions below look at the fake's
 * PERSISTENCE and not only at the returned shape. The bug being fixed is a write, and a result
 * object that says `success: false` while a row lands is the failure mode worth guarding against.
 *
 * The own-origin cases are the ones that keep this gate from being useless in production: a
 * legitimate `<iframe>` embed's `fetch` reports the API's origin, never the customer's (measured,
 * see `http/embed-origin.ts`). A gate that only consulted the author's list would refuse every
 * real embed, and the first person to notice would be a respondent.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runSubmitPipeline, type PipelineContext, type PipelineSubmission } from '../submit-pipeline';
import { FormsRateLimiter } from '../rate-limit.service';
import { resetPublicSubmitConfigForTests } from '../config';
import { FOREIGN_ORIGIN_MESSAGE, resetEmbedOriginConfigForTests } from '../../http/embed-origin';
import {
  makeContextUser,
  makeDefinition,
  makeDistribution,
  makeFakeProvider,
  makeVersion,
  respondentPermissions,
} from './fakes';

const FORM_RESPONSE_ENTITY = 'MJ_BizApps_Forms: Form Responses';

/** The origin this API is deployed on, as every test here configures it. */
const OWN_ORIGIN = 'https://forms.ourhost.test';

/** A distribution that has authorised exactly one customer site. */
const AUTHORED = '["https://careers.acme.com"]';

/** A submission that satisfies the default required ShortText question. */
function validSubmission(overrides?: Partial<PipelineSubmission>): PipelineSubmission {
  return {
    distributionSlug: 'public-1',
    formVersionId: 'ver-1',
    answers: [{ questionId: 'q-name', textValue: 'Ada Lovelace' }],
    ...overrides,
  };
}

/**
 * A pipeline context over the shared fakes, varying only the two things this gate reads: the
 * distribution's authored column and the caller's `Origin`.
 *
 * Deliberately built from `fakes.ts` like every other pipeline spec rather than from a private
 * set of doubles — a second set would drift from the first, and the gate under test sits in the
 * middle of the same pipeline those doubles already model end to end.
 */
function makeContext(
  allowedOrigins: string | null,
  requestOrigin?: string,
): { ctx: PipelineContext; saved: () => ReturnType<typeof makeFakeProvider>['saved'] } {
  const fake = makeFakeProvider({
    distribution: makeDistribution({ AllowedOrigins: allowedOrigins }),
    version: makeVersion(makeDefinition()),
    createPermissions: respondentPermissions(),
  });
  const ctx: PipelineContext = {
    provider: fake.provider,
    contextUser: makeContextUser(),
    elevatedUser: makeContextUser(),
    sessionId: 'sess-abc',
    requestOrigin,
  };
  return { ctx, saved: () => fake.saved };
}

beforeEach(() => {
  FormsRateLimiter.Instance.resetForTests();
  delete process.env.FORMS_RATELIMIT_MAX;
  process.env.MJAPI_PUBLIC_URL = OWN_ORIGIN;
  resetPublicSubmitConfigForTests();
  resetEmbedOriginConfigForTests();
});

afterEach(() => {
  delete process.env.MJAPI_PUBLIC_URL;
  delete process.env.FORMS_RATELIMIT_MAX;
  resetPublicSubmitConfigForTests();
  resetEmbedOriginConfigForTests();
});

describe('a distribution that authored nothing is unrestricted', () => {
  // The regression guard for every link that exists today. Every FormDistribution row in every
  // install is NULL here, so if these two ever fail the feature has broken all of them at once.
  it('accepts a submit from an arbitrary origin', async () => {
    const { ctx, saved } = makeContext(null, 'https://anywhere.example');

    const result = await runSubmitPipeline(ctx, validSubmission());

    expect(result.success).toBe(true);
    expect(saved().map((row) => row.entityName)).toContain(FORM_RESPONSE_ENTITY);
  });

  it('accepts a submit that carried no Origin at all', async () => {
    const { ctx, saved } = makeContext(null, undefined);

    const result = await runSubmitPipeline(ctx, validSubmission());

    expect(result.success).toBe(true);
    expect(saved().map((row) => row.entityName)).toContain(FORM_RESPONSE_ENTITY);
  });
});

describe('a distribution that authored an allowlist admits only what it named, plus us', () => {
  it('accepts the origin the author declared', async () => {
    const { ctx, saved } = makeContext(AUTHORED, 'https://careers.acme.com');

    const result = await runSubmitPipeline(ctx, validSubmission());

    expect(result.success).toBe(true);
    expect(saved().map((row) => row.entityName)).toContain(FORM_RESPONSE_ENTITY);
  });

  it('accepts this API\'s OWN origin, which is what a real iframe embed sends', async () => {
    // Not a loophole — the load-bearing case. The customer's page frames our host page, so the
    // widget's `fetch` reports us. Refusing this would refuse the embed the allowlist exists to
    // permit, and the author's list would be unusable in the one deployment shape it is for.
    const { ctx, saved } = makeContext(AUTHORED, OWN_ORIGIN);

    const result = await runSubmitPipeline(ctx, validSubmission());

    expect(result.success).toBe(true);
    expect(saved().map((row) => row.entityName)).toContain(FORM_RESPONSE_ENTITY);
  });

  it('refuses a foreign origin and writes NOTHING', async () => {
    const { ctx, saved } = makeContext(AUTHORED, 'https://evil.example');

    const result = await runSubmitPipeline(ctx, validSubmission());

    expect(result.success).toBe(false);
    expect(result.errors?.[0].message).toBe(FOREIGN_ORIGIN_MESSAGE);
    // The reproduction wrote a row. The absence of one is the actual fix.
    expect(saved()).toHaveLength(0);
  });

  it('refuses a caller that sent no Origin once a list exists', async () => {
    // A non-browser client (curl, server-to-server) sends none, and is therefore refused by a
    // restricted link. Stated as intent in the spec: an allowlist that admits on no-match is
    // decorative.
    const { ctx, saved } = makeContext(AUTHORED, undefined);

    const result = await runSubmitPipeline(ctx, validSubmission());

    expect(result.success).toBe(false);
    expect(result.errors?.[0].message).toBe(FOREIGN_ORIGIN_MESSAGE);
    expect(saved()).toHaveLength(0);
  });
});

describe('an authored value nobody can evaluate refuses everyone', () => {
  it('refuses even this API\'s own origin when every entry fails the grammar', async () => {
    // The author asked for a restriction. The honest answer to a restriction that cannot be read
    // is "no", not "everyone" — falling back to unrestricted would silently turn an attempt to
    // lock a link down into no lock at all.
    const { ctx, saved } = makeContext('["*.acme.com"]', OWN_ORIGIN);

    const result = await runSubmitPipeline(ctx, validSubmission());

    expect(result.success).toBe(false);
    expect(result.errors?.[0].message).toBe(FOREIGN_ORIGIN_MESSAGE);
    expect(saved()).toHaveLength(0);
  });
});

describe('the refusal costs the respondent nothing', () => {
  it('does not charge the rate limiter for an origin it refused', async () => {
    // The pipeline's standing rule is that a request one gate refuses does not eat the
    // respondent's budget in another, and this gate refuses on a fact about the LINK rather than
    // about the caller — so a mis-embedded page must not be able to burn a real respondent's
    // window on refusals nobody in the browser can influence.
    //
    // Asserted through the limiter's own behaviour rather than through a spy, because the limiter
    // is a `BaseSingleton` the pipeline reaches directly and there is no seam to inject a double
    // into. With a budget of exactly one, a legitimate submit after the refusal can only succeed
    // if the refusal spent nothing.
    process.env.FORMS_RATELIMIT_MAX = '1';
    resetPublicSubmitConfigForTests();

    const refused = makeContext(AUTHORED, 'https://evil.example');
    const refusal = await runSubmitPipeline(refused.ctx, validSubmission());
    expect(refusal.success).toBe(false);

    const admitted = makeContext(AUTHORED, 'https://careers.acme.com');
    const result = await runSubmitPipeline(admitted.ctx, validSubmission());

    expect(result.success).toBe(true);
    expect(admitted.saved().map((row) => row.entityName)).toContain(FORM_RESPONSE_ENTITY);
  });
});
