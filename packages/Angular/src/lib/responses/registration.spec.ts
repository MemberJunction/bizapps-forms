import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards the registration CHAIN for the Form Response entity-form override.
 *
 * This is a structural test, and deliberately so. The override only takes effect if a
 * `@RegisterClass` decorator runs at bootstrap, which requires the module to be reached by
 * a side-effect import from `public-api.ts` — a chain that is invisible to the type system
 * and that tree-shaking or a tidy-up of "unused" imports can silently break. The failure
 * mode is not a crash: Explorer quietly falls back to the generated property grid, and
 * nobody notices until someone opens a response and sees raw columns.
 *
 * A runtime assertion (`ClassFactory.GetRegistration`) would be stronger, but Angular
 * component classes cannot be instantiated in this suite — importing
 * `@memberjunction/ng-base-forms` in the node environment fails on the Angular Linker, and
 * the package's vitest config says as much. The ngc build is what type-checks these
 * components; this is what checks they are still wired in.
 */
const AREA = join(__dirname);
const SRC = join(__dirname, '..', '..');

function read(...parts: string[]): string {
  return readFileSync(join(...parts), 'utf8');
}

describe('Form Response entity-form override registration', () => {
  it('registers against BaseFormComponent for the Form Responses entity at priority 10', () => {
    const source = read(AREA, 'response-form.component.ts');
    // Priority 10 is what outranks the CodeGen-generated form, same as the builder's Forms override.
    expect(source).toMatch(
      /@RegisterClass\(\s*BaseFormComponent,\s*FORMS_ENTITY\.FormResponse,\s*10\s*\)/,
    );
  });

  it('names the entity from the FORMS_ENTITY table rather than a string literal', () => {
    expect(read(AREA, 'response-form.component.ts')).not.toContain(
      "'MJ_BizApps_Forms: Form Responses'",
    );
  });

  it('is reachable from the responses barrel, so importing the barrel runs the decorator', () => {
    // Anchored to line start: a commented-out export must not satisfy this.
    expect(read(AREA, 'index.ts')).toMatch(
      /^export \* from '\.\/response-form\.component';$/m,
    );
  });

  it('has its barrel side-effect imported by public-api, so bootstrap runs the decorator', () => {
    // The bare `import './lib/responses';` is the load-bearing line — `export * from` alone
    // is elidable by a bundler that sees no value imported from it. Anchored to line start
    // so commenting the import out fails this test rather than still matching inside `//`.
    expect(read(SRC, 'public-api.ts')).toMatch(/^import '\.\/lib\/responses';$/m);
  });
});
