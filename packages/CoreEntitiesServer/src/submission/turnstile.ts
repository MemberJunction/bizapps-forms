/**
 * Cloudflare Turnstile verification (DG-4).
 *
 * Captcha is per-form / per-distribution: a submission is only challenged when the
 * form's `FormSettings.captchaRequired` OR the `FormDistribution.CaptchaRequired`
 * flag is on. When required, the respondent's `turnstileToken` is verified against
 * Cloudflare's siteverify endpoint using the server-side secret.
 *
 * Fail-closed: if captcha is required but the secret is unconfigured, verification
 * fails (we never silently let a challenged form through unverified). That outcome is
 * {@link TURNSTILE_NOT_CONFIGURED}, and it is the one code here that is the SERVER's fault, not the
 * respondent's — the pipeline words it accordingly (#122).
 *
 * Two hardening signals ride the verify beyond secret+token:
 *
 *  - `remoteip` — the caller's resolved peer address, when the request-identity layer produced
 *    one. Cloudflare then binds the token to the address that solved the challenge, so a token
 *    harvested on one machine cannot be replayed from another. Optional on purpose: the peer can
 *    be unresolvable (no middleware, exotic proxy), and a verify without it is the pre-hardening
 *    behaviour, not a new failure mode.
 *  - `hostname` — the host of the page the challenge was solved on, echoed back by Cloudflare.
 *    Checked against the hostnames a legitimate solve can report (this API's own public host plus
 *    the distribution's authored embed origins) and LOGGED on a mismatch, never refused. Warn-only
 *    is deliberate: the expected set is derived from `MJAPI_PUBLIC_URL` and `AllowedOrigins`,
 *    and neither is guaranteed to name every hostname a legitimate deployment answers on (multi-
 *    host proxies, internal names), so failing on it would brick working captcha-enabled forms.
 *    An operator who sees the warning and knows their topology can act on it; `remoteip` above is
 *    the enforcement half.
 */
import { LogError } from '@memberjunction/core';
import { getPublicSubmitConfig } from './config.js';

/** Captcha was required but `FORMS_TURNSTILE_SECRET` is unset: a host misconfiguration, not a failed check. */
export const TURNSTILE_NOT_CONFIGURED = 'turnstile-not-configured';

/** Outcome of a Turnstile check; `errorCode` is set only on failure. */
export interface TurnstileResult {
  success: boolean;
  errorCode?: string;
}

/** Shape of the Cloudflare siteverify JSON response we consume. */
interface SiteVerifyResponse {
  success: boolean;
  'error-codes'?: string[];
  /** Hostname of the site the challenge was solved on, when Cloudflare reports one. */
  hostname?: string;
}

/** Optional context for a Turnstile verify — everything beyond "required + token". */
export interface TurnstileVerifyOptions {
  /**
   * The caller's resolved peer address, forwarded to Cloudflare as `remoteip` so the token is
   * bound to the machine that solved the challenge. Pass only a value screened by
   * `forwardableAddress` (http/request-identity.ts): this leaves the process as a claim about
   * the world, not an opaque key.
   */
  remoteIp?: string;
  /**
   * Hostnames a legitimate solve can report (lowercase). A reported `hostname` outside this set
   * is logged for the operator and NOT refused — see the module header for why warn-only.
   * Empty/absent means "nothing to compare against": no check runs.
   */
  expectedHostnames?: readonly string[];
  /** The HTTP call is injectable so tests run without network; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

/** Whether a submission must pass a captcha, given the resolved form/distribution flags. */
export function captchaRequired(formCaptcha: boolean, distributionCaptcha: boolean): boolean {
  return formCaptcha || distributionCaptcha;
}

/**
 * The lowercase hostnames of the given origin/URL strings, for {@link TurnstileVerifyOptions}'
 * `expectedHostnames`. Unparseable and absent entries are skipped rather than refused — this
 * feeds a warn-only comparison, so a malformed source must cost coverage, never availability.
 */
export function expectedTurnstileHostnames(origins: ReadonlyArray<string | undefined>): string[] {
  const hostnames = new Set<string>();
  for (const origin of origins) {
    if (!origin) {
      continue;
    }
    try {
      hostnames.add(new URL(origin).hostname.toLowerCase());
    } catch {
      // Not a URL — skip; the comparison simply has one fewer expected host.
    }
  }
  return [...hostnames];
}

/**
 * Verify a Turnstile token. Returns success immediately when captcha is not required.
 */
export async function verifyTurnstile(
  required: boolean,
  token: string | undefined,
  options: TurnstileVerifyOptions = {},
): Promise<TurnstileResult> {
  if (!required) {
    return { success: true };
  }
  const config = getPublicSubmitConfig();
  if (!config.turnstileSecret) {
    return { success: false, errorCode: TURNSTILE_NOT_CONFIGURED };
  }
  if (!token || token.trim() === '') {
    return { success: false, errorCode: 'missing-token' };
  }
  return callSiteVerify(config.turnstileVerifyUrl, config.turnstileSecret, token, options);
}

/** Perform the siteverify POST and normalize the response into a {@link TurnstileResult}. */
async function callSiteVerify(
  url: string,
  secret: string,
  token: string,
  options: TurnstileVerifyOptions,
): Promise<TurnstileResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const body = new URLSearchParams({ secret, response: token });
  if (options.remoteIp) {
    body.set('remoteip', options.remoteIp);
  }
  try {
    const res = await fetchImpl(url, { method: 'POST', body });
    if (!res.ok) {
      return { success: false, errorCode: `http-${res.status}` };
    }
    const parsed = (await res.json()) as SiteVerifyResponse;
    if (parsed.success) {
      warnOnUnexpectedHostname(parsed.hostname, options.expectedHostnames);
      return { success: true };
    }
    return { success: false, errorCode: parsed['error-codes']?.[0] ?? 'verification-failed' };
  } catch {
    return { success: false, errorCode: 'turnstile-unreachable' };
  }
}

/**
 * Say so — to the operator, not the respondent — when a verified token was solved on a hostname
 * outside the expected set. Warn-only by design; the module header carries the reasoning.
 */
function warnOnUnexpectedHostname(
  reported: string | undefined,
  expected: readonly string[] | undefined,
): void {
  if (!reported || !expected || expected.length === 0) {
    return;
  }
  if (expected.includes(reported.toLowerCase())) {
    return;
  }
  LogError(
    `[Forms] Turnstile token verified, but it was solved on hostname "${reported}", which is not ` +
      `this API's public host or one of the distribution's allowed embed origins (${expected.join(', ')}). ` +
      `The submission was NOT refused — this set is derived from MJAPI_PUBLIC_URL and AllowedOrigins ` +
      `and may not name every host this deployment answers on — but if this hostname is not yours, ` +
      `the token was minted on someone else's page.`,
  );
}
