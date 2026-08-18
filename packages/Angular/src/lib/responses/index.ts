/**
 * The individual-response surface — one list + one detail view, mounted three ways:
 * the reporting dashboard's Responses tab, the builder's Responses tab, and the
 * `MJ_BizApps_Forms: Form Responses` entity-form override.
 *
 * Importing this barrel triggers the `@RegisterClass(BaseFormComponent,
 * 'MJ_BizApps_Forms: Form Responses', 10)` decorator on the override component, which is
 * how a Form Response opened anywhere in Explorer gets the rich view instead of the
 * generated property grid. `public-api.ts` side-effect-imports it for that reason — drop
 * that import and the registration silently disappears.
 */
export * from './response-models';
export * from './response-aggregations';
export * from './responses-data.service';
export * from './response-list.component';
export * from './response-detail.component';
