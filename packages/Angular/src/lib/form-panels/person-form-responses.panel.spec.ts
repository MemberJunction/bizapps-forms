/**
 * The Person Forms panel's mount latch, driven for real.
 *
 * The list must not query until the section is first expanded (lazy), and once mounted must
 * stay mounted through collapse/expand so the accordion does not refetch and flash a spinner each
 * time (seen in Explorer). A different record resets the latch.
 *
 * `@memberjunction/ng-base-forms` cannot load in this node suite (its partially-compiled
 * components need the Angular Linker), so it is mocked to plain stand-ins: `BaseFormPanel` only
 * contributes the `Record` / `FormComponent` inputs, which the test sets directly. The latch
 * logic under test is the panel's own. `@angular/compiler` is imported for its side effect, as in
 * `validation-rule-editor.spec.ts`.
 */
import '@angular/compiler';
import { describe, expect, it, vi } from 'vitest';
import type { BaseEntity } from '@memberjunction/core';
import type { BaseFormComponent } from '@memberjunction/ng-base-forms';

vi.mock('@memberjunction/ng-base-forms', () => ({
  BaseFormPanel: class BaseFormPanel {},
  BaseFormsModule: class BaseFormsModule {},
  FormRecordRefreshCoordinator: class FormRecordRefreshCoordinator {},
}));

const { PersonFormResponsesPanel } = await import('./person-form-responses.panel');

interface FakeRecord { IsSaved: boolean; FirstPrimaryKey: { Value: string } }

/** The two members of the host form the latch reads, with expansion under test control. */
class FakeForm {
  public Expanded = false;
  public IsSectionExpanded(_key: string): boolean { return this.Expanded; }
}

// The stand-ins carry only what the panel reads; the double cast is confined to these helpers.
const asRecord = (r: FakeRecord): BaseEntity => r as unknown as BaseEntity;
const asForm = (f: FakeForm): BaseFormComponent => f as unknown as BaseFormComponent;

const saved = (id: string): FakeRecord => ({ IsSaved: true, FirstPrimaryKey: { Value: id } });

function createPanel(record: FakeRecord): { panel: InstanceType<typeof PersonFormResponsesPanel>; form: FakeForm } {
  const panel = new PersonFormResponsesPanel();
  const form = new FakeForm();
  panel.Record = asRecord(record);
  panel.FormComponent = asForm(form);
  return { panel, form };
}

describe('PersonFormResponsesPanel mount latch', () => {
  it('stays unmounted (no query) until the section is first expanded', () => {
    const { panel } = createPanel(saved('a'));
    panel.ngDoCheck();
    expect(panel.ListMounted).toBe(false);
  });

  it('mounts on expansion and stays mounted after a collapse', () => {
    const { panel, form } = createPanel(saved('a'));
    form.Expanded = true;
    panel.ngDoCheck();
    expect(panel.ListMounted).toBe(true);

    form.Expanded = false;
    panel.ngDoCheck();
    expect(panel.ListMounted).toBe(true);
  });

  it('never mounts for an unsaved record, even when expanded', () => {
    const { panel, form } = createPanel({ IsSaved: false, FirstPrimaryKey: { Value: '' } });
    form.Expanded = true;
    panel.ngDoCheck();
    expect(panel.ListMounted).toBe(false);
  });

  it('resets when the record changes, so a collapsed section for the new record stays lazy', () => {
    const { panel, form } = createPanel(saved('a'));
    form.Expanded = true;
    panel.ngDoCheck();

    form.Expanded = false;
    panel.Record = asRecord(saved('b'));
    panel.ngDoCheck();
    expect(panel.ListMounted).toBe(false);
  });
});
