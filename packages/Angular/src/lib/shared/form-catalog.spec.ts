/**
 * The Forms catalog reads, over a fake `RunView`: the home grid's listing and the gallery's saved
 * templates. Moved here with the reads from `FormsHomeService` and the deleted
 * `FormTemplatesService` (#303), with the cases that were about them.
 *
 * The counts are enrichment: the grid must still load when they fail, but the failure must be
 * logged rather than read as "every form has zero responses" (#247).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunView, RunViewParams, RunViewResult } from '@memberjunction/core';
import { FORMS_ENTITY } from './entity-names';

const logged: string[] = [];

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  return { ...actual, LogError: (message: string) => logged.push(message) };
});

const { findTemplateSavedFrom, loadFormRecord, readFormListing, readSavedTemplates } = await import('./form-catalog');

function ok(results: object[], aggregates?: RunViewResult['AggregateResults']): RunViewResult {
  return { Success: true, Results: results, RowCount: results.length, TotalRowCount: results.length, ExecutionTime: 0, ErrorMessage: '', AggregateResults: aggregates };
}

const refusedView = (message: string): RunViewResult => ({ ...ok([]), Success: false, ErrorMessage: message });

/** A RunView double that answers by entity name and records every request. */
function reader(answer: (params: RunViewParams) => RunViewResult): Pick<RunView, 'RunView' | 'RunViews'> & { asked: RunViewParams[] } {
  const asked: RunViewParams[] = [];
  const respond = (p: RunViewParams) => {
    asked.push(p);
    return answer(p);
  };
  return {
    asked,
    RunView: (async (p: RunViewParams) => respond(p)) as Pick<RunView, 'RunView'>['RunView'],
    RunViews: (async (ps: RunViewParams[]) => ps.map(respond)) as Pick<RunView, 'RunViews'>['RunViews'],
  };
}

beforeEach(() => {
  logged.length = 0;
});

describe('readFormListing — the Forms home grid', () => {
  let countsSucceed = true;
  let formsViewError: string | null = null;

  const answer = (params: RunViewParams): RunViewResult => {
    if (params.EntityName === FORMS_ENTITY.Form) {
      return formsViewError !== null
        ? refusedView(formsViewError)
        : ok([
            { ID: 'f1', Name: 'Alpha', Status: 'Published', CategoryID: null, __mj_UpdatedAt: null },
            { ID: 'f2', Name: 'Beta', Status: 'Draft', CategoryID: null, __mj_UpdatedAt: null },
          ]);
    }
    if (params.EntityName === FORMS_ENTITY.FormCategory) {
      return ok([]);
    }
    if (!countsSucceed) {
      return refusedView('count query refused');
    }
    const values: Record<string, string> = { f1: '712', f2: '0' };
    return ok([], (params.Aggregates ?? []).map((a) => ({ expression: a.expression, alias: a.alias ?? '', value: values[a.alias ?? ''] })));
  };

  beforeEach(() => {
    countsSucceed = true;
    formsViewError = null;
  });

  it('lists working forms only — never a template', async () => {
    const rv = reader(answer);
    await readFormListing(rv);
    expect(rv.asked.find((p) => p.EntityName === FORMS_ENTITY.Form)?.ExtraFilter).toBe('IsTemplate = 0');
  });

  it('carries the server-computed Complete count for each form', async () => {
    const listing = await readFormListing(reader(answer));
    expect(listing.counts?.get('f1')).toBe(712);
    expect(listing.counts?.get('f2')).toBe(0);
  });

  it('never downloads response rows to count them, and counts only the forms it listed', async () => {
    const rv = reader(answer);
    await readFormListing(rv);
    const responseQueries = rv.asked.filter((p) => p.EntityName === FORMS_ENTITY.FormResponse);
    expect(responseQueries.length).toBeGreaterThan(0);
    expect(responseQueries.every((p) => p.ResultType === 'count_only')).toBe(true);
    expect(responseQueries.flatMap((p) => (p.Aggregates ?? []).map((a) => a.alias))).toEqual(['f1', 'f2']);
  });

  it('still lists the forms when counting fails, logs why, and reports no count rather than a false zero', async () => {
    countsSucceed = false;
    const listing = await readFormListing(reader(answer));
    expect(listing.forms.map((f) => f.ID)).toEqual(['f1', 'f2']);
    expect(listing.counts).toBeNull();
    expect(logged.join('\n')).toMatch(/2 forms on Forms home[\s\S]*count query refused/);
  });

  it("rejects with the view's own error message when the forms cannot be read", async () => {
    formsViewError = 'Invalid column name IsTemplate';
    await expect(readFormListing(reader(answer))).rejects.toThrow('Invalid column name IsTemplate');
  });

  it('gives a reason, not a second "Failed to load forms" headline, when the view says nothing', async () => {
    // Forms home prefixes this with "Failed to load forms: ", so a fallback that repeated the
    // headline would render "Failed to load forms: Failed to load forms."
    formsViewError = '';
    const failure = readFormListing(reader(answer));
    await expect(failure).rejects.toThrow('the Forms view reported a failure with no error message');
  });
});

describe('readSavedTemplates — the gallery', () => {
  it('reads templates only, with the question and page counts each card shows', async () => {
    const rv = reader((p) => {
      if (p.EntityName === FORMS_ENTITY.Form) return ok([{ ID: 't1', Name: 'Intake', Description: null, __mj_UpdatedAt: '2026-10-01T00:00:00Z' }]);
      if (p.EntityName === FORMS_ENTITY.FormQuestion) return ok([{ FormID: 't1' }, { FormID: 't1' }]);
      return ok([{ FormID: 't1' }]);
    });

    const rows = await readSavedTemplates(rv);

    expect(rv.asked[0].ExtraFilter).toBe('IsTemplate = 1');
    expect(rows).toEqual([
      { id: 't1', name: 'Intake', description: null, questionCount: 2, pageCount: 1, updatedAt: new Date('2026-10-01T00:00:00Z') },
    ]);
  });

  it('throws when the templates themselves cannot be read — an empty gallery would be a lie', async () => {
    await expect(readSavedTemplates(reader(() => refusedView('boom')))).rejects.toThrow('boom');
  });

  it('asks for no counts when there are no templates', async () => {
    const rv = reader(() => ok([]));
    expect(await readSavedTemplates(rv)).toEqual([]);
    expect(rv.asked).toHaveLength(1);
  });
});

describe('findTemplateSavedFrom — the builder indicator', () => {
  it('looks the template up by the form it was copied from, not by name', async () => {
    const rv = reader(() => ok([{ ID: 't9' }]));
    expect(await findTemplateSavedFrom('f-1', rv)).toBe('t9');
    expect(rv.asked[0].ExtraFilter).toBe("IsTemplate = 1 AND TemplateSourceFormID='f-1'");
  });

  it('answers null — and logs — when the read fails', async () => {
    expect(await findTemplateSavedFrom('f-1', reader(() => refusedView('nope')))).toBeNull();
    expect(logged.join('\n')).toContain('f-1');
  });
});

describe('loadFormRecord', () => {
  it("reads the row with a view — not Load(), which would also fill its pages and screens", async () => {
    const rv = reader(() => ok([{ ID: 't1', Name: 'Intake' }]));
    expect(await loadFormRecord('t1', rv)).toEqual({ ID: 't1', Name: 'Intake' });
    expect(rv.asked).toEqual([expect.objectContaining({ ExtraFilter: "ID='t1'", ResultType: 'entity_object', MaxRows: 1 })]);
  });

  it('answers null — and logs — when the read fails', async () => {
    expect(await loadFormRecord('t1', reader(() => refusedView('boom')))).toBeNull();
    expect(logged.join('\n')).toContain('t1');
  });
});
