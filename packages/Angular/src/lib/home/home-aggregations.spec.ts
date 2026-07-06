import { describe, it, expect } from 'vitest';
import type { ActionParam } from '@memberjunction/actions-base';
import {
  buildFormRows,
  categoryNameMap,
  readFormIdFromParams,
  responseCountMap,
  sortByUpdatedDesc,
  toDate,
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

describe('readFormIdFromParams', () => {
  it('returns the FormID output param value', () => {
    const params: ActionParam[] = [
      { Name: 'Brief', Value: 'hi', Type: 'Input' },
      { Name: 'FormID', Value: 'new-form-id', Type: 'Output' },
    ];
    expect(readFormIdFromParams(params)).toBe('new-form-id');
  });

  it('accepts a Both-typed FormID', () => {
    const params: ActionParam[] = [{ Name: 'FormID', Value: 'x', Type: 'Both' }];
    expect(readFormIdFromParams(params)).toBe('x');
  });

  it('ignores a FormID that is an input param', () => {
    const params: ActionParam[] = [{ Name: 'FormID', Value: 'x', Type: 'Input' }];
    expect(readFormIdFromParams(params)).toBeNull();
  });

  it('returns null when absent or empty', () => {
    expect(readFormIdFromParams(undefined)).toBeNull();
    expect(readFormIdFromParams([])).toBeNull();
    expect(readFormIdFromParams([{ Name: 'FormID', Value: '', Type: 'Output' }])).toBeNull();
  });
});
