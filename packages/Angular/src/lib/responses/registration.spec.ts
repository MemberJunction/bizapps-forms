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
const BUILDER = join(__dirname, '..', 'builder');

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

/**
 * Guards the builder's Responses tab WIRING — the same structural technique and the same
 * reason as above: activating a tab is template behaviour, and an Angular component cannot
 * be instantiated in this suite to click it. What is checkable is that the tab exists, is
 * scoped to the loaded form, and is mounted behind its own `@if` (which is what makes the
 * responses query lazy rather than something every builder open pays for).
 */
describe('builder Responses tab wiring', () => {
  const component = () => readFileSync(join(BUILDER, 'form-builder.component.ts'), 'utf8');
  const template = () => readFileSync(join(BUILDER, 'form-builder.component.html'), 'utf8');

  it("adds 'responses' to BuilderTab, last, after 'automate'", () => {
    expect(component()).toMatch(
      /type BuilderTab = 'build' \| 'design' \| 'distribute' \| 'automate' \| 'responses';/,
    );
  });

  it('offers a tab button that activates it', () => {
    expect(template()).toContain(`(click)="setTab('responses')"`);
  });

  it('scopes the tab to the loaded form, not to every response in the database', () => {
    // Attributes may precede [FormID] (the pane carries a layout class), so this
    // matches anywhere inside the opening tag rather than immediately after the name —
    // while still refusing any binding other than the loaded form's ID.
    expect(template()).toMatch(/<mjf-responses-tab\b[^>]*\s\[FormID\]="tree\.form\.ID"/);
  });

  it('mounts it behind its own @if, so opening the builder to edit runs no responses query', () => {
    expect(template()).toContain("@if (activeTab === 'responses' && tree) {");
  });

  it('does not also render the Distribute panel underneath it', () => {
    // The body chain ended in a bare `@else`, which matched every tab that was not
    // build/design — so Responses (and Automate before it) rendered the distribution
    // manager stacked below, firing its queries and defeating the lazy-load entirely.
    expect(template()).toContain("} @else if (activeTab === 'distribute') {");
    expect(template()).not.toMatch(/\}\s*@else\s*\{\s*\n\s*<div class="fb-distribute">/);
  });

  it('relays the tab\'s deep links to the Explorer host', () => {
    expect(template()).toContain('(OpenRecord)="openLinkedRecord($event)"');
    expect(component()).toMatch(/this\.Navigate\.emit\(\{\s*Kind: 'record'/);
  });
});
