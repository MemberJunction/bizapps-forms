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
import '@mj-biz-apps/forms-core-entities-server';

// Import generated GraphQL resolvers
import './generated/generated.js';

// WP-B: import the custom public-submit resolver so its TypeGraphQL metadata is registered.
import './public-submit/PublicFormResolver.js';

// Import generated class registrations manifest
import { CLASS_REGISTRATIONS } from './generated/class-registrations-manifest.js';

// Re-export the manifest for consumers
export { CLASS_REGISTRATIONS } from './generated/class-registrations-manifest.js';

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

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
    // Static imports above ensure all classes are registered.
}
