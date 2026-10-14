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
import { describe, expect, it, vi } from 'vitest';
import { FormsHomeDashboardComponent } from './forms-home-dashboard.component';
import { FormsHomeService } from './forms-home.service';
import type { FormStatus, FormSummaryRow } from './home-models';

type HomeServiceSurface = Pick<FormsHomeService, 'loadForms' | 'archive' | 'restore' | 'createFromTemplate' | 'runAuthoringAction'>;

function homeService(overrides: Partial<HomeServiceSurface>): HomeServiceSurface {
  return {
    loadForms: async () => [],
    archive: async (id: string) => ({ ok: true, output: { FormID: id, Status: 'Closed' as FormStatus } }),
    restore: async (id: string) => ({ ok: true, output: { FormID: id, Status: 'Draft' as FormStatus } }),
    createFromTemplate: async () => ({ ok: true, output: { FormID: 'new-1', Warnings: [] } }),
    runAuthoringAction: async () => ({ success: true, formId: null, message: 'Form created.' }),
    ...overrides,
  };
}

function makeComponent(service: HomeServiceSurface): FormsHomeDashboardComponent {
  const injector = Injector.create({
    providers: [
      { provide: FormsHomeService, useValue: service },
      // The failure paths under test never reach navigation; an empty double satisfies the injector.
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
  it('keeps "Failed to load forms" in front of a real Error, in the alert and in the emitted Error', async () => {
    const cause = new Error('GraphQL Error (Code: unknown)');
    const component = makeComponent(homeService({ loadForms: async () => Promise.reject(cause) }));
    const errors = emitted(component);

    await component.loadForms();

    expect(component.errorMessage).toBe('Failed to load forms: GraphQL Error (Code: unknown)');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('Failed to load forms: GraphQL Error (Code: unknown)');
    // The original failure travels as the cause, so its stack is not lost.
    expect(errors[0].cause).toBe(cause);
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
      homeService({ archive: async () => Promise.reject(new Error('timeout')) }),
    );
    expect(component.isArchived(draftRow)).toBe(false);

    await component.toggleArchive(draftRow);

    expect(component.errorMessage).toBe('Could not archive this form: timeout');
  });

  // An operation does not throw on a refusal — it returns one — so this, not a rejection, is what a
  // live archive failure looks like.
  it('says the archive failed when the operation reports a refusal instead of throwing', async () => {
    const component = makeComponent(
      homeService({ archive: async () => ({ ok: false, error: 'Simulated save failure', resultCode: 'EXECUTION_ERROR' }) }),
    );
    const errors = emitted(component);

    await component.toggleArchive(draftRow);

    expect(component.errorMessage).toBe('Could not archive this form: Simulated save failure');
    expect(errors.map((e) => e.message)).toEqual(['Could not archive this form: Simulated save failure']);
  });

  // MJ's action client turns a transport failure into { Success: false, Message: 'Error: …' }
  // rather than throwing, so an authoring failure arrives as a result, not a rejection.
  it('says the authoring action failed when it reports a failure instead of throwing', async () => {
    const component = makeComponent(
      homeService({
        runAuthoringAction: async () => ({
          success: false,
          formId: null,
          message: 'Error: GraphQL Error (Code: unknown)',
        }),
      }),
    );
    component.brief = 'An event RSVP';

    await component.authorWithAI();

    expect(component.errorMessage).toBe('The authoring action failed: Error: GraphQL Error (Code: unknown)');
  });
});

describe('FormsHomeDashboardComponent lifecycle and templates', () => {
  const archivedRow: FormSummaryRow = { ...draftRow, status: 'Closed' };

  it('restores an archived form through restore(), and archives a live one through archive()', async () => {
    const asked: string[] = [];
    const component = makeComponent(
      homeService({
        archive: async (id) => {
          asked.push(`archive ${id}`);
          return { ok: true, output: { FormID: id, Status: 'Closed' } };
        },
        restore: async (id) => {
          asked.push(`restore ${id}`);
          return { ok: true, output: { FormID: id, Status: 'Published' } };
        },
      }),
    );

    await component.toggleArchive(draftRow);
    await component.toggleArchive(archivedRow);

    expect(asked).toEqual(['archive form-1', 'restore form-1']);
  });

  it("shows a saved template's copy notes AFTER the list reloads, rather than letting the reload wipe them", async () => {
    // The reload's start clears the alert; set before it, the notes were wiped unseen.
    const component = makeComponent(
      homeService({ createFromTemplate: async () => ({ ok: true, output: { FormID: 'new-1', Warnings: ['A rule could not be carried over.'] } }) }),
    );
    component.OpenEntityRecord.subscribe(() => undefined);

    await component.useTemplate({ kind: 'saved', templateId: 't1', name: 'Intake' });

    expect(component.errorMessage).toBe('A rule could not be carried over.');
  });

  it("says the copy failed, then the server's reason", async () => {
    const component = makeComponent(
      homeService({ createFromTemplate: async () => ({ ok: false, error: 'Form t1 is not a template.', resultCode: 'EXECUTION_ERROR' }) }),
    );

    await component.useTemplate({ kind: 'saved', templateId: 't1', name: 'Intake' });

    expect(component.errorMessage).toBe('Could not create a form from "Intake": Form t1 is not a template.');
  });
});

describe('FormsHomeDashboardComponent — opening reads the list once', () => {
  // MJ's dashboard host calls `Refresh()` on the instance it creates, and the instance's own
  // `ngOnInit` loads too; both reach `loadData` while the first load is in flight. Same shape as
  // the reporting dashboard's double `Forms.GetResponseSummary` (click-through observation 3).
  const loadData = (c: FormsHomeDashboardComponent): void => (c as unknown as { loadData(): void }).loadData();

  function deferredLoads() {
    const pending: Array<(rows: FormSummaryRow[]) => void> = [];
    const service = homeService({
      loadForms: () => new Promise<FormSummaryRow[]>((resolve) => pending.push(resolve)),
    });
    return { service, pending };
  }

  it('joins a load already in flight instead of starting a second', async () => {
    const { service, pending } = deferredLoads();
    const component = makeComponent(service);
    loadData(component);
    loadData(component);

    expect(pending).toHaveLength(1);
    pending[0]([draftRow]);
    component.ngOnDestroy();
  });

  it('still re-reads on a Refresh that comes after the first load settled', async () => {
    const { service, pending } = deferredLoads();
    const component = makeComponent(service);
    loadData(component);
    pending[0]([draftRow]);
    await new Promise((settled) => setTimeout(settled, 0));

    loadData(component);

    expect(pending).toHaveLength(2);
    pending[1]([draftRow]);
    component.ngOnDestroy();
  });

  it('signals load-complete only once the list is in, for both joined callers', async () => {
    const { service, pending } = deferredLoads();
    const component = makeComponent(service);
    const notified = vi.fn();
    (component as unknown as { NotifyLoadComplete(): void }).NotifyLoadComplete = notified;

    const first = component.Refresh();
    const second = component.Refresh();
    await new Promise((settled) => setTimeout(settled, 0));
    expect(notified).not.toHaveBeenCalled();

    pending[0]([draftRow]);
    await Promise.all([first, second]);

    expect(notified).toHaveBeenCalledTimes(2);
    expect(component.forms).toEqual([draftRow]);
    component.ngOnDestroy();
  });
});

