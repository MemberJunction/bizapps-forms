/**
 * Forms Server Bootstrap
 *
 * Server-side bootstrap package for the Forms Open App.
 * Ensures all entity subclasses, action subclasses, and GraphQL resolvers
 * are registered with the MJ class factory.
 */

// Import entity and action packages to trigger @RegisterClass decorators. Order matters:
// forms-entities FIRST, so the generated entity classes register before the server subclasses in
// forms-core-entities-server that extend them (MJ's ClassFactory takes the LAST registration for a
// key). forms-actions imports forms-core-entities-server itself, so it is loaded by then either way.
import '@mj-biz-apps/forms-entities';
import '@mj-biz-apps/forms-actions';

// Server-side entity subclasses (invariants for every writer) and Remote Operation server subclasses
// (`Forms.<Name>`) — importing registers them. The operations register over the CodeGen-emitted
// bases in forms-entities, which is one more reason that package must load first.
import {
  LoadArchiveFormOperation,
  LoadCloneFormOperation,
  LoadCloseDistributionOperation,
  LoadCreateFormFromTemplateOperation,
  LoadDeleteTemplateOperation,
  LoadFormsEntityServerSubclasses,
  LoadGetDistributionClaimsOperation,
  LoadGetRespondentFormOperation,
  LoadGetResponseDetailOperation,
  LoadGetResponseSummaryOperation,
  LoadIssueDistributionLinkOperation,
  LoadListResponsesOperation,
  LoadOpenDistributionOperation,
  LoadPublishFormOperation,
  LoadReissueDistributionLinkOperation,
  LoadRemoveAutomationOperation,
  LoadReorderAutomationsOperation,
  LoadRestoreFormOperation,
  LoadFormsAutomationDrainDriver,
  LoadSaveAutomationOperation,
  LoadSaveResponseOperation,
  MagicLinkMinterRegistry,
} from '@mj-biz-apps/forms-core-entities-server';

// Concrete magic-link invite minter, registered into the entity-hook seam so the
// FormDistribution lifecycle hook can provision anonymous links via MJ core's
// magic-link tables without that lightweight package depending on @memberjunction/server.
import { MagicLinkInviteMinter } from './magic-link/MagicLinkInviteMinter.js';

// Import generated GraphQL resolvers
import './generated/generated.js';

// TASK 2: install the real CommunicationEngine-backed confirmation-email sender as the default,
// using the env-driven deployment config (which metadata CommunicationProvider + From address).
// Done here in the server package because the config is env-driven; the sender + seam live in
// forms-actions. Gracefully skips when unconfigured (never fails a submit).
import { installConfirmationEmailSender } from './confirmation-email/install-sender.js';
installConfirmationEmailSender();

// Import the request-identity middleware so its @RegisterClass fires and MJ server bootstrap
// mounts it PRE-AUTH. It establishes the server-derived caller identity (resolved peer IP, salted
// and hashed) that the public routes key their abuse ceilings on — without it those ceilings fall
// back to the client-settable `x-session-id`, which a caller can rotate to escape them.
import './http/RequestIdentityMiddleware.js';

// Deployment-default hardening: announce at EVERY boot, at error level, when the privacy hashes
// are running on the built-in PUBLIC salt (stored hashes then dictionary-recoverable), and refuse
// to boot at all when the deployment opted into FORMS_REQUIRE_SESSION_HASH_SALT=true. The
// first-use warning inside hash-salt.ts is easy to miss hours after startup; a boot line is not.
import { enforceSessionHashSaltAtBoot } from '@mj-biz-apps/forms-core-entities-server';
enforceSessionHashSaltAtBoot();

// Import the stacktrace-redaction middleware so its @RegisterClass fires and MJ server bootstrap
// merges its Apollo plugin. Apollo puts `extensions.stacktrace` — server paths, dependency versions
// — on every error unless NODE_ENV is production, and the anonymous session a public link mints is
// enough to request one; this keeps it off the wire whatever NODE_ENV says (#119).
import './http/StacktraceRedactionMiddleware.js';

// TASK 2: import the respondent host-page middleware so its @RegisterClass fires and MJ
// server bootstrap discovers the public /f/:slug route (anonymous, shell-free host page).
import './respondent-host/RespondentHostMiddleware.js';

// DG-5: import the widget-bundle middleware so its @RegisterClass fires and MJ server bootstrap
// discovers the public /forms/widget/mj-form.js route that serves the built <mj-form> element.
import './widget-bundle/WidgetBundleMiddleware.js';

// TASK 3: import the public file-upload middleware so its @RegisterClass fires and MJ server
// bootstrap discovers the POST /forms/upload route (anonymous magic-link scoped, stores bytes
// via MJ's configured file-storage provider into MJ: Files). Registered as POST-AUTH middleware
// so it reads the verified anonymous session; missing storage config yields a 5xx, never a crash.
import './upload/UploadMiddleware.js';

// Import the authoring-asset middleware so its @RegisterClass fires and MJ server bootstrap
// discovers BOTH its routes: POST /forms/asset (authenticated authors uploading form artwork)
// and GET /forms/asset/:id (anonymous, so a published form's images render for a respondent
// with no session). The read route serves ONLY objects stored under the public asset prefix.
import './asset/AssetMiddleware.js';

// Boot-time storage-account pin check (#290); registers no route, and is not gated on assets.
import './storage/StorageReadinessMiddleware.js';

// Import the response-file download middleware so its @RegisterClass fires and MJ server
// bootstrap discovers GET /forms/files/:fileId — an AUTHENTICATED reader downloading one
// respondent-uploaded answer. Mounted post-auth because identity is the guard here, unlike the
// asset read route beside it, whose guard is the public storage prefix.
import './download/DownloadMiddleware.js';

// Registers the development-only local-disk storage driver. Importing it is enough — the
// @RegisterClass decorator does the work — and the driver stays inert unless both
// FORMS_LOCAL_STORAGE_ROOT is set AND a FileStorageAccount points at its driver key, so a
// deployment that configures neither behaves exactly as it does without this import.
import './storage/LocalDiskFileStorage.js';

// Import generated class registrations manifest
import { CLASS_REGISTRATIONS } from './generated/class-registrations-manifest.js';

// Re-export the manifest for consumers
export { CLASS_REGISTRATIONS } from './generated/class-registrations-manifest.js';

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Register the concrete magic-link minter into the entity-hook seam at MODULE LOAD —
// exactly like the @RegisterClass side effects above. This must NOT live only inside
// LoadBizAppsFormsServer(): MJAPI wires this package by importing `RESOLVER_PATHS`
// (which triggers module evaluation) but does not necessarily call the startup export,
// so a registration stranded in that function never runs and the FormDistribution hook
// reports "no magic-link minter registered" (leaving PublicLinkToken null). Registering
// at import time makes provisioning work regardless. Idempotent: a re-register replaces.
MagicLinkMinterRegistry.Instance.Register(new MagicLinkInviteMinter());

/**
 * Absolute paths to the generated resolver files, for use with createMJServer(). Generated resolvers
 * ONLY (spec #303 §1): the respondent API that used to add `public-submit/*Resolver` here is now the
 * `Forms.GetRespondentForm` / `Forms.SaveResponse` Remote Operations, served by MJ's own
 * `ExecuteRemoteOperation` mutation — as `Forms.GetDistributionClaims` replaced #292's resolver.
 */
export const RESOLVER_PATHS = [resolve(__dirname, 'generated/generated.{js,ts}')];

/**
 * Bootstrap function called by DynamicPackageLoader during MJAPI startup.
 * The static imports above handle all registration; this function ensures
 * the module is fully evaluated.
 */
export function LoadBizAppsFormsServer(): void {
    // Static imports above ensure all classes are registered; these references keep a bundler from
    // dropping the entity server subclasses and the operation server subclasses as unused.
    LoadFormsEntityServerSubclasses();
    LoadPublishFormOperation();
    LoadCloneFormOperation();
    LoadCreateFormFromTemplateOperation();
    LoadArchiveFormOperation();
    LoadRestoreFormOperation();
    LoadDeleteTemplateOperation();
    LoadIssueDistributionLinkOperation();
    LoadReissueDistributionLinkOperation();
    LoadOpenDistributionOperation();
    LoadCloseDistributionOperation();
    LoadGetDistributionClaimsOperation();
    LoadSaveAutomationOperation();
    LoadReorderAutomationsOperation();
    LoadRemoveAutomationOperation();
    // The respondent operations (#303 Task 8): what an anonymous respondent loads, and every save.
    LoadGetRespondentFormOperation();
    LoadSaveResponseOperation();
    // Response reporting (#303 Task 9): the dashboard summary, the paged list and export, one response.
    LoadGetResponseSummaryOperation();
    LoadListResponsesOperation();
    LoadGetResponseDetailOperation();
    // The automation outbox sweep (#303): the scheduled-job driver the shipped Forms job names by
    // DriverClass. Kept from tree-shaking here; MJ's scheduler resolves it once the host is up.
    LoadFormsAutomationDrainDriver();
    // Register the concrete magic-link minter so the FormDistribution hook can provision anonymous
    // links. Idempotent: re-registering simply replaces the instance.
    MagicLinkMinterRegistry.Instance.Register(new MagicLinkInviteMinter());
}
