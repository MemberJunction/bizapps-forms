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

  it('mounts the list behind the unsaved branch and the expansion latch', () => {
    // Lazy until first expanded, then kept mounted; the latch itself is exercised for real as
    // SectionMountLatch in person-form-responses.model.spec.ts. This pins that the template uses it.
    expect(panel()).toMatch(
      /@if\s*\(\s*!Record\.IsSaved\s*\)\s*\{[\s\S]*?\}\s*@else if\s*\(\s*ListMounted\s*\)\s*\{\s*<mjf-person-form-responses-list/,
    );
  });

  it('feeds the mount latch the record, its saved state and the expansion on every check', () => {
    expect(panel()).toMatch(
      /ngDoCheck\(\): void \{\s*this\.mountLatch\.Observe\(this\.Record, this\.Record\.IsSaved, this\.FormComponent\.IsSectionExpanded\(this\.SectionKey\)\);/,
    );
    expect(panel()).toMatch(/get ListMounted\(\): boolean \{\s*return this\.mountLatch\.IsMounted\(\);/);
  });

  it('shows the row count in the section header (accordion layout reads BadgeCount)', () => {
    expect(panel()).toContain('[BadgeCount]="FormComponent.GetSectionRowCount(SectionKey)"');
  });

  it('pads the unsaved message off the card edge with tokens', () => {
    expect(panel()).toMatch(/\.pfr-unsaved\s*\{[^}]*padding:\s*var\(--mjf-gap\)\s+var\(--mjf-card-pad-sm\)/);
  });

  it('says why the section is empty on an unsaved record instead of rendering nothing', () => {
    expect(panel()).toMatch(/@if\s*\(\s*!Record\.IsSaved\s*\)/);
    expect(panel()).toContain('Save this person to see the forms they fill in.');
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

  it('offers a Retry button in the error state that re-runs the load', () => {
    expect(list()).toMatch(/<button[^>]*\(click\)="Retry\(\)"[^>]*>[\s\S]*?Retry[\s\S]*?<\/button>/);
  });

  it('gives the form-name button a minimum tap height from the tap token', () => {
    expect(list()).toMatch(/\.pfr-open\s*\{[^}]*min-height:\s*var\(--mjf-tap\)/);
  });

  it('pads the loading, error and empty states off the card edge with tokens', () => {
    // related-entity panels have zero content padding; the table pads its own cells.
    const source = list();
    expect(source).toMatch(/\.pfr-state\s*\{[^}]*padding:\s*var\(--mjf-gap\)\s+var\(--mjf-card-pad-sm\)/);
    expect(source.match(/class="pfr-state"/g)?.length).toBe(3);
  });

  it('gives a neutral status a plain badge rather than a modifier class', () => {
    const source = list();
    expect(source).not.toContain('mjf-badge--{{');
    expect(source).toContain(`[class.mjf-badge--success]="r.Tone === 'success'"`);
    expect(source).toContain(`[class.mjf-badge--warning]="r.Tone === 'warning'"`);
  });

  it('binds pre-formatted date text rather than formatting in the template', () => {
    expect(list()).toContain('{{ r.StartedText }}');
    expect(list()).toContain('{{ r.SubmittedText }}');
    expect(list()).not.toMatch(/When\(r\./);
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
