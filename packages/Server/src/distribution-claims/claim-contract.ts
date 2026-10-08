/**
 * The protocol a consumer app implements to tell Forms "I own this share-link slug".
 *
 * WHY A PROTOCOL AND NOT AN IMPORT. A consumer (a hiring app that points a slug at one of its own
 * interview steps) and Forms are separate Open Apps with separate release trains; neither may
 * depend on the other. So the contract is plain shapes in a versioned slot of MJ's global object
 * store, and these types exist for Forms' own use. A consumer re-declares the shapes it needs and
 * registers an object that matches them. The prose version, for consumer authors, is
 * `docs/distribution-claims.md`.
 */
import type { UserInfo } from '@memberjunction/core';

/**
 * The global-object-store slot consumers register under.
 *
 * Versioned (`.v1`) so an incompatible change can ship under a new key while old consumers keep
 * working against the old one. The value is an ARRAY that a consumer creates if it is absent and
 * pushes onto; nobody ever replaces it, because replacing would silently evict every other
 * consumer's registration. It is read lazily on each query rather than captured at startup, so
 * the order in which apps load does not matter.
 */
export const DISTRIBUTION_CLAIM_PROVIDERS_KEY = '__mjBizAppsForms.distributionClaimProviders.v1';

/**
 * How long one provider gets to answer. A provider is foreign code answering a builder-facing
 * query, so a hung one must cost the author five seconds and a failure line, never an open spinner.
 */
export const CLAIM_PROVIDER_TIMEOUT_MS = 5000;

/** One slug a consumer app owns. */
export interface DistributionClaim {
  /** Must be one of the slugs that were asked about. */
  slug: string;
  /** What inside the consumer owns the slug, e.g. an interview step's name. */
  ownerLabel: string;
  /**
   * The consumer's own public link for this slug, or `null` when the consumer must not have one
   * published (the builder then tells the author to use the link the consumer hands out).
   */
  respondentUrl: string | null;
}

/** A consumer app's registration in the {@link DISTRIBUTION_CLAIM_PROVIDERS_KEY} slot. */
export interface DistributionClaimProvider {
  /** The app name the author will recognise, e.g. "Caliber". */
  readonly AppName: string;
  /**
   * Read-only. Return a claim for each asked slug this app owns and omit the rest.
   * `contextUser` is the builder user; the provider decides what that user may learn.
   */
  FindClaims(slugs: readonly string[], contextUser: UserInfo): Promise<DistributionClaim[]>;
}

/** An app that could not be consulted, or whose answer was partly refused, and why. */
export interface ClaimFailure {
  appName: string;
  message: string;
}

/** A claim together with the app that made it. */
export type AttributedClaim = DistributionClaim & { appName: string };

/** Everything the fan-out learned: the accepted claims and what went wrong along the way. */
export interface ClaimLookup {
  claims: AttributedClaim[];
  failures: ClaimFailure[];
}
