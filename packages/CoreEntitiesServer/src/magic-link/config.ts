/**
 * Configuration for distribution magic-link provisioning.
 *
 * Generic + host-configurable. Every knob is read from `process.env` ONCE and
 * frozen (same pattern as the public-submit config in `@mj-biz-apps/forms-server`),
 * so a host tunes behaviour without code changes and the defaults are safe.
 *
 * Env vars:
 *  - `FORMS_MAGICLINK_CHANNELS`   Comma-separated `ChannelType` values that get an
 *                                 anonymous link minted. Default `PublicLink,Embed,QR`
 *                                 (NOT `Email` — email distributions are individually
 *                                 addressed, not anonymous public links).
 *  - `FORMS_MAGICLINK_MAX_USES`   Default `maxUses` for the minted invite. Default
 *                                 1,000,000 — effectively a public URL. A distribution's
 *                                 own `MaxResponses` quota is enforced separately at submit.
 *  - `FORMS_MAGICLINK_EXPIRY_HOURS`  Fixed expiry (hours) applied to every minted link.
 *                                 Unset (default) = no fixed expiry; expiry is instead
 *                                 driven by the distribution's `CloseAt` when set.
 *  - `FORMS_MAGICLINK_APPLICATION`   Application name the anonymous session is scoped to.
 *                                 Default `Forms` (the app WP-A seeds).
 *  - `FORMS_MAGICLINK_ROLE`       Restricted role the invite grants. Default
 *                                 `Form Respondent` (the role WP-A seeds). Must be
 *                                 magic-link grantable on the host.
 */

/** A `ChannelType` value on `FormDistribution`. */
export type DistributionChannelType = 'Email' | 'Embed' | 'PublicLink' | 'QR';

/** Frozen, validated configuration for distribution magic-link provisioning. */
export interface MagicLinkProvisioningConfig {
  /** Channel types that receive a minted anonymous link. */
  linkableChannels: ReadonlySet<DistributionChannelType>;
  /** Default `maxUses` for the minted invite. */
  defaultMaxUses: number;
  /** Fixed expiry in hours, or `undefined` to use the distribution `CloseAt` (or none). */
  fixedExpiryHours: number | undefined;
  /** Application name the anonymous session is scoped to. */
  applicationName: string;
  /** Restricted role the invite grants. */
  roleName: string;
}

const ALL_CHANNELS: readonly DistributionChannelType[] = ['Email', 'Embed', 'PublicLink', 'QR'];
const DEFAULT_CHANNELS: readonly DistributionChannelType[] = ['PublicLink', 'Embed', 'QR'];
const DEFAULT_MAX_USES = 1_000_000;
const DEFAULT_APPLICATION = 'Forms';
const DEFAULT_ROLE = 'Form Respondent';

/** Numeric env read with a default; non-numeric / non-positive falls back. */
function positiveNumberFromEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Optional positive-number env read; returns `undefined` when unset/invalid. */
function optionalPositiveNumberFromEnv(key: string): number | undefined {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') {
    return undefined;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/** Parse the channel allow-list; unknown tokens are ignored; empty falls back to defaults. */
function channelsFromEnv(key: string): ReadonlySet<DistributionChannelType> {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') {
    return new Set(DEFAULT_CHANNELS);
  }
  const valid = new Set<DistributionChannelType>(ALL_CHANNELS);
  const parsed = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is DistributionChannelType => valid.has(s as DistributionChannelType));
  return parsed.length > 0 ? new Set(parsed) : new Set(DEFAULT_CHANNELS);
}

let cached: MagicLinkProvisioningConfig | undefined;

/** Read (and memoize) the magic-link provisioning configuration from the environment. */
export function getMagicLinkProvisioningConfig(): MagicLinkProvisioningConfig {
  if (cached) {
    return cached;
  }
  cached = Object.freeze({
    linkableChannels: channelsFromEnv('FORMS_MAGICLINK_CHANNELS'),
    defaultMaxUses: positiveNumberFromEnv('FORMS_MAGICLINK_MAX_USES', DEFAULT_MAX_USES),
    fixedExpiryHours: optionalPositiveNumberFromEnv('FORMS_MAGICLINK_EXPIRY_HOURS'),
    applicationName: process.env.FORMS_MAGICLINK_APPLICATION?.trim() || DEFAULT_APPLICATION,
    roleName: process.env.FORMS_MAGICLINK_ROLE?.trim() || DEFAULT_ROLE,
  });
  return cached;
}

/** Test-only: clear the memoized config so env changes take effect. */
export function resetMagicLinkProvisioningConfigForTests(): void {
  cached = undefined;
}
