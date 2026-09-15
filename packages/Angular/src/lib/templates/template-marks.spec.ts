import { describe, it, expect } from 'vitest';
import { templateMark, TEMPLATE_MARK_ICONS } from './template-marks';
import { STARTER_TEMPLATE_CATALOG } from '@mj-biz-apps/forms-entities';

describe('templateMark', () => {
  it('gives the same template the same mark every time it is asked', () => {
    const id = 'C4F48755-8380-4BF8-91BA-57E2A01D8D0E';
    expect(templateMark(id)).toEqual(templateMark(id));
  });
});

describe('the mark pool', () => {
  it('never reuses an icon a built-in starter already wears', () => {
    const starters = new Set(STARTER_TEMPLATE_CATALOG.map((s) => s.icon));
    for (const icon of TEMPLATE_MARK_ICONS) {
      expect(starters.has(icon), icon).toBe(false);
    }
  });
});

describe('mark spread', () => {
  it('spreads real GUIDs across the pool instead of clustering on one icon', () => {
    const ids = Array.from({ length: 200 }, (_, i) =>
      `${i.toString(16).padStart(8, '0')}-8380-4bf8-91ba-57e2a01d8d0e`,
    );
    const icons = new Set(ids.map((id) => templateMark(id).icon));
    const colors = new Set(ids.map((id) => templateMark(id).colorClass));
    expect(icons.size).toBe(TEMPLATE_MARK_ICONS.length);
    expect(colors.size).toBeGreaterThanOrEqual(6);
  });

  it('gives adjacent ids different marks, so two templates saved in a row do not look alike', () => {
    const a = templateMark('a1000000-0000-4000-8000-000000000001');
    const b = templateMark('a1000000-0000-4000-8000-000000000002');
    expect(a).not.toEqual(b);
  });
});
