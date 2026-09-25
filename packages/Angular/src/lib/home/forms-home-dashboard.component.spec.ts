/**
 * `FormsHomeDashboardComponent` exercised as a class, through its public methods.
 *
 * Its field `inject()` calls need an injection context, not a TestBed:
 * `runInInjectionContext` over an `Injector.create(...)` of narrow stub providers is enough in
 * this node environment (see `distribution-manager.behaviour.spec.ts`, which established the
 * pattern). What is under test is the alert text (#253): a real Error used to REPLACE the
 * action sentence, so the reader saw "GraphQL Error (Code: unknown)" with no hint of what failed.
 */
import '@angular/compiler';
import { ChangeDetectorRef, Injector, runInInjectionContext } from '@angular/core';
import { NavigationService } from '@memberjunction/ng-shared';
import { describe, expect, it } from 'vitest';
import { FormsHomeDashboardComponent } from './forms-home-dashboard.component';
import { FormsHomeService } from './forms-home.service';
import { FormCloneService } from '../templates/form-clone.service';
import type { FormStatus, FormSummaryRow } from './home-models';

type HomeServiceSurface = Pick<FormsHomeService, 'loadForms' | 'setStatus'>;

function homeService(overrides: Partial<HomeServiceSurface>): HomeServiceSurface {
  return {
    loadForms: async () => [],
    setStatus: async (_id: string, _status: FormStatus) => null,
    ...overrides,
  };
}

function makeComponent(service: HomeServiceSurface): FormsHomeDashboardComponent {
  const injector = Injector.create({
    providers: [
      { provide: FormsHomeService, useValue: service },
      // The failure paths under test never reach the clone service or navigation; empty
      // doubles are enough to satisfy the injector.
      { provide: FormCloneService, useValue: {} },
      { provide: NavigationService, useValue: {} },
      { provide: ChangeDetectorRef, useValue: { markForCheck: () => undefined, detectChanges: () => undefined } },
    ],
  });
  return runInInjectionContext(injector, () => new FormsHomeDashboardComponent());
}

/** Every Error the component emits, in order. */
function emitted(component: FormsHomeDashboardComponent): Error[] {
  const errors: Error[] = [];
  component.Error.subscribe((e: Error) => errors.push(e));
  return errors;
}

const draftRow: FormSummaryRow = {
  id: 'form-1',
  name: 'Intake',
  status: 'Draft',
  categoryName: null,
  updatedAt: null,
  responseCount: 0,
};

describe('FormsHomeDashboardComponent failure alert (#253)', () => {
  it('keeps "Failed to load forms" in front of a real Error, and still emits the Error', async () => {
    const cause = new Error('GraphQL Error (Code: unknown)');
    const component = makeComponent(homeService({ loadForms: async () => Promise.reject(cause) }));
    const errors = emitted(component);

    await component.loadForms();

    expect(component.errorMessage).toBe('Failed to load forms: GraphQL Error (Code: unknown)');
    expect(errors).toEqual([cause]);
  });

  it('shows the action sentence alone when the rejection is not an Error', async () => {
    const component = makeComponent(homeService({ loadForms: async () => Promise.reject('boom') }));
    const errors = emitted(component);

    await component.loadForms();

    expect(component.errorMessage).toBe('Failed to load forms.');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(Error);
    expect(errors[0].message).toBe('Failed to load forms.');
  });

  it('says the archive failed, then why', async () => {
    const component = makeComponent(
      homeService({ setStatus: async () => Promise.reject(new Error('timeout')) }),
    );
    expect(component.isArchived(draftRow)).toBe(false);

    await component.toggleArchive(draftRow);

    expect(component.errorMessage).toBe('Could not archive this form: timeout');
  });
});
