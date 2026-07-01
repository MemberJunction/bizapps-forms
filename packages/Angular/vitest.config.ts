import { defineConfig } from 'vitest/config';

/**
 * Vitest config for the forms-ng package. Covers all pure (Angular-free) logic
 * across widget, dashboard, and builder (runtime/validation/theming, reporting
 * aggregations, snapshot builder, JSON field codecs, question-type catalog,
 * distribution-link helpers, QR encoder). Angular component classes are not
 * unit-tested here; they're exercised by the Explorer ngc build (strictTemplates).
 */
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    globals: true,
  },
});
