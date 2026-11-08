import { BUILDER_TABS, type BuilderTab } from '../shared/view-urls';

/** One entry of the builder's tab strip. */
export interface BuilderTabItem {
  tab: BuilderTab;
  label: string;
  icon: string;
}

const LABELS: Record<BuilderTab, Omit<BuilderTabItem, 'tab'>> = {
  build: { label: 'Build', icon: 'fa-solid fa-list-check' },
  design: { label: 'Design', icon: 'fa-solid fa-palette' },
  distribute: { label: 'Distribute', icon: 'fa-solid fa-share-nodes' },
  automate: { label: 'Automate', icon: 'fa-solid fa-bolt' },
  responses: { label: 'Responses', icon: 'fa-solid fa-inbox' },
};

/** The strip, in the same order as the `?view=` codec, so a deep link and the strip agree. */
export const BUILDER_TAB_ITEMS: readonly BuilderTabItem[] = BUILDER_TABS.map((tab) => ({ tab, ...LABELS[tab] }));

/**
 * The tab a key press moves to, or null when the key is not the strip's to handle.
 *
 * APG tabs with automatic activation: opening a tab is cheap here (each pane is created on
 * activation), so focus and selection move together. The arrows wrap at the ends.
 */
export function tabAfterKey(current: BuilderTab, key: string): BuilderTab | null {
  const last = BUILDER_TABS.length - 1;
  const at = BUILDER_TABS.indexOf(current);
  switch (key) {
    case 'ArrowRight': return BUILDER_TABS[at === last ? 0 : at + 1];
    case 'ArrowLeft': return BUILDER_TABS[at === 0 ? last : at - 1];
    case 'Home': return BUILDER_TABS[0];
    case 'End': return BUILDER_TABS[last];
    default: return null;
  }
}

/**
 * Element ids for a tab and its panel. `scope` is unique per builder instance: Explorer keeps
 * several records open at once, and two builders must not both own `tab-design`.
 */
export function tabElementId(scope: string, tab: BuilderTab): string {
  return `${scope}-tab-${tab}`;
}

export function tabPanelId(scope: string, tab: BuilderTab): string {
  return `${scope}-panel-${tab}`;
}
