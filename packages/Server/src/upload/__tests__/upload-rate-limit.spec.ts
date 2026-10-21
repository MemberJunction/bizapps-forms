/**
 * The public upload route had no rate limit at all: every call stores bytes and creates an
 * `MJ: Files` row, and the only gates were a byte cap, a content-type allowlist and the anonymous
 * scope — none of which bound how OFTEN a caller may do it.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { checkUploadRateLimit } from '../upload-rate-limit';
import { FormsRateLimiter, resetPublicSubmitConfigForTests } from '@mj-biz-apps/forms-core-entities-server';

beforeEach(() => {
  // Cleared up front, not on each test's last line: a test that throws mid-body never reaches
  // its own cleanup, and the next test then runs under someone else's configuration.
  FormsRateLimiter.Instance.resetForTests();
  delete process.env.FORMS_UPLOAD_IP_MAX;
  delete process.env.FORMS_RATELIMIT_WINDOW_MS;
  resetPublicSubmitConfigForTests();
});

describe('checkUploadRateLimit', () => {
  it('caps a caller who rotates the session id, and leaves other callers alone', async () => {
    process.env.FORMS_UPLOAD_IP_MAX = '2';
    resetPublicSubmitConfigForTests();

    const attacker = (session: string) => checkUploadRateLimit({ clientIpHash: 'ip-attacker', sessionId: session });
    expect((await attacker('forged-1')).allowed).toBe(true);
    expect((await attacker('forged-2')).allowed).toBe(true);
    expect((await attacker('forged-3')).allowed).toBe(false);

    // A respondent uploading from their own address during the same window is unaffected.
    expect((await checkUploadRateLimit({ clientIpHash: 'ip-respondent', sessionId: 'honest' })).allowed).toBe(true);
    delete process.env.FORMS_UPLOAD_IP_MAX;
  });

  it('does not put unidentifiable callers in a shared bucket', async () => {
    // Same reasoning as the submit pipeline: with no IP the only other identifier is blank for
    // every header-less client, so one shared bucket would let any one of them deny uploads
    // deployment-wide. The route admits instead, exactly as it did before this gate existed.
    process.env.FORMS_UPLOAD_IP_MAX = '1';
    resetPublicSubmitConfigForTests();

    expect((await checkUploadRateLimit({ sessionId: '' })).allowed).toBe(true);
    expect((await checkUploadRateLimit({ sessionId: '' })).allowed).toBe(true);
    expect((await checkUploadRateLimit({ sessionId: '' })).allowed).toBe(true);
    delete process.env.FORMS_UPLOAD_IP_MAX;
  });
});

