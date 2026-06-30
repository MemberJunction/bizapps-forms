/**
 * Bundles the `<mj-form>` custom element into a single, self-contained, browser-loadable
 * file (DG-5).
 *
 * Pipeline: `npm run build` (ngc) AOT-compiles the widget to `dist/widget-entry.js` (templates
 * + styles inlined, no JIT needed). This script then bundles that compiled entry — together
 * with the Angular runtime it imports (`@angular/core`, `@angular/platform-browser`, …) — into
 * one IIFE at `dist/widget/mj-form.js`. Loading that file in a browser self-registers
 * `<mj-form>` (the entry calls `registerMjFormElement()` at import time), so the respondent
 * host page's `customElements.whenDefined('mj-form')` resolves.
 *
 * The published `@angular/*` packages ship as PARTIALLY-compiled libraries (`ɵɵngDeclare*`).
 * Bundling them directly leaves runtime "JIT compiler unavailable" errors because esbuild does
 * not run the Angular Linker. We therefore run the linker (via `@angular/compiler-cli`'s babel
 * plugin) over every module as an esbuild `onLoad` step, converting partial declarations to
 * full AOT so no JIT compiler is needed at runtime.
 *
 * Run AFTER `npm run build` — it consumes ngc output, it does not compile TypeScript itself.
 */
import { build } from 'esbuild';
import { transformAsync } from '@babel/core';
import linkerPlugin from '@angular/compiler-cli/linker/babel';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, '..');
const entryPoint = resolve(packageRoot, 'dist/widget-entry.js');
const outFile = resolve(packageRoot, 'dist/widget/mj-form.js');

if (!existsSync(entryPoint)) {
  console.error(
    `[build:widget] Compiled entry not found at ${entryPoint}. ` +
      `Run "npm run build" (ngc) first — build:widget bundles ngc output, it does not compile.`,
  );
  process.exit(1);
}

/**
 * esbuild plugin: run the Angular Linker over partially-compiled Angular packages so their
 * `ɵɵngDeclare*` declarations become full AOT (no runtime JIT compiler needed). Only `.mjs`/
 * fesm files in `@angular` carry partial declarations, so we scope the transform to those to
 * keep the build fast.
 */
const angularLinker = {
  name: 'angular-linker',
  setup(buildApi) {
    buildApi.onLoad({ filter: /\/@angular\/.*\.m?js$/ }, async (args) => {
      const source = readFileSync(args.path, 'utf8');
      if (!source.includes('ngDeclare')) {
        return { contents: source, loader: 'js' };
      }
      const result = await transformAsync(source, {
        filename: args.path,
        configFile: false,
        babelrc: false,
        compact: false,
        sourceMaps: false,
        plugins: [linkerPlugin.default ?? linkerPlugin],
      });
      return { contents: result?.code ?? source, loader: 'js' };
    });
  },
};

const result = await build({
  entryPoints: [entryPoint],
  outfile: outFile,
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  // The widget runs zoneless (Angular 21 default — signals + OnPush, no zone.js import).
  minify: true,
  sourcemap: true,
  legalComments: 'none',
  // Strip Angular's framework-internal dev guards; keeps the bundle production-lean.
  define: { ngDevMode: 'false', ngJitMode: 'false' },
  plugins: [angularLinker],
  metafile: true,
  logLevel: 'info',
});

const out = result.metafile.outputs['dist/widget/mj-form.js'];
const bytes = out ? out.bytes : 0;
console.log(`[build:widget] Bundled <mj-form> → ${outFile} (${(bytes / 1024).toFixed(1)} kB)`);
