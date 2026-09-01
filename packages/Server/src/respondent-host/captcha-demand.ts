/**
 * Boot-time probe: does anything on this host ask for a captcha?
 *
 * The Turnstile readiness check (`host-readiness.ts`) can only say "captcha is required but
 * Turnstile is unconfigured" if something tells it what requires one, and that is data, not
 * config: an active distribution with `CaptchaRequired = 1`, or a published version whose snapshot
 * says `settings.captchaRequired: true`. This is that read — one `RunViews` batch of two bounded,
 * dialect-neutral questions, run once at startup under the system user.
 *
 * It answers with a result, never a throw. It runs inside `ConfigureExpressApp`, i.e. inside the
 * boot of an MJAPI that may be serving other apps too, and its only purpose is a warning line; a
 * failure here is a logged line for the operator, not a dead host. It also does not log itself —
 * the middleware owns the log format, so the failure text travels back to it.
 *
 * The snapshot filter is a LIKE on the compact spelling `JSON.stringify` produces, which is what
 * the publisher writes. That keeps the read free of `JSON_VALUE` / `jsonb` operators, so the same
 * filter runs on SQL Server and PostgreSQL. A snapshot written some other way (pretty-printed by
 * hand) would be missed here — and would only cost the boot warning, since the submit pipeline
 * reads the parsed snapshot and enforces on its own.
 */
import type { RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import { FORM_DISTRIBUTION_ENTITY, FORM_VERSION_ENTITY } from '../public-submit/entity-names';
import type { CaptchaDemand } from './host-readiness';

/**
 * The one method this probe needs from a provider. `new RunView()` satisfies it (the global
 * data provider, the same instance the middleware already uses for the pre-auth slug read), and so
 * does a per-request `DatabaseProviderBase`.
 */
export interface CaptchaDemandProvider {
  RunViews<T = unknown>(params: RunViewParams[], contextUser?: UserInfo): Promise<RunViewResult<T>[]>;
}

/** The probe's answer: the demand, or why it could not be read. */
export type CaptchaDemandRead = { ok: true; demand: CaptchaDemand } | { ok: false; error: string };

/** Two questions, each needing only a yes/no — so one row is enough and `simple` is the shape. */
const ACTIVE_LINKS_REQUIRING_CAPTCHA: RunViewParams = {
  EntityName: FORM_DISTRIBUTION_ENTITY,
  ExtraFilter: `Status='Active' AND IsActive=1 AND CaptchaRequired=1`,
  Fields: ['ID'],
  MaxRows: 1,
  ResultType: 'simple',
};
const PUBLISHED_FORMS_REQUIRING_CAPTCHA: RunViewParams = {
  EntityName: FORM_VERSION_ENTITY,
  ExtraFilter: `Status='Published' AND DefinitionSnapshot LIKE '%"captchaRequired":true%'`,
  Fields: ['ID'],
  MaxRows: 1,
  ResultType: 'simple',
};

/** Read what on this host requires a captcha. See the file header for why this never throws. */
export async function readCaptchaDemand(
  provider: CaptchaDemandProvider,
  contextUser: UserInfo,
): Promise<CaptchaDemandRead> {
  const reads = [ACTIVE_LINKS_REQUIRING_CAPTCHA, PUBLISHED_FORMS_REQUIRING_CAPTCHA];
  let results: RunViewResult<{ ID: string }>[];
  try {
    results = await provider.RunViews<{ ID: string }>(reads, contextUser);
  } catch (e: unknown) {
    return { ok: false, error: `captcha-demand read threw: ${e instanceof Error ? e.message : String(e)}` };
  }
  for (const [i, result] of results.entries()) {
    if (!result?.Success) {
      return {
        ok: false,
        error: `captcha-demand read of ${reads[i].EntityName} failed: ${result?.ErrorMessage ?? 'no result returned'}`,
      };
    }
  }
  const [distributions, versions] = results;
  return {
    ok: true,
    demand: {
      activeDistributions: distributions.Results.length > 0,
      publishedForms: versions.Results.length > 0,
    },
  };
}
