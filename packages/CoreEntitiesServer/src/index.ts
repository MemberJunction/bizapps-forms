/**
 * @mj-biz-apps/forms-core-entities-server
 *
 * The server-side domain layer of MJ Forms (spec #303 §1):
 *  - entity server subclasses — invariants that hold for every writer (builder, AI action, engine,
 *    import, `MJ.SaveEntityGraph`, direct API), registered over the generated classes;
 *  - engines (`engines/`) — the domain operations, each one transaction: publishing, authoring
 *    (build, clone, create from template, archive, restore), share links, and automations (editing
 *    the steps; running them for a response);
 *  - the `Forms.RunAutomations` work-queue handler (`work-queue/`) and the `forms.response-submitted`
 *    message contract its publisher shares;
 *  - Remote Operation server subclasses (`operations/`) — thin typed wrappers over one engine call
 *    each, registered under their `Forms.<Name>` keys;
 *  - the helpers both `forms-actions` and `forms-server` run: the per-response context loader, the
 *    entity-binding executor/ledger/gateway, and the action-provider seam.
 *
 * Import this package from the server bootstrap AFTER `@mj-biz-apps/forms-entities`, so these
 * subclasses register after the generated ones they extend; call
 * {@link LoadFormsEntityServerSubclasses}, each operation's `Load…Operation()` anchor,
 * `LoadRunAutomationsHandler()` and `LoadFormsWorkQueue()` from the startup export so a bundler
 * cannot drop them.
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
  DISTRIBUTION_CHANNEL_TYPES,
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

// Shared action/server helpers (moved from forms-actions and forms-server, spec #303 §1).
export * from './shared/action-provider.js';
export * from './shared/isolated-provider.js';
export { parsePublishedDefinition } from './shared/snapshot-parser.js';
export * from './uploads/upload-provenance.js';
export * from './file-links/file-links.js';
export * from './file-links/mj-file-link-gateway.js';
export { AUTOMATION_PRINCIPAL_ENV, DEFAULT_AUTOMATION_PRINCIPAL, resolveAutomationPrincipal } from './automation/service-principal.js';
export { ALLOWED_BINDING_ENTITIES_ENV, allowedBindingEntities } from './automation/allowed-entities.js';
export { runLegacyOnSubmitHooks, type LegacyHookContext, type LegacyHookResult } from './automation/legacy-hooks.js';
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
  type BuildFromBlueprintOptions,
  type BuiltForm,
  type CloneFormOptions,
  type FormFromTemplate,
  type FormLifecycleResult,
  type TemplateSource,
} from './engines/FormAuthoringEngine.js';
export {
  FormDistributionEngine,
  FormDistributionError,
  DEFAULT_CHANNEL,
  MAX_SLUG_ATTEMPTS,
  type DistributionLink,
  type IssueLinkRequest,
} from './engines/FormDistributionEngine.js';
// The claim protocol consumer apps implement (`docs/distribution-claims.md`); the types are Forms'
// own — a consumer re-declares the shapes it needs rather than importing them.
export {
  DISTRIBUTION_CLAIM_PROVIDERS_KEY,
  type ClaimFailure,
  type ClaimLookup,
  type DistributionClaim,
  type DistributionClaimProvider,
} from './distribution-claims/claim-contract.js';
export {
  FormAutomationEngine,
  FormAutomationError,
  type ResponseAutomationReport,
  type ResponseAutomationRequest,
} from './engines/FormAutomationEngine.js';
export type { AutomationRunResult, AutomationRunStatus } from './automation/automation-runner.js';
export { EngineTransactionFailure } from './engines/engine-guards.js';
export { FormAuthoringError } from './engines/authoring-errors.js';
export type { ClonedForm } from './engines/form-clone.js';
export { STARTER_TEMPLATES, getStarterTemplate, type StarterTemplate } from './engines/starter-templates.js';
export { requireDatabaseProvider } from './shared/database-provider.js';
export { FORMS_ENTITY } from './shared/entity-names.js';

// Remote Operation server subclasses (spec #303 §2) and the authoring rule they share.
export { PublishFormServerOperation, LoadPublishFormOperation } from './operations/PublishFormServerOperation.js';
export { CloneFormServerOperation, LoadCloneFormOperation } from './operations/CloneFormServerOperation.js';
export {
  CreateFormFromTemplateServerOperation,
  LoadCreateFormFromTemplateOperation,
} from './operations/CreateFormFromTemplateServerOperation.js';
export { ArchiveFormServerOperation, LoadArchiveFormOperation } from './operations/ArchiveFormServerOperation.js';
export { RestoreFormServerOperation, LoadRestoreFormOperation } from './operations/RestoreFormServerOperation.js';
export {
  IssueDistributionLinkServerOperation,
  LoadIssueDistributionLinkOperation,
} from './operations/IssueDistributionLinkServerOperation.js';
export {
  ReissueDistributionLinkServerOperation,
  LoadReissueDistributionLinkOperation,
} from './operations/ReissueDistributionLinkServerOperation.js';
export { OpenDistributionServerOperation, LoadOpenDistributionOperation } from './operations/OpenDistributionServerOperation.js';
export { CloseDistributionServerOperation, LoadCloseDistributionOperation } from './operations/CloseDistributionServerOperation.js';
export {
  GetDistributionClaimsServerOperation,
  LoadGetDistributionClaimsOperation,
} from './operations/GetDistributionClaimsServerOperation.js';
export { SaveAutomationServerOperation, LoadSaveAutomationOperation } from './operations/SaveAutomationServerOperation.js';
export {
  ReorderAutomationsServerOperation,
  LoadReorderAutomationsOperation,
} from './operations/ReorderAutomationsServerOperation.js';
export { RemoveAutomationServerOperation, LoadRemoveAutomationOperation } from './operations/RemoveAutomationServerOperation.js';

// The work-queue outbox (spec #303 §5): the message contract both ends share, the handler, and the
// engine configuration a publishing host needs.
export * from './work-queue/response-submitted.js';
export { RunAutomationsHandler, LoadRunAutomationsHandler } from './work-queue/RunAutomationsHandler.js';
export { configureFormsWorkQueue, FormsWorkQueueStartup, LoadFormsWorkQueue } from './work-queue/forms-work-queue.js';

export {
  authorizeDistributionAuthoring,
  authorizeFormAuthoring,
  distributionAuthoringRefusal,
  formAuthoringRefusal,
  refuseFormAuthoring,
  type DistributionRight,
  type FormPermissionSource,
} from './operations/form-authoring-authorization.js';
