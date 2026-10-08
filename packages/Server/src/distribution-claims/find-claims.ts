/**
 * Ask every registered consumer app which of a form's share-link slugs it owns.
 *
 * The providers are foreign code answering on the builder's request path, so nothing they return
 * is trusted: the answer is validated claim by claim, a provider that throws, hangs or lies costs
 * only its own contribution, and every refusal is BOTH reported to the caller (so the builder can
 * say "Caliber did not answer" rather than silently showing no warning) and logged with the app
 * and slugs. Silence here would read as "nobody owns this slug", which is the one wrong answer.
 */
import { LogError } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import type { GlobalObjectStore } from '@memberjunction/global';

import {
  CLAIM_PROVIDER_TIMEOUT_MS,
  DISTRIBUTION_CLAIM_PROVIDERS_KEY,
  type AttributedClaim,
  type ClaimFailure,
  type ClaimLookup,
  type DistributionClaimProvider,
} from './claim-contract.js';

const UNKNOWN_APP = 'unknown';
const MAX_LABEL_LENGTH = 200;

/**
 * What the author sees when a provider threw. The provider's own error text may carry SQL or other
 * internals that must not reach a browser; the full error goes to the server log instead.
 */
const GENERIC_NO_ANSWER = 'did not answer (details in the server log)';

/** Thrown by the timer so a timeout can be told apart from the provider's own failure. */
class ClaimTimeoutError extends Error {}

/** Collects one lookup's failures and mirrors each to the server log with its context. */
class FailureLog {
  readonly failures: ClaimFailure[] = [];

  constructor(private readonly slugs: readonly string[]) {}

  /** `logDetail` carries the full cause when it is unsafe to show the author in `message`. */
  record(appName: string, message: string, logDetail: string = message): void {
    this.failures.push({ appName, message });
    LogError(`[Forms] distribution claims: ${appName} for slugs ${this.slugs.join(', ')}: ${logDetail}`);
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isUsableName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= MAX_LABEL_LENGTH;
}

/**
 * `entry` is `unknown` because the store's index type is `any` and any app may have pushed
 * anything; the guard narrows it before a single member is used.
 */
function isProvider(entry: unknown): entry is DistributionClaimProvider {
  return isRecord(entry) && isUsableName(entry.AppName) && typeof entry.FindClaims === 'function';
}

function describeBadEntry(entry: unknown): ClaimFailure {
  if (isRecord(entry) && isUsableName(entry.AppName)) {
    return { appName: entry.AppName.trim(), message: 'registered a claim provider without a FindClaims function' };
  }
  const tooLong = isRecord(entry) && typeof entry.AppName === 'string' && entry.AppName.trim().length > MAX_LABEL_LENGTH;
  const what = tooLong ? `an AppName over ${MAX_LABEL_LENGTH} characters` : 'no AppName';
  return { appName: UNKNOWN_APP, message: `registered a claim provider with ${what}` };
}

/**
 * Read the registered providers from the global object store. A pure read: it reports what it
 * rejects rather than repairing the slot, which belongs to the consumers.
 */
export function readClaimProviders(store: GlobalObjectStore | null): { providers: DistributionClaimProvider[]; failures: ClaimFailure[] } {
  const slot: unknown = store?.[DISTRIBUTION_CLAIM_PROVIDERS_KEY]; // unknown: any app may have written this slot
  if (slot === undefined || slot === null) return { providers: [], failures: [] };
  const entries: unknown[] = Array.isArray(slot) ? slot : [];
  const providers = entries.filter(isProvider);
  const failures = Array.isArray(slot)
    ? entries.filter((e) => !isProvider(e)).map(describeBadEntry)
    : [{ appName: UNKNOWN_APP, message: 'registered a claim provider slot that is not an array' }];
  failures.forEach((f) => LogError(`[Forms] distribution claims: ${f.appName}: ${f.message}`));
  return { providers, failures };
}

/** True only for an absolute http(s) URL; the builder renders it as a link, so `javascript:` must not pass. */
function isPublicHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    // Not a fault to surface here: "does not parse" IS the answer `false`, and the caller records it as a failure.
    return false;
  }
}

/**
 * Race the provider against a timer. The call is wrapped in an async function so a synchronous
 * throw becomes a rejection like any other. The result is `unknown` because a provider can return
 * anything regardless of its declared type; {@link validateAnswer} checks it.
 */
async function askWithTimeout(provider: DistributionClaimProvider, slugs: readonly string[], user: UserInfo, timeoutMs: number): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ClaimTimeoutError(`did not answer within ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([(async () => provider.FindClaims(slugs, user))(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function acceptUrl(url: unknown, appName: string, slug: string, log: FailureLog): string | null {
  if (url === null) return null; // deliberate: the consumer does not want a link published
  if (typeof url === 'string' && isPublicHttpUrl(url)) return url;
  log.record(appName, `returned a respondentUrl for "${slug}" that is not an absolute http(s) URL`);
  return null;
}

/** Validate one raw claim; returns it attributed (URL nulled if unsafe) or null when rejected. */
function acceptClaim(raw: unknown, appName: string, asked: ReadonlySet<string>, log: FailureLog): AttributedClaim | null {
  if (!isRecord(raw) || typeof raw.slug !== 'string') {
    log.record(appName, 'returned a claim without a slug');
    return null;
  }
  if (!asked.has(raw.slug)) {
    log.record(appName, `claimed slug "${raw.slug}" that was not asked about`);
    return null;
  }
  if (!isUsableName(raw.ownerLabel)) {
    log.record(appName, `returned a claim for "${raw.slug}" with a blank or over-long ownerLabel`);
    return null;
  }
  return { appName, slug: raw.slug, ownerLabel: raw.ownerLabel.trim(), respondentUrl: acceptUrl(raw.respondentUrl, appName, raw.slug, log) };
}

function validateAnswer(answer: unknown, appName: string, asked: ReadonlySet<string>, log: FailureLog): AttributedClaim[] {
  if (!Array.isArray(answer)) {
    log.record(appName, 'returned something other than an array of claims');
    return [];
  }
  const accepted: AttributedClaim[] = [];
  for (const raw of answer as unknown[]) {
    const claim = acceptClaim(raw, appName, asked, log);
    if (claim) accepted.push(claim);
  }
  return accepted;
}

async function askOne(
  provider: DistributionClaimProvider,
  slugs: readonly string[],
  asked: ReadonlySet<string>,
  user: UserInfo,
  timeoutMs: number,
  log: FailureLog,
): Promise<AttributedClaim[]> {
  const appName = provider.AppName.trim();
  try {
    const answer = await askWithTimeout(provider, Object.freeze([...slugs]), user, timeoutMs);
    return validateAnswer(answer, appName, asked, log);
  } catch (error) {
    if (error instanceof ClaimTimeoutError) log.record(appName, error.message);
    else log.record(appName, GENERIC_NO_ANSWER, `threw: ${describeError(error)}`);
    return [];
  }
}

/**
 * Ask every provider, in parallel, which of `slugs` it owns. Never rejects: a provider's failure
 * becomes a `failures` entry and the other providers' answers still count.
 */
export async function findDistributionClaims(
  slugs: readonly string[],
  contextUser: UserInfo,
  providers: readonly DistributionClaimProvider[],
  timeoutMs: number = CLAIM_PROVIDER_TIMEOUT_MS,
): Promise<ClaimLookup> {
  if (slugs.length === 0) return { claims: [], failures: [] };
  const asked: ReadonlySet<string> = new Set(slugs); // built before any provider runs, so none can widen it
  const log = new FailureLog(slugs);
  const answers = await Promise.all(providers.map((p) => askOne(p, slugs, asked, contextUser, timeoutMs, log)));
  return { claims: answers.flat(), failures: log.failures };
}
