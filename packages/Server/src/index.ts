/**
 * Forms Server Bootstrap
 *
 * Server-side bootstrap package for the Forms Open App.
 * Ensures all entity subclasses, action subclasses, and GraphQL resolvers
 * are registered with the MJ class factory.
 */

// Import entity and action packages to trigger @RegisterClass decorators
import '@mj-biz-apps/forms-entities';
import '@mj-biz-apps/forms-actions';

// Import server-side entity subclasses (lifecycle hooks / hardening) to trigger @RegisterClass
import { MagicLinkMinterRegistry } from '@mj-biz-apps/forms-core-entities-server';

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

// WP-B: import the custom public-submit resolver so its TypeGraphQL metadata is registered.
import './public-submit/PublicFormResolver.js';

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

/** Absolute paths to the generated resolver files, for use with createMJServer() */
export const RESOLVER_PATHS = [resolve(__dirname, 'generated/generated.{js,ts}')];
// WP-B (public submit endpoint): custom anonymous resolvers, discovered via the *Resolver glob.
RESOLVER_PATHS.push(resolve(__dirname, 'public-submit/*Resolver.{js,ts}'));

/**
 * Bootstrap function called by DynamicPackageLoader during MJAPI startup.
 * The static imports above handle all registration; this function ensures
 * the module is fully evaluated.
 */
export function LoadBizAppsFormsServer(): void {
    // Static imports above ensure all classes are registered. Register the concrete
    // magic-link minter so the FormDistribution hook can provision anonymous links.
    // Idempotent: re-registering simply replaces the instance.
    MagicLinkMinterRegistry.Instance.Register(new MagicLinkInviteMinter());
}
