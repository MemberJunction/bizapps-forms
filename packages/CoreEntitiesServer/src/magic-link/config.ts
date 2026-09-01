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
 *  - `FORMS_MAGICLINK_EXPIRY_HOURS`  A host-wide CEILING (hours) on how long a minted
 *                                 credential may live, resolved from the instant it was
 *                                 issued. It does NOT replace the link's own `CloseAt`:
 *                                 `resolveExpiry` takes the EARLIER of the two, so whichever
 *                                 bound comes first ends the credential. Unset (default) =
 *                                 no host ceiling, and `CloseAt` alone bounds it. Setting
 *                                 this used to win outright, which let a 30-day ceiling keep
 *                                 a credential alive for a link that shut on Friday.
 *  - `FORMS_MAGICLINK_APPLICATION`   Application name the anonymous session is scoped to.
 *                                 Default `Forms` (the app WP-A seeds).
 *  - `FORMS_MAGICLINK_ROLE`       Restricted role the invite grants. Default
 *                                 `Form Respondent` (the role WP-A seeds). Must be
 *                                 magic-link grantable on the host — i.e. accepted by core's
 *                                 `isRoleGrantable`, which allows a role listed in
 *                                 `magicLink.grantableRoleNames` OR one equal to
 *                                 `magicLink.restrictedRoleName`, matched case- and
 *                                 whitespace-insensitively. It does NOT have to equal
 *                                 core's `magicLink.restrictedRoleName`: that global is only
 *                                 the default for invites naming no role, and every invite
 *                                 this minter issues names one. `checkRespondentReadiness`
 *                                 reads this same value, so the boot-time readiness verdict
 *                                 is about the role that will actually be minted.
 */

import type { mjBizAppsFormsFormDistributionEntityType } from '@mj-biz-apps/forms-entities';

/**
 * A `ChannelType` value on `FormDistribution`.
 *
 * DERIVED from the generated entity, never re-typed. The union is CodeGen's projection of the
 * column's CHECK constraint, so a migration that widens the constraint widens this on the next
 * run — where a hand-written copy would silently stay narrow, and `linkableChannels.has(...)`
 * would classify the new value as not-linkable and revoke every such link's credential with no
 * compile-time signal. `import type` is erased at build time, so this costs no runtime dependency.
 */
export type DistributionChannelType = mjBizAppsFormsFormDistributionEntityType['ChannelType'];

/** Frozen, validated configuration for distribution magic-link provisioning. */
export interface MagicLinkProvisioningConfig {
  /** Channel types that receive a minted anonymous link. */
  linkableChannels: ReadonlySet<DistributionChannelType>;
  /** Default `maxUses` for the minted invite. */
  defaultMaxUses: number;
  /** Host-wide lifetime ceiling in hours, or `undefined` for none. Combined with the link's
   *  `CloseAt` by taking the earlier of the two — never instead of it. */
  fixedExpiryHours: number | undefined;
  /** Application name the anonymous session is scoped to. */
  applicationName: string;
  /** Restricted role the invite grants. */
  roleName: string;
}

const ALL_CHANNELS: readonly DistributionChannelType[] = ['Email', 'Embed', 'PublicLink', 'QR'];
const DEFAULT_CHANNELS: readonly DistributionChannelType[] = ['PublicLink', 'Embed', 'QR'];

/**
 * Default `maxUses` — effectively unlimited, and deliberately so.
 *
 * bizapps-forms#104 called a million out as "no limit dressed as a limit", and it is;
 * this is the reasoning for keeping it rather than the absence of any. A redemption is
 * one respondent OPENING the link, not one submission — a person who opens the form,
 * abandons it and comes back tomorrow spends two — so this is not a quota and cannot be
 * made into one. The real quota is the distribution's own `MaxResponses`, enforced at
 * submit and surfaced in the builder as a meter with a fix beside it.
 *
 * A lower cap would therefore not limit responses; it would lock respondents out of a
 * popular form with no signal anywhere that it had happened, since nothing on the
 * distribution reflects the invite's use count. The credential's real bound is now its
 * lifecycle — revoked when the link stops being live, expiring with the link's closing
 * date — which is what makes an unbounded use count safe. A host that wants a hard
 * ceiling anyway sets `FORMS_MAGICLINK_MAX_USES`.
 */
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
