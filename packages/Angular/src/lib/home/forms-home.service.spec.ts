/**
 * `FormsHomeService` — Forms home's data seam — exercised as a class.
 *
 * Its reads are `../shared/form-catalog` (pinned in `form-catalog.spec.ts`) and its writes are Remote
 * Operations (#303): archive, restore and "start from a saved template" go through the REAL
 * generated operation classes here, with the provider they route through faked. The two Actions
 * are mocked at the shared runner. What is pinned: the right operation, the right input, the
 * server's refusal passed through as a reason, and the failure text for the Actions (#253).
 */
import '@angular/compiler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionResult } from '@memberjunction/actions-base';
import { installFakeOperations, refused, succeeded, type FakeOperations } from '../shared/testing/fake-operations';
import type { ActionRunOutcome } from '../shared/authoring-actions';

let actionRun: ActionRunOutcome = { ok: false, message: 'unset' };

vi.mock('../shared/authoring-actions', () => ({
  runActionByName: async () => actionRun,
}));
vi.mock('../shared/form-catalog', () => ({
  readFormListing: async () => ({
    forms: [{ ID: 'f1', Name: 'Alpha', Status: 'Published', CategoryID: 'c1', __mj_UpdatedAt: null }],
    categories: [{ ID: 'c1', Name: 'Intake' }],
    counts: new Map([['f1', 712]]),
  }),
}));

const { FormsHomeService } = await import('./forms-home.service');

let operations: FakeOperations | null = null;

beforeEach(() => {
  actionRun = { ok: false, message: 'unset' };
});

afterEach(() => {
  operations?.restore();
  operations = null;
});

describe('FormsHomeService.loadForms', () => {
  it('folds the catalog listing into grid rows', async () => {
    const rows = await new FormsHomeService().loadForms();
    expect(rows).toEqual([
      { id: 'f1', name: 'Alpha', status: 'Published', categoryName: 'Intake', updatedAt: null, responseCount: 712 },
    ]);
  });
});

describe('archive and restore are operations', () => {
  it('archives through Forms.ArchiveForm', async () => {
    operations = installFakeOperations(() => succeeded({ FormID: 'f1', Status: 'Closed' }));

    const outcome = await new FormsHomeService().archive('f1');

    expect(operations.calls).toEqual([{ key: 'Forms.ArchiveForm', input: { FormID: 'f1' } }]);
    expect(outcome).toEqual({ ok: true, output: { FormID: 'f1', Status: 'Closed' } });
  });

  it('restores through Forms.RestoreForm, and reports the status the server chose', async () => {
    operations = installFakeOperations(() => succeeded({ FormID: 'f1', Status: 'Published' }));

    const outcome = await new FormsHomeService().restore('f1');

    expect(operations.calls).toEqual([{ key: 'Forms.RestoreForm', input: { FormID: 'f1' } }]);
    expect(outcome.ok && outcome.output.Status).toBe('Published');
  });

  it("passes the server's refusal through as the reason", async () => {
    operations = installFakeOperations(() => refused('Could not archive form f1: a share link would not close.'));

    const outcome = await new FormsHomeService().archive('f1');

    expect(outcome).toMatchObject({ ok: false, error: 'Could not archive form f1: a share link would not close.' });
  });
});

describe('starting from a saved template', () => {
  it('asks Forms.CreateFormFromTemplate for a copy named as the card was', async () => {
    operations = installFakeOperations(() => succeeded({ FormID: 'new-1', Warnings: [] }));

    const outcome = await new FormsHomeService().createFromTemplate('t1', 'Client intake');

    expect(operations.calls).toEqual([
      { key: 'Forms.CreateFormFromTemplate', input: { TemplateFormID: 't1', Name: 'Client intake' } },
    ]);
    expect(outcome.ok && outcome.output.FormID).toBe('new-1');
  });
});

describe('the authoring Actions — failure text is a reason, not a second headline (#253)', () => {
  it('says the action is not installed when its name resolves to nothing', async () => {
    actionRun = { ok: false, message: "Action 'Forms: Generate' is not installed." };
    const result = await new FormsHomeService().runAuthoringAction('Forms: Generate', []);
    expect(result).toEqual({ success: false, formId: null, message: "Action 'Forms: Generate' is not installed." });
  });

  it('gives a reason when an authoring action fails without saying why', async () => {
    actionRun = { ok: true, result: { Success: false, Message: '' } as unknown as ActionResult };
    const result = await new FormsHomeService().runAuthoringAction('Forms: Generate', []);
    expect(result.message).toBe('the action reported a failure with no error message');
  });

  it("passes the action's own message through when it has one", async () => {
    actionRun = { ok: true, result: { Success: false, Message: 'Brief too short' } as unknown as ActionResult };
    const result = await new FormsHomeService().runAuthoringAction('Forms: Generate', []);
    expect(result.message).toBe('Brief too short');
  });

  it('opens the form the action created', async () => {
    actionRun = {
      ok: true,
      result: { Success: true, Message: '', Result: [{ Name: 'FormID', Value: 'f-new' }] } as unknown as ActionResult,
    };
    const result = await new FormsHomeService().runAuthoringAction('Forms: Generate', []);
    expect(result).toEqual({ success: true, formId: 'f-new', message: 'Form created.' });
  });
});
