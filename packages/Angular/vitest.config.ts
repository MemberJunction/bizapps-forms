import { defineConfig } from 'vitest/config';

/**
 * Vitest config for the forms-ng package. Targets the pure-logic builder modules
 * (snapshot builder, JSON field codecs, question-type catalog, distribution-link
 * helpers, QR encoder) — none of which need Angular TestBed or a DOM. Component
 * classes are intentionally NOT unit-tested here; their behaviour is covered by the
 * pure services they delegate to.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/lib/builder/**/*.spec.ts'],
    globals: false,
  },
});
