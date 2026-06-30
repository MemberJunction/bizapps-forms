import { defineConfig } from 'vitest/config';

/**
 * Vitest config for the forms-ng package.
 *
 * Scoped to pure (Angular-free) logic — currently the reporting-dashboard
 * aggregation helpers. The Angular components themselves are exercised by the
 * Explorer build (ngc strictTemplates) rather than unit tests here.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    globals: true,
  },
});
