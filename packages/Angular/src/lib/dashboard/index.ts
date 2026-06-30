/**
 * Forms reporting dashboard (WP-F) public surface.
 *
 * Importing this barrel triggers the `@RegisterClass(BaseDashboard,
 * 'FormsReportingDashboard')` decorator on the dashboard component, making it
 * resolvable by the MJ ClassFactory from the Dashboard metadata's DriverClass.
 */
export * from './models/reporting.model';
export * from './services/reporting-aggregations';
export * from './services/forms-reporting.service';
export * from './services/forms-reporting-export.service';
export * from './components/summary-stats.component';
export * from './components/question-breakdown.component';
export * from './components/distribution-chart.component';
export * from './components/funnel-chart.component';
export * from './components/response-list.component';
export * from './components/response-detail.component';
export * from './forms-reporting-dashboard.component';
