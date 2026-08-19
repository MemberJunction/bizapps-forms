/**
 * The preview's screen strip: what to draw for each surface the form can show.
 *
 * Labelling lives here rather than in the widget because it is author-facing chrome — the
 * widget knows which screens exist (`core/shown-screen.ts`), this knows what to call them.
 */
import type { PublishedFormDefinition, PublishedFormScreen } from '@mj-biz-apps/forms-entities';

import { availableScreens, type ShownScreen } from '../widget/core/shown-screen';

/** One button in the strip. */
export interface ScreenChip {
  /** What clicking it asks the widget to show. */
  screen: ShownScreen;
  label: string;
  /** Font Awesome class. */
  icon: string;
  /** Tooltip: the full label, since the strip truncates, plus anything the label cannot say. */
  hint: string;
}

const ROLE_LABEL = { welcome: 'Welcome', questions: 'Questions', ending: 'Ending' } as const;

const ROLE_ICON = {
  welcome: 'fa-solid fa-flag',
  questions: 'fa-solid fa-list-ul',
  ending: 'fa-solid fa-circle-check',
} as const;

/** Said only where it applies, so the tooltip stays worth reading. */
const CONDITIONAL_HINT = 'shown only when the response matches a condition';

/**
 * Every surface, in respondent order, ready to render.
 *
 * Endings are labelled by their own title and everything else by its role. That asymmetry is
 * the whole information design of the strip: there is exactly one welcome screen and one
 * question flow, so their role IS their identity and a title would be a longer way of saying
 * the same thing — while endings come in fours and are told apart by nothing but their copy.
 */
export function screenChips(definition: PublishedFormDefinition | null): ScreenChip[] {
  const endingsById = new Map(
    (definition?.endScreens ?? []).map((e): [string, PublishedFormScreen] => [e.id, e]),
  );

  return availableScreens(definition).map((screen) => {
    const ending = screen.kind === 'ending' && screen.screenId ? endingsById.get(screen.screenId) : undefined;
    const label = ending?.title.trim() || ROLE_LABEL[screen.kind];
    return {
      screen,
      label,
      icon: ROLE_ICON[screen.kind],
      hint: ending?.conditionalRule ? `${label} — ${CONDITIONAL_HINT}` : label,
    };
  });
}
