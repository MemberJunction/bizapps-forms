/**
 * The slice of an element `advancesOnEnter` reads. A real `Element` satisfies it; specs pass a
 * plain object, since this suite has no DOM.
 */
export interface EnterTarget {
  tagName: string;
  getAttribute(name: string): string | null;
}

/**
 * Input types whose Enter does nothing of its own. Every other control already gives Enter a
 * meaning — a button presses, a link follows, a textarea breaks a line, a choice selects, a file
 * input opens the picker — so an allow-list, not a deny-list: a control added later keeps its own
 * Enter instead of silently becoming "next".
 */
const SINGLE_LINE_TYPES = new Set([
  'text',
  'email',
  'tel',
  'url',
  'number',
  'search',
  'password',
  'date',
  'time',
  'datetime-local',
  'month',
  'week',
]);

/** True when Enter in `target` should move a one-question respondent forward. */
export function advancesOnEnter(target: EnterTarget | null): boolean {
  if (target?.tagName.toUpperCase() !== 'INPUT') {
    return false;
  }
  const type = (target.getAttribute('type') ?? 'text').toLowerCase();
  return SINGLE_LINE_TYPES.has(type);
}
