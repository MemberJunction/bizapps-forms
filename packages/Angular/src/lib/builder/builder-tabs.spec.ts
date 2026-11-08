/**
 * The builder's tab strip keyboard model (UI audit F12). The strip said role="tablist" but every
 * tab was its own Tab stop and the arrow keys did nothing; this is the APG tabs pattern with
 * automatic activation.
 */
import { describe, expect, it } from 'vitest';
import { BUILDER_TAB_ITEMS, tabAfterKey, tabElementId, tabPanelId } from './builder-tabs';

describe('tabAfterKey', () => {
  it('ArrowRight and ArrowLeft move to the neighbouring tab', () => {
    expect(tabAfterKey('build', 'ArrowRight')).toBe('design');
    expect(tabAfterKey('distribute', 'ArrowLeft')).toBe('design');
  });

  it('wraps at both ends', () => {
    expect(tabAfterKey('responses', 'ArrowRight')).toBe('build');
    expect(tabAfterKey('build', 'ArrowLeft')).toBe('responses');
  });

  it('Home and End go to the first and last tab', () => {
    expect(tabAfterKey('automate', 'Home')).toBe('build');
    expect(tabAfterKey('design', 'End')).toBe('responses');
  });

  it('any other key is not the strip\'s to handle', () => {
    for (const key of ['Enter', ' ', 'Tab', 'ArrowDown', 'a']) {
      expect(tabAfterKey('design', key)).toBeNull();
    }
  });
});

describe('the strip renders every builder tab, in URL order', () => {
  it('lists the same tabs as the ?view= codec, so a deep link and the strip cannot disagree', async () => {
    const { BUILDER_TABS } = await import('../shared/view-urls');
    expect(BUILDER_TAB_ITEMS.map((t) => t.tab)).toEqual([...BUILDER_TABS]);
  });
});

describe('ids', () => {
  it('pair each tab with its panel, scoped to one builder so two open records do not collide', () => {
    expect(tabElementId('fb7', 'design')).toBe('fb7-tab-design');
    expect(tabPanelId('fb7', 'design')).toBe('fb7-panel-design');
    expect(tabElementId('fb8', 'design')).not.toBe(tabElementId('fb7', 'design'));
  });
});
