import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards the WIRING of the Person "Forms" section (#285).
 *
 * Structural on purpose, for the same reason as `responses/registration.spec.ts`: the panel only
 * appears if its `@RegisterClassEx` decorator runs at bootstrap, which needs a side-effect import
 * from `public-api.ts` that nothing in the type system notices going missing. The failure is
 * silent — Explorer simply keeps MJ's generic Form Responses grid. Angular components cannot be
 * instantiated in this node suite (ng-base-forms needs the Angular Linker); ngc with
 * strictTemplates is what type-checks the templates, and this is what checks they stay wired.
 * The pure behaviour (filter, row mapping, registration metadata) is covered by
 * `person-form-responses.model.spec.ts`.
 */
const AREA = join(__dirname);
const SRC = join(__dirname, '..', '..');

function read(...parts: string[]): string {
  return readFileSync(join(...parts), 'utf8');
}

const panel = (): string => read(AREA, 'person-form-responses.panel.ts');
const list = (): string => read(AREA, 'person-form-responses-list.component.ts');

describe('Person Forms panel wiring', () => {
  it('registers as a BaseFormPanel with the model registration metadata', () => {
    expect(panel()).toMatch(
      /@RegisterClassEx\(\s*BaseFormPanel,\s*\{[^}]*metadata:\s*PERSON_FORMS_REGISTRATION/,
    );
  });

  it('mounts the list only for a saved record whose section is expanded', () => {
    // Lazy by design: a collapsed section must not run the query.
    expect(panel()).toMatch(
      /@if\s*\(\s*Record\.IsSaved\s*&&\s*FormComponent\.IsSectionExpanded\(SectionKey\)\s*\)/,
    );
  });

  it('reports the loaded row count to the section badge', () => {
    expect(panel()).toContain('this.FormComponent.SetSectionRowCount(this.SectionKey');
  });

  it('opens a response through the host form navigation, by the FORMS_ENTITY name', () => {
    expect(panel()).toMatch(
      /OnFormNavigate\(\{\s*Kind: 'record',\s*EntityName: FORMS_ENTITY\.FormResponse/,
    );
  });

  it('loads through the model filter as a read-only simple view, and logs a failure', () => {
    const source = list();
    expect(source).toContain('BuildPersonFormResponsesFilter(this.PersonID)');
    expect(source).toContain("ResultType: 'simple'");
    expect(source).toContain('LogError(');
  });

  it('names the entity from the FORMS_ENTITY table rather than a string literal', () => {
    expect(panel()).not.toContain("'MJ_BizApps_Forms: Form Responses'");
    expect(list()).not.toContain("'MJ_BizApps_Forms: Form Responses'");
  });

  it('is side-effect imported by public-api, so bootstrap runs the decorator', () => {
    // Anchored: a commented-out import must not satisfy this.
    expect(read(SRC, 'public-api.ts')).toMatch(
      /^import '\.\/lib\/form-panels\/person-form-responses\.panel';$/m,
    );
  });
});
