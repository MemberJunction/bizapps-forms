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
import { ResourceData } from '@memberjunction/core-entities';
import { HOME_URL_DEBOUNCE_MS } from './forms-home-dashboard.component';

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

type ChangeDetectorSurface = Pick<ChangeDetectorRef, 'markForCheck' | 'detectChanges'>;

/**
 * A component that exposes, with real types, the protected members the specs need: the lifecycle
 * hook `BaseDashboard` calls, and the template's focus targets (which the node env cannot render).
 */
class HomeProbe extends FormsHomeDashboardComponent {
  public init(): void {
    this.initDashboard();
  }

  /** What MJ's shell delivers on a deep link or back / forward. */
  public deliver(params: Record<string, string>): void {
    this.OnQueryParamsChanged(params, 'deeplink');
  }

  public setFocusTargets(triggers: NonNullable<HomeProbe['archiveTriggers']>, title: NonNullable<HomeProbe['pageTitle']>): void {
    this.archiveTriggers = triggers;
    this.pageTitle = title;
  }
}

function makeComponent(service: HomeServiceSurface, location?: object, cdr?: ChangeDetectorSurface): FormsHomeDashboardComponent {
  return makeProbe(service, location, cdr);
}

function makeProbe(
  service: HomeServiceSurface,
  location: object = fakeLocation().location,
  cdr: ChangeDetectorSurface = { markForCheck: () => undefined, detectChanges: () => undefined },
  navigation: object = {},
): HomeProbe {
  const injector = Injector.create({
    providers: [
      { provide: Location, useValue: location },
      { provide: FormsHomeService, useValue: service },
      // Most paths never reach navigation; the URL specs pass a double that records writes.
      { provide: NavigationService, useValue: navigation },
      { provide: ChangeDetectorRef, useValue: cdr },
    ],
  });
  return runInInjectionContext(injector, () => new HomeProbe());
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
  it('keeps "Failed to load forms" in front of a real Error, and logs the original with it', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const cause = new Error('GraphQL Error (Code: unknown)');
    const component = makeComponent(homeService({ loadForms: async () => Promise.reject(cause) }));

    await component.loadForms();

    expect(component.errorMessage).toBe('Failed to load forms: GraphQL Error (Code: unknown)');
    // The original failure is logged with the sentence, so its stack is not lost.
    expect(consoleError.mock.calls.flat()).toContain(cause);
    consoleError.mockRestore();
  });

  it('shows the action sentence alone when the rejection is not an Error', async () => {
    const component = makeComponent(homeService({ loadForms: async () => Promise.reject('boom') }));

    await component.loadForms();

    expect(component.errorMessage).toBe('Failed to load forms.');
  });

  // UI audit F01, F10: a failed list stays in the dashboard, with its own state and Retry.
  it('never emits the host Error, which would replace the page with "Unable to Load Dashboard"', async () => {
    const component = makeComponent(homeService({ loadForms: async () => Promise.reject(new Error('down')) }));
    const errors = emitted(component);

    await component.loadForms();

    expect(errors).toEqual([]);
  });

  it('shows the failed state, not "No forms yet", and Retry reads the list again', async () => {
    let fail = true;
    const component = makeComponent(
      homeService({ loadForms: async () => (fail ? Promise.reject(new Error('down')) : [draftRow]) }),
    );

    await component.loadForms();
    expect(component.listState).toBe('failed');

    fail = false;
    await component.loadForms();
    expect(component.listState).toBe('list');
  });

  it('keeps the list failure apart from a later, unrelated failure (final review #2)', async () => {
    // The failed card printed whatever `errorMessage` held, so an authoring message written while
    // the list was down appeared under "Couldn’t load your forms."
    const component = makeComponent(homeService({ loadForms: async () => Promise.reject(new Error('down')) }));
    await component.loadForms();
    component.openPanel('ai');
    await component.authorWithAI();

    expect(component.listState).toBe('failed');
    expect(component.listLoadError).toBe('Failed to load forms: down');
    expect(component.errorMessage).not.toBe(component.listLoadError);
    expect(component.errorMessage).not.toBeNull();
  });

  it('says every form is archived rather than matching an empty search', async () => {
    const component = makeComponent(homeService({ loadForms: async () => [{ ...draftRow, status: 'Closed' as FormStatus }] }));

    await component.loadForms();

    expect(component.listState).toBe('all-archived');
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
    // Shown in the page, never escalated to the host (UI audit F01).
    expect(errors).toEqual([]);
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
    expect(component.listState).toBe('failed');
    // The page says so and offers Retry; the host is not asked to replace it (UI audit F01).
    expect(errors).toEqual([]);

    pending[0]([draftRow]);
    await vi.advanceTimersByTimeAsync(0);
    expect(component.forms).toEqual([]);
    expect(component.loading).toBe(false);
    component.ngOnDestroy();
  });
});

describe('FormsHomeDashboardComponent — re-reads when navigated back to (F10)', () => {
  const initDashboard = (c: HomeProbe): void => c.init();

  function counting() {
    let reads = 0;
    const service = homeService({ loadForms: async () => { reads += 1; return []; } });
    return { service, reads: () => reads };
  }

  it('reads once when the URL returns to the Forms home, and not for another route', async () => {
    const { service, reads } = counting();
    const url = fakeLocation();
    const component = makeProbe(service, url.location);
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
    const component = makeProbe(service, url.location);
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

describe('FormsHomeDashboardComponent — focus after the Archive question closes (F11, WCAG 2.4.3)', () => {
  const live: FormSummaryRow = { ...draftRow };
  const archivedOnly: FormSummaryRow = { ...draftRow, status: 'Closed' };

  /** The template's focus targets, replaced by recorders (the node env renders no DOM). */
  function withTargets(component: HomeProbe): string[] {
    const focused: string[] = [];
    const trigger = (rowId: string) => ({ nativeElement: { focus: () => void focused.push(`trigger ${rowId}`), dataset: { rowId } } });
    const triggers = [trigger('form-1'), trigger('form-2')];
    component.setFocusTargets(
      { find: (matches) => triggers.find(matches) },
      { nativeElement: { focus: () => void focused.push('title') } },
    );
    return focused;
  }

  /** A click or Escape keydown that records when its propagation is stopped. */
  const stoppableEvent = (order: string[]) => ({ stopPropagation: () => void order.push('stop') });

  it("Cancel puts focus back on that row's Archive icon", () => {
    const component = makeProbe(homeService({}));
    const focused = withTargets(component);
    void component.requestArchive(live);

    component.cancelArchive();

    expect(focused).toEqual(['trigger form-1']);
  });

  // The walk-through bug: Cancel re-rendered synchronously, removing the confirm wrapper (and its
  // stopPropagation listener) mid-dispatch, so the click reached the card and opened the form.
  // The buttons must stop the click themselves, before anything re-renders.
  // Escape reaches the same method (`(keydown.escape)="cancelArchive($event)"`), so the Cancel case
  // covers it: both pass their DOM event.
  it('Cancel, Escape and Archive stop their own event, before they re-render', async () => {
    const order: string[] = [];
    const component = makeProbe(homeService({}), undefined, {
      markForCheck: () => undefined,
      detectChanges: () => void order.push('render'),
    });
    withTargets(component);

    void component.requestArchive(live);
    component.cancelArchive(stoppableEvent(order));
    expect(order.slice(0, 2)).toEqual(['stop', 'render']);

    order.length = 0;
    void component.requestArchive(live);
    const confirming = component.confirmArchive(live, stoppableEvent(order));
    expect(order[0]).toBe('stop');
    await confirming;
  });

  it('does not touch the view after being destroyed mid-archive', async () => {
    let release: () => void = () => undefined;
    const component = makeProbe(homeService({ archive: () => new Promise((r) => { release = () => r({ ok: true, output: { FormID: 'form-1', Status: 'Closed' as FormStatus } }); }) }));
    const focused = withTargets(component);
    void component.requestArchive(live);

    const confirming = component.confirmArchive(live);
    component.ngOnDestroy();
    release();
    await confirming;

    expect(focused).toEqual([]);
  });

  it('after a confirmed archive that removes the row, focus goes to the page title, not body', async () => {
    const component = makeProbe(homeService({ loadForms: async () => [] }));
    const focused = withTargets(component);
    await component.loadForms();
    void component.requestArchive(live);

    await component.confirmArchive(live);

    expect(focused).toEqual(['title']);
  });

  it('after a confirmed archive that leaves the row visible, focus returns to its icon', async () => {
    const component = makeProbe(homeService({ loadForms: async () => [archivedOnly] }));
    const focused = withTargets(component);
    component.showArchived = true;
    await component.loadForms();
    void component.requestArchive(live);

    await component.confirmArchive(live);

    expect(focused).toEqual(['trigger form-1']);
  });
});

describe('FormsHomeDashboardComponent — the search and archived toggle live in the URL (F09)', () => {
  const rows: FormSummaryRow[] = [
    { ...draftRow, id: 'a', name: 'Intake' },
    { ...draftRow, id: 'b', name: 'Survey' },
    { ...draftRow, id: 'c', name: 'Old intake', status: 'Closed' },
  ];

  function withUrl() {
    const writes: Record<string, string | null>[] = [];
    const navigation = { UpdateTabQueryParams: vi.fn((_tab: string, params: Record<string, string | null>) => (writes.push(params), true)) };
    const component = makeProbe(homeService({ loadForms: async () => rows }), fakeLocation().location, undefined, navigation);
    component.Data = new ResourceData({ Configuration: { tabId: 'tab-1' } });
    return { component, writes };
  }

  it('applies the search and toggle a link carries', async () => {
    const { component } = withUrl();
    await component.loadForms();

    component.deliver({ q: 'intake', archived: '1' });

    expect(component.query).toBe('intake');
    expect(component.showArchived).toBe(true);
    expect(component.visibleForms.map((f) => f.id)).toEqual(['a', 'c']);
  });

  it('writes the search once typing pauses, and the toggle at once', async () => {
    vi.useFakeTimers();
    const { component, writes } = withUrl();
    component.setQuery('in');
    component.setQuery('intake');
    expect(writes).toEqual([]);
    vi.advanceTimersByTime(HOME_URL_DEBOUNCE_MS);
    expect(writes).toEqual([{ q: 'intake', archived: null }]);

    component.toggleArchived();
    expect(writes.at(-1)).toEqual({ q: 'intake', archived: '1' });
    vi.useRealTimers();
  });

  it('drops a pending URL write when the page is destroyed', () => {
    vi.useFakeTimers();
    const { component, writes } = withUrl();
    component.setQuery('intake');
    component.ngOnDestroy();
    vi.advanceTimersByTime(HOME_URL_DEBOUNCE_MS);
    expect(writes).toEqual([]);
    vi.useRealTimers();
  });

  it('does not re-read the list when only its own query params change', async () => {
    let reads = 0;
    const url = fakeLocation();
    const component = makeProbe(homeService({ loadForms: async () => ((reads += 1), []) }), url.location);
    component.init();

    url.navigate('/app/forms/Forms?q=intake');
    await new Promise((settled) => setTimeout(settled, 0));

    expect(reads).toBe(0);
    component.ngOnDestroy();
  });
});
