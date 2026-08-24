import { describe, it, expect } from 'vitest';
import { toDate } from '../shared/runview-dates';
import type { ActionParam } from '@memberjunction/actions-base';
import {
  buildFormRows,
  categoryNameMap,
  readFormIdFromResult,
  responseCountMap,
  sortByUpdatedDesc,
} from './home-aggregations';
import type {
  FormCategorySimpleRecord,
  FormResponseSimpleRecord,
  FormSimpleRecord,
  FormSummaryRow,
} from './home-models';

describe('toDate', () => {
  it('returns null for nullish input', () => {
    expect(toDate(null)).toBeNull();
    expect(toDate(undefined)).toBeNull();
  });

  it('passes through a Date instance', () => {
    const d = new Date('2026-01-02T03:04:05Z');
    expect(toDate(d)?.getTime()).toBe(d.getTime());
  });

  it('parses an ISO string', () => {
    expect(toDate('2026-01-02T03:04:05Z')?.getUTCFullYear()).toBe(2026);
  });

  it('returns null for an unparseable string', () => {
    expect(toDate('not-a-date')).toBeNull();
  });
});

describe('categoryNameMap / responseCountMap', () => {
  it('maps category ids to names', () => {
    const cats: FormCategorySimpleRecord[] = [
      { ID: 'c1', Name: 'Intake' },
      { ID: 'c2', Name: 'Survey' },
    ];
    const map = categoryNameMap(cats);
    expect(map.get('c1')).toBe('Intake');
    expect(map.get('c2')).toBe('Survey');
    expect(map.get('missing')).toBeUndefined();
  });

  it('counts responses per form', () => {
    const responses: FormResponseSimpleRecord[] = [
      { FormID: 'f1' },
      { FormID: 'f1' },
      { FormID: 'f2' },
    ];
    const counts = responseCountMap(responses);
    expect(counts.get('f1')).toBe(2);
    expect(counts.get('f2')).toBe(1);
    expect(counts.get('f3')).toBeUndefined();
  });
});

describe('buildFormRows', () => {
  const forms: FormSimpleRecord[] = [
    { ID: 'f1', Name: 'Alpha', Status: 'Draft', CategoryID: 'c1', __mj_UpdatedAt: '2026-01-01T00:00:00Z' },
    { ID: 'f2', Name: 'Beta', Status: 'Published', CategoryID: null, __mj_UpdatedAt: '2026-03-01T00:00:00Z' },
  ];
  const cats: FormCategorySimpleRecord[] = [{ ID: 'c1', Name: 'Intake' }];
  const responses: FormResponseSimpleRecord[] = [{ FormID: 'f2' }, { FormID: 'f2' }];

  it('resolves category names, counts and dates', () => {
    const rows = buildFormRows(forms, cats, responses);
    const alpha = rows.find((r) => r.id === 'f1')!;
    const beta = rows.find((r) => r.id === 'f2')!;
    expect(alpha.categoryName).toBe('Intake');
    expect(alpha.responseCount).toBe(0);
    expect(beta.categoryName).toBeNull();
    expect(beta.responseCount).toBe(2);
    expect(beta.updatedAt?.getUTCMonth()).toBe(2); // March
  });

  it('orders newest-updated first', () => {
    const rows = buildFormRows(forms, cats, responses);
    expect(rows[0].id).toBe('f2'); // March beats January
    expect(rows[1].id).toBe('f1');
  });
});

describe('sortByUpdatedDesc', () => {
  it('sorts undated rows last, then by name', () => {
    const rows: FormSummaryRow[] = [
      { id: 'a', name: 'Zed', status: 'Draft', categoryName: null, updatedAt: null, responseCount: 0 },
      { id: 'b', name: 'Amy', status: 'Draft', categoryName: null, updatedAt: null, responseCount: 0 },
      { id: 'c', name: 'Dated', status: 'Draft', categoryName: null, updatedAt: new Date('2026-05-01'), responseCount: 0 },
    ];
    const sorted = sortByUpdatedDesc(rows);
    expect(sorted[0].id).toBe('c'); // has a date
    expect(sorted[1].id).toBe('b'); // Amy before Zed
    expect(sorted[2].id).toBe('a');
  });
});

describe('readFormIdFromResult', () => {
  it('reads FormID out of the output collection the server actually returns', () => {
    // GraphQLActionClient.processActionResult puts OUTPUT params in `Result` (parsed from
    // ResultData) and sets `Params` to the caller's INPUTS. Captured live from a starter run.
    const result = {
      Success: true,
      Params: [{ Name: 'TemplateKey', Value: 'nps', Type: 'Input' as const }],
      Result: {
        '0': { Name: 'FormID', Value: '242E020F-D4FE-4D86-8B1B-B7729B802736', Type: 'Output' },
        '1': { Name: 'FormVersionID', Value: 'CBBA56BE-A89F-45BE-AEA3-0FE76660A24B', Type: 'Output' },
        '2': { Name: 'PageCount', Value: 1, Type: 'Output' },
      },
    };
    expect(readFormIdFromResult(result)).toBe('242E020F-D4FE-4D86-8B1B-B7729B802736');
  });
});
