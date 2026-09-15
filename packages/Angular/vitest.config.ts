import { defineConfig } from 'vitest/config';

/**
 * Vitest config for the forms-ng package. Covers all pure (Angular-free) logic
 * across widget, dashboard, and builder (runtime/validation/theming, reporting
 * aggregations, snapshot builder, JSON field codecs, question-type catalog,
 * distribution-link helpers, QR encoder). Angular component classes are mostly not
 * unit-tested here; they're exercised by the Explorer ngc build (strictTemplates),
 * and where only their wiring matters a spec reads their source instead.
 *
 * The exception, and what it costs: a component with no constructor injection can be
 * instantiated in this node environment, which is the only way to assert something a
 * component does NOT do — `validation-rule-editor.spec.ts` is about an emission that
 * must not happen, and a source-level guard would prove the guard exists rather than
 * that nothing gets out. Such a spec must `import '@angular/compiler'` for its side
 * effect: `@angular/common` ships partially-compiled injectables that need the JIT
 * compiler present to finish at import time, and without it the import throws.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    globals: true,
  },
});
