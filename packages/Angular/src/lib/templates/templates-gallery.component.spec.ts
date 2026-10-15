/**
 * The gallery's one destructive verb, executed: deleting a saved template is `Forms.DeleteTemplate`
 * (fix round 1 of #303 Task 10a) — the browser no longer walks the template's rows itself.
 */
import '@angular/compiler';
import { ChangeDetectorRef, Injector, runInInjectionContext } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFakeOperations, refused, succeeded, type FakeOperations } from '../shared/testing/fake-operations';
import type { SavedTemplateRow } from '../shared/form-catalog';

const reads: string[] = [];
vi.mock('../shared/form-catalog', () => ({
  readSavedTemplates: async () => {
    reads.push('templates');
    return [];
  },
}));

const { TemplatesGalleryComponent } = await import('./templates-gallery.component');

const row: SavedTemplateRow = { id: 't1', name: 'Intake', description: null, questionCount: 2, pageCount: 1, updatedAt: null };

function gallery() {
  const injector = Injector.create({
    providers: [{ provide: ChangeDetectorRef, useValue: { markForCheck: () => undefined } }],
  });
  return runInInjectionContext(injector, () => new TemplatesGalleryComponent());
}

let operations: FakeOperations | null = null;
afterEach(() => {
  operations?.restore();
  operations = null;
  reads.length = 0;
  vi.useRealTimers();
});

describe('deleting a saved template', () => {
  it('reloads only once for its own delete even after the write debounce expires', async () => {
    vi.useFakeTimers();
    operations = installFakeOperations(() => succeeded({ TemplateFormID: 't1', PageCount: 1, QuestionCount: 2, OptionCount: 0, ScreenCount: 0, AutomationCount: 0, BindingCount: 0 }));
    const component = gallery();
    component.ngOnInit();
    await vi.advanceTimersByTimeAsync(0);
    reads.length = 0;
    try {
      component.askDelete(row);
      await component.confirmDelete();
      await vi.advanceTimersByTimeAsync(1000);
      expect(reads).toEqual(['templates']);
    } finally {
      component.ngOnDestroy();
    }
  });

  it('asks Forms.DeleteTemplate for it, then re-reads the gallery and says so', async () => {
    operations = installFakeOperations(() =>
      succeeded({ TemplateFormID: 't1', PageCount: 1, QuestionCount: 2, OptionCount: 0, ScreenCount: 0, AutomationCount: 0, BindingCount: 0 }),
    );
    const component = gallery();
    const deleted: string[] = [];
    component.Deleted.subscribe(() => deleted.push('t1'));
    component.askDelete(row);

    await component.confirmDelete();

    expect(operations.calls).toEqual([{ key: 'Forms.DeleteTemplate', input: { TemplateFormID: 't1' } }]);
    expect(reads).toEqual(['templates']);
    expect(deleted).toEqual(['t1']);
    expect(component.pendingDelete).toBeNull();
  });

  it("shows the server's refusal and keeps the confirmation open", async () => {
    operations = installFakeOperations(() => refused('This template has 1 response(s) attached and cannot be deleted.'));
    const component = gallery();
    const failures: string[] = [];
    component.Failed.subscribe((m: string) => failures.push(m));
    component.askDelete(row);

    await component.confirmDelete();

    expect(failures).toEqual(['Could not delete "Intake": This template has 1 response(s) attached and cannot be deleted.']);
    expect(component.pendingDelete).toBe(row);
  });
});
