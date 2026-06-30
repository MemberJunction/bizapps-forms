/**
 * @mj-biz-apps/forms-core-entities-server
 *
 * Server-side entity subclasses for MJ Forms entities. These classes override
 * Save()/Delete()/ValidateAsync() to add lifecycle hooks (anonymous-submission
 * hardening, cross-record invariants, version snapshotting) that must run only
 * on the server.
 *
 * Import this package from the server bootstrap so its @RegisterClass decorators
 * fire at startup.
 */

// FormDistribution lifecycle hook: mints the anonymous magic-link invite when a
// public/anonymous distribution goes live (FORMS_BUILD_PLAN §4 item 4). The import
// triggers its @RegisterClass decorator so the class factory uses this subclass.
import './magic-link/FormDistributionEntityServer.js';

// The minting seam (interface + registry) and provisioning config/decisions —
// re-exported so the host bootstrap (`@mj-biz-apps/forms-server`) can register a
// concrete minter, and so tests can drive the pure decision logic.
export {
  MagicLinkMinterRegistry,
  type IAnonymousMagicLinkMinter,
  type MintAnonymousInviteParams,
  type MintAnonymousInviteResult,
} from './magic-link/minter.js';
export {
  getMagicLinkProvisioningConfig,
  resetMagicLinkProvisioningConfigForTests,
  type MagicLinkProvisioningConfig,
  type DistributionChannelType,
} from './magic-link/config.js';
export {
  decideProvisioning,
  resolveExpiry,
  type DistributionProvisioningState,
  type ProvisioningDecision,
} from './magic-link/provisioning-decision.js';
export {
  runProvisioning,
  DISTRIBUTION_ENTITY_NAME,
  type ProvisionContext,
  type ProvisionOutcome,
} from './magic-link/provision-runner.js';
export { FormDistributionEntityServer } from './magic-link/FormDistributionEntityServer.js';
