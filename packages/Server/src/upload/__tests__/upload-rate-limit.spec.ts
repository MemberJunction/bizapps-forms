/**
 * The public upload route had no rate limit at all: every call stores bytes and creates an
 * `MJ: Files` row, and the only gates were a byte cap, a content-type allowlist and the anonymous
 * scope — none of which bound how OFTEN a caller may do it.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { checkUploadRateLimit } from '../upload-rate-limit';
import { FormsRateLimiter } from '../../public-submit/rate-limit.service';
import { resetPublicSubmitConfigForTests } from '../../public-submit/config';

beforeEach(() => {
  // Cleared up front, not on each test's last line: a test that throws mid-body never reaches
  // its own cleanup, and the next test then runs under someone else's configuration.
  FormsRateLimiter.Instance.resetForTests();
  delete process.env.FORMS_UPLOAD_IP_MAX;
  delete process.env.FORMS_RATELIMIT_WINDOW_MS;
  resetPublicSubmitConfigForTests();
});

describe('checkUploadRateLimit', () => {
  it('caps a caller who rotates the session id, and leaves other callers alone', () => {
    process.env.FORMS_UPLOAD_IP_MAX = '2';
    resetPublicSubmitConfigForTests();

    const attacker = (session: string) => checkUploadRateLimit({ clientIpHash: 'ip-attacker', sessionId: session });
    expect(attacker('forged-1').allowed).toBe(true);
    expect(attacker('forged-2').allowed).toBe(true);
    expect(attacker('forged-3').allowed).toBe(false);

    // A respondent uploading from their own address during the same window is unaffected.
    expect(checkUploadRateLimit({ clientIpHash: 'ip-respondent', sessionId: 'honest' }).allowed).toBe(true);
    delete process.env.FORMS_UPLOAD_IP_MAX;
  });

  it('does not put unidentifiable callers in a shared bucket', async () => {
    // Same reasoning as the submit pipeline: with no IP the only other identifier is blank for
    // every header-less client, so one shared bucket would let any one of them deny uploads
    // deployment-wide. The route admits instead, exactly as it did before this gate existed.
    process.env.FORMS_UPLOAD_IP_MAX = '1';
    resetPublicSubmitConfigForTests();

    expect(checkUploadRateLimit({ sessionId: '' }).allowed).toBe(true);
    expect(checkUploadRateLimit({ sessionId: '' }).allowed).toBe(true);
    expect(checkUploadRateLimit({ sessionId: '' }).allowed).toBe(true);
    delete process.env.FORMS_UPLOAD_IP_MAX;
  });
});

