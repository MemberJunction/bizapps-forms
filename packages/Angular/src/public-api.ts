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

// Individual-response surface: the side-effect import fires
// @RegisterClass(BaseFormComponent, 'MJ_BizApps_Forms: Form Responses', 10), which overrides the
// generated Form Response property grid with the rich detail view everywhere a response opens.
import './lib/responses';

// WP-F (reporting dashboard): side-effect import fires @RegisterClass(BaseDashboard, 'FormsReportingDashboard')
import './lib/dashboard';

// Re-export for consumers
export { CLASS_REGISTRATIONS } from './lib/generated/class-registrations-manifest';
export { GeneratedFormsModule } from './lib/generated/generated-forms.module';

// Cross-area primitives (entity-name table, answer-value helpers) — FORMS_ENTITY used to be
// exported from './lib/builder'; it moved here when the responses surface began sharing it.
export * from './lib/shared';

// Individual-response surface (list + detail + data service), shared by all three mounts.
export * from './lib/responses';

// WP-F (reporting dashboard) public surface
export * from './lib/dashboard';

/**
 * Bootstrap function called during MJExplorer initialization.
 * Static imports above handle all registration.
 */
export function LoadBizAppsFormsClient(): void {
    // Static imports ensure all classes are registered.
}

// WP-C — respondent widget (<mj-form> custom element + S1 API seam + runtime)
export * from './lib/widget/index';
// WP-D builder — registers the Forms form-component override (visual builder) + re-exports.
export * from './lib/builder';
// Reusable form templates — gallery + deep copy, mounted by both home and the builder.
export * from './lib/templates';
// Forms home/studio dashboard — the first-class "Forms" Explorer surface (plan §3.2).
import './lib/home';
export * from './lib/home';
