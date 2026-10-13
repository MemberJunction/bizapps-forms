/**
 * @mj-biz-apps/forms-core-entities-server
 *
 * The server-side domain layer of MJ Forms (spec #303 §1):
 *  - entity server subclasses — invariants that hold for every writer (builder, AI action, engine,
 *    import, `MJ.SaveEntityGraph`, direct API), registered over the generated classes;
 *  - engines (`engines/`) — the domain operations, each one transaction: publishing, authoring;
 *  - Remote Operation server subclasses (`operations/`) — thin typed wrappers over one engine call
 *    each, registered under their `Forms.<Name>` keys;
 *  - the helpers both `forms-actions` and `forms-server` run: the per-response context loader, the
 *    entity-binding executor/ledger/gateway, and the action-provider seam.
 *
 * Import this package from the server bootstrap AFTER `@mj-biz-apps/forms-entities`, so these
 * subclasses register after the generated ones they extend; call
 * {@link LoadFormsEntityServerSubclasses} and each operation's `Load…Operation()` anchor from the
 * startup export so a bundler cannot drop them.
 *
 * Test support is at `@mj-biz-apps/forms-core-entities-server/testing` and is deliberately NOT
 * reachable from this entry.
 */
import { FormDistributionEntityServer } from './magic-link/FormDistributionEntityServer.js';
import { FormEntityServer } from './entities/FormEntityServer.js';
import { FormVersionEntityServer } from './entities/FormVersionEntityServer.js';
import { FormQuestionEntityServer } from './entities/FormQuestionEntityServer.js';

/** The entity server subclasses this package registers — referenced so their decorators run. */
const FORMS_ENTITY_SERVER_SUBCLASSES = [
  FormDistributionEntityServer,
  FormEntityServer,
  FormVersionEntityServer,
  FormQuestionEntityServer,
] as const;

/**
 * Anti-tree-shake anchor for the subclasses above. The registration itself happens when this
 * module is imported (each class's `@RegisterClass`); calling this from `LoadBizAppsFormsServer()`
 * keeps a bundler from proving the import dead. Returns how many classes it holds.
 */
export function LoadFormsEntityServerSubclasses(): number {
  return FORMS_ENTITY_SERVER_SUBCLASSES.length;
}

// The minting seam (interface + registry) and provisioning config/decisions —
// re-exported so the host bootstrap (`@mj-biz-apps/forms-server`) can register a
// concrete minter, and so tests can drive the pure decision logic.
export {
  MagicLinkMinterRegistry,
  type IAnonymousMagicLinkMinter,
  type MintAnonymousInviteParams,
  type MintAnonymousInviteResult,
  type InviteWriteHost,
  type InviteWriteResult,
  type InviteExpiryBounds,
  type AnonymousCredentialRef,
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
  type ProvisioningReason,
} from './magic-link/provisioning-decision.js';
export {
  runProvisioning,
  DISTRIBUTION_ENTITY_NAME,
  type ProvisionContext,
  type ProvisionOutcome,
  type MintedLink,
  type PersistCredential,
} from './magic-link/provision-runner.js';
export { FormDistributionEntityServer, FormEntityServer, FormVersionEntityServer, FormQuestionEntityServer };
export { FORM_ENTITY_NAME } from './entities/FormEntityServer.js';
export { FORM_VERSION_ENTITY_NAME } from './entities/FormVersionEntityServer.js';
export { FORM_QUESTION_ENTITY_NAME } from './entities/FormQuestionEntityServer.js';
export {
  formStatusViolations,
  needsPublishedVersionCheck,
  closesForm,
  type FormStatus,
  type FormStatusWrite,
} from './entities/form-status-rules.js';
export {
  formVersionWriteViolations,
  formVersionDeleteRefusal,
  FROZEN_VERSION_FIELDS,
  type FormVersionStatus,
  type FormVersionWrite,
} from './entities/form-version-rules.js';
export type { RuleViolation } from './entities/entity-refusal.js';

// Shared action/server helpers (moved from forms-actions, spec #303 §1).
export * from './shared/action-provider.js';
export * from './shared/form-response-context.js';
export * from './shared/save-entity.js';
export * from './binding/binding-executor.js';
export * from './binding/binding-ledger.js';
export * from './binding/mj-binding-gateway.js';

// Engines (spec #303 §4).
export {
  FormPublishingEngine,
  FormPublishError,
  PUBLISH_IN_PROGRESS_MESSAGE,
  type FormPublishResult,
} from './engines/FormPublishingEngine.js';
export {
  FormAuthoringEngine,
  FormAuthoringError,
  type BuildFromBlueprintOptions,
  type BuiltForm,
} from './engines/FormAuthoringEngine.js';
export { requireDatabaseProvider } from './shared/database-provider.js';
export { FORMS_ENTITY } from './shared/entity-names.js';

// Remote Operation server subclasses (spec #303 §2) and the authoring rule they share.
export { PublishFormServerOperation, LoadPublishFormOperation } from './operations/PublishFormServerOperation.js';
export {
  authorizeFormAuthoring,
  formAuthoringRefusal,
  refuseFormAuthoring,
  type FormPermissionSource,
} from './operations/form-authoring-authorization.js';
