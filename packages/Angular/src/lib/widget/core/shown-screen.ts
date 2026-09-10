/**
 * Which of the widget's surfaces is on display, and the mapping to the phase that shows it.
 *
 * A respondent reaches these in one direction only, by filling the form — which is exactly the
 * problem for an AUTHOR, who is styling all of them and cannot spend a submit to look at each.
 * A conditional ending is worse than inconvenient: it is effectively unreachable in a preview
 * unless you happen to answer the way its rule demands.
 *
 * Framework-free (no Angular, no signals) so the mapping is unit-testable on its own, matching
 * `submit-phase.ts` — the component wires these to its `phase` signal and owns nothing about
 * which screens exist.
 */
import type { PublishedFormDefinition, PublishedFormScreen } from '@mj-biz-apps/forms-entities';

import type { WidgetPhase } from './submit-phase';

/**
 * One of the widget's surfaces.
 *
 * `ending` covers both an authored ending screen (by id) and — with no id — the built-in
 * confirmation the widget falls back to when a form configures none. They are one kind because
 * they are one moment in the respondent's path and one phase in the widget; the id is the only
 * thing that differs, which is precisely what {@link sameScreen} compares.
 */
export type ShownScreen =
  | { kind: 'welcome' }
  | { kind: 'questions' }
  | { kind: 'ending'; screenId?: string };

/** The phase, and the ending to display in it, that a selection resolves to. */
export interface ScreenTarget {
  phase: WidgetPhase;
  ending: PublishedFormScreen | undefined;
}

/**
 * Every surface this definition can show, in the order a respondent meets them.
 *
 * The order is the point: the list is a map of the respondent's path, not a menu of features,
 * which is what lets a host render it as a strip an author reads left to right.
 */
export function availableScreens(definition: PublishedFormDefinition | null): ShownScreen[] {
  if (!definition) {
    return [];
  }
  const screens: ShownScreen[] = [];
  if (definition.welcomeScreen) {
    screens.push({ kind: 'welcome' });
  }
  screens.push({ kind: 'questions' });

  const endings = [...(definition.endScreens ?? [])].sort((a, b) => a.displayOrder - b.displayOrder);
  if (endings.length === 0) {
    // The built-in confirmation is a real surface with real copy, so it earns an entry rather
    // than leaving a form with no authored endings looking as though it just stops.
    screens.push({ kind: 'ending' });
  } else {
    screens.push(...endings.map((e): ShownScreen => ({ kind: 'ending', screenId: e.id })));
  }
  return screens;
}

/**
 * The phase that shows a selection, or `null` when this definition cannot show it.
 *
 * Returning null rather than a best-effort phase is deliberate: the widget renders NOTHING for
 * a welcome phase on a form with no welcome screen, so an unsatisfiable selection honoured
 * literally would blank the preview — a silent wrong answer in place of a refused one.
 */
export function resolveShownScreen(
  definition: PublishedFormDefinition,
  selection: ShownScreen,
): ScreenTarget | null {
  switch (selection.kind) {
    case 'welcome':
      return definition.welcomeScreen ? { phase: 'welcome', ending: undefined } : null;
    case 'questions':
      return { phase: 'ready', ending: undefined };
    case 'ending': {
      if (selection.screenId === undefined) {
        return { phase: 'done', ending: undefined };
      }
      const ending = (definition.endScreens ?? []).find((e) => e.id === selection.screenId);
      return ending ? { phase: 'done', ending } : null;
    }
  }
}

/**
 * The selection a live phase corresponds to, so a host can reflect where the widget actually
 * is rather than where it was last told to go.
 *
 * `submitting` reports the questions because that is what stays on screen through a submit —
 * a strip that blanked for the duration would flicker on every send. `expired` reports them for
 * the same reason: the expiry notice is an overlay, and the form is still there beneath it.
 */
export function shownScreenFor(
  phase: WidgetPhase,
  ending: PublishedFormScreen | undefined,
): ShownScreen | null {
  switch (phase) {
    case 'welcome':
      return { kind: 'welcome' };
    case 'ready':
    case 'submitting':
    case 'expired':
      return { kind: 'questions' };
    case 'done':
      return ending ? { kind: 'ending', screenId: ending.id } : { kind: 'ending' };
    case 'loading':
    case 'error':
      return null;
  }
}

/** Whether two selections name the same surface. `null` matches nothing, including itself. */
export function sameScreen(a: ShownScreen | null, b: ShownScreen | null): boolean {
  if (!a || !b) {
    return false;
  }
  if (a.kind !== b.kind) {
    return false;
  }
  return a.kind !== 'ending' || a.screenId === (b as { screenId?: string }).screenId;
}
