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
import { Location } from '@angular/common';
import { NavigationService } from '@memberjunction/ng-shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FormsHomeDashboardComponent } from './forms-home-dashboard.component';
import { FormsHomeService } from './forms-home.service';
import { HOME_ENTITY, type FormStatus, type FormSummaryRow } from './home-models';
import { announceWrites } from '../shared/forms-writes';
import { LOAD_TIMEOUT_MS } from '../shared/coalesced-load';

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

/** A `Location` whose URL changes the test fires by hand; counts live subscriptions. */
function fakeLocation() {
  const listeners = new Set<(url: string, state: unknown) => void>();
  const location = {
    onUrlChange: (fn: (url: string, state: unknown) => void) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
  };
  return { location, navigate: (url: string) => listeners.forEach((fn) => fn(url, null)), live: () => listeners.size };
}

function makeComponent(service: HomeServiceSurface, location: object = fakeLocation().location): FormsHomeDashboardComponent {
  const injector = Injector.create({
    providers: [
      { provide: Location, useValue: location },
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
  it('keeps copy warnings after its own operation announcement debounce expires', async () => {
    vi.useFakeTimers();
    const component = makeComponent(homeService({ createFromTemplate: async () => {
      announceWrites([HOME_ENTITY.forms]);
      return { ok: true, output: { FormID: 'new-1', Warnings: ['A rule could not be carried over.'] } };
    } }));
    try {
      await component.Refresh();
      await component.useTemplate({ kind: 'saved', templateId: 't1', name: 'Intake' });
      await vi.advanceTimersByTimeAsync(1000);
      expect(component.errorMessage).toBe('A rule could not be carried over.');
    } finally {
      component.ngOnDestroy();
      vi.useRealTimers();
    }
  });

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

  it('signals load-complete only once the list is in', async () => {
    const { service, pending } = deferredLoads();
    const component = makeComponent(service);
    const notified = vi.fn();
    (component as unknown as { NotifyLoadComplete(): void }).NotifyLoadComplete = notified;

    const opening = component.Refresh();
    loadData(component);
    await new Promise((settled) => setTimeout(settled, 0));
    expect(notified).not.toHaveBeenCalled();

    pending[0]([draftRow]);
    await opening;

    expect(notified).toHaveBeenCalledTimes(1);
    expect(pending).toHaveLength(1);
    expect(component.forms).toEqual([draftRow]);
    component.ngOnDestroy();
  });

  it("queues a write's reload behind a Refresh in flight: one follow-up, no overlap, and the list shows the write", async () => {
    const pending: Array<(rows: FormSummaryRow[]) => void> = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const archived: FormSummaryRow = { ...draftRow, status: 'Closed' };
    const service = homeService({
      loadForms: () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        return new Promise<FormSummaryRow[]>((resolve) =>
          pending.push((rows) => {
            inFlight -= 1;
            resolve(rows);
          }),
        );
      },
    });
    const component = makeComponent(service);

    const refreshing = component.Refresh();
    const archiving = component.toggleArchive(draftRow);
    const restoring = component.toggleArchive(archived);
    await new Promise((settled) => setTimeout(settled, 0));
    // Both writes landed; their reloads wait for the Refresh's read instead of racing it.
    expect(pending).toHaveLength(1);

    pending[0]([draftRow]);
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    pending[1]([archived]);
    await Promise.all([refreshing, archiving, restoring]);

    expect(pending).toHaveLength(2);
    expect(maxInFlight).toBe(1);
    expect(component.forms).toEqual([archived]);
    component.ngOnDestroy();
  });

  it('runs a Refresh that arrives during the first load once that load settles, not alongside it', async () => {
    const { service, pending } = deferredLoads();
    const component = makeComponent(service);
    const notified = vi.fn();
    (component as unknown as { NotifyLoadComplete(): void }).NotifyLoadComplete = notified;
    const renamed: FormSummaryRow = { ...draftRow, name: 'Intake (renamed)' };

    loadData(component);
    const refreshing = component.Refresh();
    const again = component.Refresh();
    await new Promise((settled) => setTimeout(settled, 0));
    expect(pending).toHaveLength(1);

    pending[0]([draftRow]);
    // Two Refreshes during one load ask for one more read, not two.
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    expect(notified).not.toHaveBeenCalled();
    pending[1]([renamed]);
    await Promise.all([refreshing, again]);

    expect(pending).toHaveLength(2);
    expect(component.forms).toEqual([renamed]);
    expect(notified).toHaveBeenCalledTimes(2);
    component.ngOnDestroy();
  });
});


describe('FormsHomeDashboardComponent — reloads heard from elsewhere, and a hung read', () => {
  const loadData = (c: FormsHomeDashboardComponent): void => void (c as unknown as { loadData(): Promise<void> }).loadData();

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function deferredLoads() {
    const pending: Array<(rows: FormSummaryRow[]) => void> = [];
    const service = homeService({
      loadForms: () => new Promise<FormSummaryRow[]>((resolve) => pending.push(resolve)),
    });
    return { service, pending };
  }

  it('queues a re-read behind the read in flight when a Forms write is heard elsewhere, instead of skipping it', async () => {
    // The read in flight may have started before that write, so skipping it (the old `loading`
    // guard) left the list showing the pre-write state.
    vi.useFakeTimers();
    const { service, pending } = deferredLoads();
    const component = makeComponent(service);
    const renamed: FormSummaryRow = { ...draftRow, name: 'Intake (renamed)' };
    loadData(component);
    expect(component.loading).toBe(true);

    announceWrites([HOME_ENTITY.forms]);
    await vi.advanceTimersByTimeAsync(1_000); // past the listener's debounce
    expect(pending).toHaveLength(1); // queued, not alongside

    pending[0]([draftRow]);
    await vi.advanceTimersByTimeAsync(0);
    expect(pending).toHaveLength(2);
    pending[1]([renamed]);
    await vi.advanceTimersByTimeAsync(0);

    expect(component.forms).toEqual([renamed]);
    component.ngOnDestroy();
  });

  it('abandons a read that hangs past the load timeout: says so, ends the loading state, and ignores its late rows', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { service, pending } = deferredLoads();
    const component = makeComponent(service);
    const errors = emitted(component);
    loadData(component);

    await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS);
    expect(component.loading).toBe(false);
    expect(component.errorMessage).toContain('Failed to load forms');
    expect(component.errorMessage).toContain(`did not settle within ${LOAD_TIMEOUT_MS} ms`);
    expect(errors).toHaveLength(1);

    pending[0]([draftRow]);
    await vi.advanceTimersByTimeAsync(0);
    expect(component.forms).toEqual([]);
    expect(component.loading).toBe(false);
    component.ngOnDestroy();
  });
});

describe('FormsHomeDashboardComponent — re-reads when navigated back to (F10)', () => {
  const initDashboard = (c: FormsHomeDashboardComponent): void => (c as unknown as { initDashboard(): void }).initDashboard();

  function counting() {
    let reads = 0;
    const service = homeService({ loadForms: async () => { reads += 1; return []; } });
    return { service, reads: () => reads };
  }

  it('reads once when the URL returns to the Forms home, and not for another route', async () => {
    const { service, reads } = counting();
    const url = fakeLocation();
    const component = makeComponent(service, url.location);
    initDashboard(component);

    url.navigate('/app/forms/Responses%20%26%20Analytics');
    await new Promise((settled) => setTimeout(settled, 0));
    expect(reads()).toBe(0);

    url.navigate('/app/forms/Forms');
    await vi.waitFor(() => expect(reads()).toBe(1));
    component.ngOnDestroy();
  });

  it('stops listening once destroyed', async () => {
    const { service, reads } = counting();
    const url = fakeLocation();
    const component = makeComponent(service, url.location);
    initDashboard(component);
    expect(url.live()).toBe(1);

    component.ngOnDestroy();
    url.navigate('/app/forms');
    await new Promise((settled) => setTimeout(settled, 0));

    expect(url.live()).toBe(0);
    expect(reads()).toBe(0);
  });
});

describe('FormsHomeDashboardComponent — Archive asks first (F11)', () => {
  const archivedRow: FormSummaryRow = { ...draftRow, status: 'Closed' };
  const other: FormSummaryRow = { ...draftRow, id: 'form-2', name: 'Survey' };

  function spied() {
    const archive = vi.fn(async (id: string) => ({ ok: true as const, output: { FormID: id, Status: 'Closed' as FormStatus } }));
    const restore = vi.fn(async (id: string) => ({ ok: true as const, output: { FormID: id, Status: 'Published' as FormStatus } }));
    return { archive, restore, component: makeComponent(homeService({ archive, restore })) };
  }

  it('the first Archive click only asks: it enters the confirming state and archives nothing', () => {
    const { archive, component } = spied();

    component.requestArchive(draftRow);

    expect(component.confirmingArchive).toBe('form-1');
    expect(archive).not.toHaveBeenCalled();
  });

  it('confirming archives exactly once and leaves the confirming state', async () => {
    const { archive, component } = spied();
    component.requestArchive(draftRow);

    await component.confirmArchive(draftRow);

    expect(archive).toHaveBeenCalledTimes(1);
    expect(archive).toHaveBeenCalledWith('form-1');
    expect(component.confirmingArchive).toBeNull();
  });

  it('Cancel, Escape and opening a row never archive', () => {
    const { archive, component } = spied();

    component.requestArchive(draftRow);
    component.cancelArchive();
    expect(component.confirmingArchive).toBeNull();

    component.requestArchive(draftRow);
    component.OpenEntityRecord.subscribe(() => undefined);
    component.openForm(other);
    expect(component.confirmingArchive).toBeNull();

    expect(archive).not.toHaveBeenCalled();
  });

  it('asking about another row moves the question to that row', () => {
    const { component } = spied();
    component.requestArchive(draftRow);

    component.requestArchive(other);

    expect(component.confirmingArchive).toBe('form-2');
  });

  it('Restore stays one click: no question, restore() called directly', async () => {
    const { restore, component } = spied();

    await component.requestArchive(archivedRow);

    expect(restore).toHaveBeenCalledTimes(1);
    expect(component.confirmingArchive).toBeNull();
  });

  it('names the form and what happens to its links in the question', () => {
    const { component } = spied();

    expect(component.archiveQuestion(draftRow)).toBe(
      'Archive "Intake"? Its open share links close and respondents see "no longer accepting responses". Restore brings it back, but the links stay closed.',
    );
  });
});
