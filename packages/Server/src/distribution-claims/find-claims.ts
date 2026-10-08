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
  MAX_CLAIMS_PER_PROVIDER,
  MAX_FAILURES_PER_PROVIDER,
  type AttributedClaim,
  type ClaimFailure,
  type ClaimLookup,
  type DistributionClaimProvider,
} from './claim-contract.js';

const UNKNOWN_APP = 'unknown';
const MAX_LABEL_LENGTH = 200;
/** An unasked slug is echoed to the author and the log; a provider must not be able to flood either. */
const MAX_ECHOED_SLUG_LENGTH = 100;

/**
 * What the author sees when a provider threw. The provider's own error text may carry SQL or other
 * internals that must not reach a browser; the full error goes to the server log instead.
 */
const GENERIC_NO_ANSWER = 'did not answer (details in the server log)';

/** Thrown by the timer so a timeout can be told apart from the provider's own failure. */
class ClaimTimeoutError extends Error {}

/**
 * Collects one lookup's failures and mirrors each to the server log with its context. Each app may
 * report {@link MAX_FAILURES_PER_PROVIDER} failures; {@link finish} adds one summary per app that
 * went over, so a provider cannot flood the response or the log.
 */
class FailureLog {
  readonly failures: ClaimFailure[] = [];
  private readonly reported = new Map<string, number>();
  private readonly suppressed = new Map<string, number>();

  constructor(private readonly slugs: readonly string[]) {}

  /** `logDetail` carries the full cause when it is unsafe to show the author in `message`. */
  record(appName: string, message: string, logDetail: string = message): void {
    const count = this.reported.get(appName) ?? 0;
    if (count >= MAX_FAILURES_PER_PROVIDER) {
      this.suppressed.set(appName, (this.suppressed.get(appName) ?? 0) + 1);
      return;
    }
    this.reported.set(appName, count + 1);
    this.emit(appName, message, logDetail);
  }

  /** Emit one summary per app that exceeded its cap; call exactly once, after the last `record`. */
  finish(): void {
    for (const [appName, extra] of this.suppressed) this.emit(appName, `and ${extra} more problems (suppressed)`);
    this.suppressed.clear();
  }

  private emit(appName: string, message: string, logDetail: string = message): void {
    this.failures.push({ appName, message });
    LogError(`[Forms] distribution claims: ${appName} for slugs ${this.slugs.join(', ')}: ${logDetail}`);
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

function capForEcho(value: string): string {
  return value.length > MAX_ECHOED_SLUG_LENGTH ? `${value.slice(0, MAX_ECHOED_SLUG_LENGTH)}…` : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isUsableName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= MAX_LABEL_LENGTH;
}

type EntryRead = { provider: DistributionClaimProvider } | { failure: ClaimFailure };

/**
 * Snapshot one slot entry. `entry` is `unknown` because the store's index type is `any` and any
 * app may have pushed anything; every member is read exactly once, inside the caller's try, so a
 * throwing getter is a reported failure and later reads cannot differ from the validated ones.
 */
function snapshotEntry(entry: unknown): EntryRead {
  if (!isRecord(entry)) return { failure: { appName: UNKNOWN_APP, message: 'registered a claim provider with no AppName' } };
  const rawName: unknown = entry.AppName;
  const findClaims: unknown = entry.FindClaims;
  if (!isUsableName(rawName)) {
    const tooLong = typeof rawName === 'string' && rawName.trim().length > MAX_LABEL_LENGTH;
    const what = tooLong ? `an AppName over ${MAX_LABEL_LENGTH} characters` : 'no AppName';
    return { failure: { appName: UNKNOWN_APP, message: `registered a claim provider with ${what}` } };
  }
  const appName = rawName.trim();
  if (typeof findClaims !== 'function') {
    return { failure: { appName, message: 'registered a claim provider without a FindClaims function' } };
  }
  // Called with the original entry as `this`, as a method call would, so providers may use `this`.
  return { provider: { AppName: appName, FindClaims: (slugs, user) => findClaims.call(entry, slugs, user) } };
}

/** Snapshot one entry; a refusal of any kind (including a throwing getter) is logged here with its cause. */
function readEntry(entry: unknown): EntryRead {
  try {
    const read = snapshotEntry(entry);
    if ('failure' in read) LogError(`[Forms] distribution claims: ${read.failure.appName}: ${read.failure.message}`);
    return read;
  } catch (error) {
    LogError(`[Forms] distribution claims: a claim provider entry could not be read: ${describeError(error)}`);
    return { failure: { appName: UNKNOWN_APP, message: 'registered a claim provider that could not be read' } };
  }
}

/**
 * Read the registered providers from the global object store. A read: it reports and logs what it
 * rejects, but never repairs the slot, which belongs to the consumers. Providers come back as
 * plain snapshots, so a getter on the consumer's object cannot misbehave later in the lookup.
 */
export function readClaimProviders(store: GlobalObjectStore | null): { providers: DistributionClaimProvider[]; failures: ClaimFailure[] } {
  const slot: unknown = store?.[DISTRIBUTION_CLAIM_PROVIDERS_KEY]; // unknown: any app may have written this slot
  if (slot === undefined || slot === null) return { providers: [], failures: [] };
  if (!Array.isArray(slot)) {
    const failure = { appName: UNKNOWN_APP, message: 'registered a claim provider slot that is not an array' };
    LogError(`[Forms] distribution claims: ${failure.appName}: ${failure.message}`);
    return { providers: [], failures: [failure] };
  }
  const reads = (slot as unknown[]).map(readEntry);
  return {
    providers: reads.flatMap((r) => ('provider' in r ? [r.provider] : [])),
    failures: reads.flatMap((r) => ('failure' in r ? [r.failure] : [])),
  };
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
    log.record(appName, `claimed slug "${capForEcho(raw.slug)}" that was not asked about`);
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
  if (answer.length > MAX_CLAIMS_PER_PROVIDER) {
    log.record(appName, `returned ${answer.length} claims; only the first ${MAX_CLAIMS_PER_PROVIDER} were checked`);
  }
  const accepted: AttributedClaim[] = [];
  for (const raw of (answer as unknown[]).slice(0, MAX_CLAIMS_PER_PROVIDER)) {
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
  let appName = UNKNOWN_APP; // the read below can throw on a raw provider, and the catch still needs a name
  try {
    appName = provider.AppName.trim(); // readClaimProviders hands over a snapshot, but callers may pass raw providers
    const answer = await askWithTimeout(provider, Object.freeze([...slugs]), user, timeoutMs);
    return validateAnswer(answer, appName, asked, log);
  } catch (error) {
    if (error instanceof ClaimTimeoutError) log.record(appName, error.message);
    else log.record(appName, GENERIC_NO_ANSWER, `threw: ${describeError(error)}`);
    return [];
  }
}

/**
 * Keep the first claim per (app, slug); report each further one against its app. Two providers
 * can share an AppName (a package loaded twice), and the builder keys its rows by app name, so a
 * duplicate would render two identical rows.
 */
function dropDuplicateClaims(claims: readonly AttributedClaim[], log: FailureLog): AttributedClaim[] {
  const seen = new Set<string>();
  const kept: AttributedClaim[] = [];
  for (const claim of claims) {
    const key = JSON.stringify([claim.appName, claim.slug]);
    if (seen.has(key)) {
      log.record(claim.appName, `claimed slug "${capForEcho(claim.slug)}" more than once`);
    } else {
      seen.add(key);
      kept.push(claim);
    }
  }
  return kept;
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
  const claims = dropDuplicateClaims(answers.flat(), log);
  log.finish();
  return { claims, failures: log.failures };
}
