/**
 * Forms home/studio surface public barrel.
 *
 * Importing this barrel triggers the
 * `@RegisterClass(BaseDashboard, 'FormsHomeDashboard')` decorator on the
 * dashboard component, making it resolvable by the MJ ClassFactory from the
 * `MJ: Dashboards` metadata record's DriverClass.
 */
export * from './home-models';
export * from './home-aggregations';
export * from './forms-home.service';
export * from './forms-home-dashboard.component';
