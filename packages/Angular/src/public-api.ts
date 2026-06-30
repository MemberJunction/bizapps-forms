/**
 * Forms Angular Bootstrap
 *
 * Client-side bootstrap package for the Forms Open App.
 * Imports all entity classes and form components to ensure @RegisterClass
 * decorators fire and components are available to MJ's class factory.
 */

// Import entity package to trigger @RegisterClass decorators for entity subclasses
import '@mj-biz-apps/forms-entities';

// Import generated form components (triggers @RegisterClass for form components)
import './lib/generated/generated-forms.module';

// Import class registrations manifest
import { CLASS_REGISTRATIONS } from './lib/generated/class-registrations-manifest';

// WP-F (reporting dashboard): side-effect import fires @RegisterClass(BaseDashboard, 'FormsReportingDashboard')
import './lib/dashboard';

// Re-export for consumers
export { CLASS_REGISTRATIONS } from './lib/generated/class-registrations-manifest';
export { GeneratedFormsModule } from './lib/generated/generated-forms.module';

// WP-F (reporting dashboard) public surface
export * from './lib/dashboard';

/**
 * Bootstrap function called during MJExplorer initialization.
 * Static imports above handle all registration.
 */
export function LoadBizAppsFormsClient(): void {
    // Static imports ensure all classes are registered.
}

// WP-D builder — registers the Forms form-component override (visual builder) + re-exports.
export * from './lib/builder';
