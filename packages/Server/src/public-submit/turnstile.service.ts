/**
 * Cloudflare Turnstile verification (DG-4).
 *
 * Captcha is per-form / per-distribution: a submission is only challenged when the
 * form's `FormSettings.captchaRequired` OR the `FormDistribution.CaptchaRequired`
 * flag is on. When required, the respondent's `turnstileToken` is verified against
 * Cloudflare's siteverify endpoint using the server-side secret.
 *
 * Fail-closed: if captcha is required but the secret is unconfigured, verification
 * fails (we never silently let a challenged form through unverified).
 */
import { getPublicSubmitConfig } from './config';

/** Outcome of a Turnstile check; `errorCode` is set only on failure. */
export interface TurnstileResult {
  success: boolean;
  errorCode?: string;
}

/** Shape of the Cloudflare siteverify JSON response we consume. */
interface SiteVerifyResponse {
  success: boolean;
  'error-codes'?: string[];
}

/** Whether a submission must pass a captcha, given the resolved form/distribution flags. */
export function captchaRequired(formCaptcha: boolean, distributionCaptcha: boolean): boolean {
  return formCaptcha || distributionCaptcha;
}

/**
 * Verify a Turnstile token. Returns success immediately when captcha is not required.
 * The HTTP call is injectable (`fetchImpl`) so tests run without network.
 */
export async function verifyTurnstile(
  required: boolean,
  token: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<TurnstileResult> {
  if (!required) {
    return { success: true };
  }
  const config = getPublicSubmitConfig();
  if (!config.turnstileSecret) {
    return { success: false, errorCode: 'turnstile-not-configured' };
  }
  if (!token || token.trim() === '') {
    return { success: false, errorCode: 'missing-token' };
  }
  return callSiteVerify(config.turnstileVerifyUrl, config.turnstileSecret, token, fetchImpl);
}

/** Perform the siteverify POST and normalize the response into a {@link TurnstileResult}. */
async function callSiteVerify(
  url: string,
  secret: string,
  token: string,
  fetchImpl: typeof fetch,
): Promise<TurnstileResult> {
  const body = new URLSearchParams({ secret, response: token });
  try {
    const res = await fetchImpl(url, { method: 'POST', body });
    if (!res.ok) {
      return { success: false, errorCode: `http-${res.status}` };
    }
    const parsed = (await res.json()) as SiteVerifyResponse;
    if (parsed.success) {
      return { success: true };
    }
    return { success: false, errorCode: parsed['error-codes']?.[0] ?? 'verification-failed' };
  } catch {
    return { success: false, errorCode: 'turnstile-unreachable' };
  }
}
