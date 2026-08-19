import { describe, expect, it } from 'vitest';
import type { PublishedFormDefinition, PublishedFormScreen } from '@mj-biz-apps/forms-entities';

import { availableScreens, resolveShownScreen, sameScreen, shownScreenFor } from './shown-screen';

function screen(overrides: Partial<PublishedFormScreen> = {}): PublishedFormScreen {
  return { id: 'e1', screenType: 'Ending', title: 'Thanks', displayOrder: 0, ...overrides };
}

function definition(overrides: Partial<PublishedFormDefinition> = {}): PublishedFormDefinition {
  return {
    formId: 'f1',
    formVersionId: 'v1',
    name: 'Test form',
    renderMode: 'Scroll',
    settings: {},
    styleTokens: { cssVariables: {} },
    pages: [],
    automations: [],
    endScreens: [],
    ...overrides,
  };
}

describe('availableScreens', () => {
  it('offers the questions and the built-in confirmation for a bare form', () => {
    // Not just "questions": a form with no authored endings still SHOWS something after a
    // submit, and an author styling their form has no other way to look at it.
    expect(availableScreens(definition())).toEqual([{ kind: 'questions' }, { kind: 'ending' }]);
  });

  it('offers a welcome screen only when the form has one', () => {
    const withWelcome = definition({
      welcomeScreen: screen({ id: 'w1', screenType: 'Welcome', title: 'Hello' }),
    });
    expect(availableScreens(withWelcome)[0]).toEqual({ kind: 'welcome' });
  });

  it('offers one entry per authored ending, in display order, and drops the built-in', () => {
    const def = definition({
      endScreens: [screen({ id: 'b', displayOrder: 2 }), screen({ id: 'a', displayOrder: 1 })],
    });
    expect(availableScreens(def)).toEqual([
      { kind: 'questions' },
      { kind: 'ending', screenId: 'a' },
      { kind: 'ending', screenId: 'b' },
    ]);
  });

  it('has nothing to offer without a definition', () => {
    expect(availableScreens(null)).toEqual([]);
  });
});

describe('resolveShownScreen', () => {
  it('maps the questions to the ready phase', () => {
    expect(resolveShownScreen(definition(), { kind: 'questions' })).toEqual({
      phase: 'ready',
      ending: undefined,
    });
  });

  it('maps an authored ending to the done phase carrying that screen', () => {
    const thanks = screen({ id: 'e1' });
    const def = definition({ endScreens: [thanks] });
    expect(resolveShownScreen(def, { kind: 'ending', screenId: 'e1' })).toEqual({
      phase: 'done',
      ending: thanks,
    });
  });

  it('maps the built-in confirmation to the done phase with no screen', () => {
    expect(resolveShownScreen(definition(), { kind: 'ending' })).toEqual({
      phase: 'done',
      ending: undefined,
    });
  });

  it('refuses a welcome screen the form does not have', () => {
    // The widget's template renders nothing for a welcome phase with no welcome screen, so
    // honouring this would blank the preview rather than report the mistake.
    expect(resolveShownScreen(definition(), { kind: 'welcome' })).toBeNull();
  });

  it('refuses an ending id the form does not have', () => {
    expect(resolveShownScreen(definition(), { kind: 'ending', screenId: 'gone' })).toBeNull();
  });
});

describe('shownScreenFor', () => {
  it('reports the questions while submitting, which still shows them', () => {
    expect(shownScreenFor('ready', undefined)).toEqual({ kind: 'questions' });
    expect(shownScreenFor('submitting', undefined)).toEqual({ kind: 'questions' });
  });

  it('reports the resolved ending once done', () => {
    expect(shownScreenFor('done', screen({ id: 'e2' }))).toEqual({ kind: 'ending', screenId: 'e2' });
  });

  it('reports the built-in confirmation when done resolved to no screen', () => {
    expect(shownScreenFor('done', undefined)).toEqual({ kind: 'ending' });
  });

  it('reports no screen while loading or failed', () => {
    expect(shownScreenFor('loading', undefined)).toBeNull();
    expect(shownScreenFor('error', undefined)).toBeNull();
  });
});

describe('sameScreen', () => {
  it('separates the built-in confirmation from an authored ending', () => {
    // Both are `kind: 'ending'`; only the id tells them apart, and a strip that confused them
    // would light the wrong chip on every form that has exactly one authored ending.
    expect(sameScreen({ kind: 'ending' }, { kind: 'ending', screenId: 'e1' })).toBe(false);
    expect(sameScreen({ kind: 'ending', screenId: 'e1' }, { kind: 'ending', screenId: 'e1' })).toBe(true);
  });

  it('treats a null selection as matching nothing', () => {
    expect(sameScreen(null, { kind: 'questions' })).toBe(false);
  });
});
